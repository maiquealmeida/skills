import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, test } from "node:test";
import { EXIT_UNTRUSTED } from "../lib/errors.mjs";
import { loadLayout } from "../lib/layout.mjs";
import { runPane } from "../lib/runner.mjs";
import { hashLayout, saveTrust, shortHash } from "../lib/trust.mjs";
import { createTempRepo, writeLayout } from "./helpers.mjs";

const ENTRY = fileURLToPath(new URL("../orca-layout.mjs", import.meta.url));
const IS_WINDOWS = process.platform === "win32";

const PRINT_SCRIPT = `
console.log("cwd=" + process.cwd());
console.log("FOO=" + process.env.FOO);
process.exit(Number(process.env.EXIT_WITH ?? 0));
`;

const GRACEFUL_SCRIPT = `
process.on("SIGINT", () => {
  console.log("graceful-begin");
  setTimeout(() => {
    console.log("graceful-done");
    process.exit(0);
  }, 400);
});
console.log("ready");
setInterval(() => {}, 1000);
`;

const LAYOUT = {
  panes: [
    { name: "printer", dir: "app", cmd: "node print.mjs", env: { FOO: "segredo-bar", EXIT_WITH: "7" } },
    { name: "graceful", dir: "app", cmd: "node graceful.mjs" },
    { name: "fantasma", dir: "nao-existe", cmd: "node print.mjs" },
    { name: "sem-comando", dir: "app", cmd: "comando-que-nao-existe-xyz" },
    { name: "fuga", dir: "app/fuga", cmd: "node print.mjs" },
  ],
};

const cleanups = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()();
});

/** Repositório com o layout de teste, já confirmado no diretório de estado isolado. */
function setupRepo({ trusted = true } = {}) {
  const { root, cleanup } = createTempRepo({ demo: LAYOUT }, ["app"]);
  const stateDir = mkdtempSync(join(tmpdir(), "orca-layout-state-"));
  const outside = mkdtempSync(join(tmpdir(), "orca-layout-outside-"));
  cleanups.push(cleanup, () => rmSync(stateDir, { recursive: true, force: true }), () => rmSync(outside, { recursive: true, force: true }));
  writeFileSync(join(root, "app", "print.mjs"), PRINT_SCRIPT);
  writeFileSync(join(root, "app", "graceful.mjs"), GRACEFUL_SCRIPT);
  if (!IS_WINDOWS) symlinkSync(outside, join(root, "app", "fuga"));

  const layoutFile = join(root, ".orca", "layouts", "demo.layout.json");
  const trustFile = join(stateDir, "trusted.json");
  const trust = () => {
    const { file, text } = loadLayout(root, "demo");
    saveTrust(trustFile, file, hashLayout(text));
  };
  if (trusted) trust();
  return { root, layoutFile, trustFile, trust, env: { ...process.env, ORCA_LAYOUT_STATE_DIR: stateDir } };
}

const runCli = (repo, index) =>
  spawnSync(process.execPath, [ENTRY, "run-pane", repo.layoutFile, String(index)], { encoding: "utf8", env: repo.env });

async function waitFor(predicate, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("tempo esgotado esperando a condição");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

describe("run-pane (processo real)", () => {
  test("aplica cwd e env, imprime os marcadores e propaga o código de saída", () => {
    const repo = setupRepo();
    const result = runCli(repo, 0);

    assert.equal(result.status, 7, result.stderr);
    for (const expected of [
      "[orca-layout] start printer · app",
      "[orca-layout] $ node print.mjs  (env: FOO, EXIT_WITH)",
      `cwd=${realpathSync(join(repo.root, "app"))}`,
      "FOO=segredo-bar",
      "[orca-layout] exit printer code=7",
    ]) {
      assert.ok(result.stdout.includes(expected), `faltou "${expected}" em:\n${result.stdout}`);
    }
  });

  test("o cabeçalho mostra os nomes das variáveis, nunca os valores", () => {
    const header = runCli(setupRepo(), 0)
      .stdout.split("\n")
      .filter((line) => line.startsWith("[orca-layout]"))
      .join("\n");
    assert.ok(!header.includes("segredo-bar"), header);
  });

  test("índice inexistente: erro claro e código 1", () => {
    const result = runCli(setupRepo(), 9);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Erro: O pane 9 não existe no layout "demo"/);
  });

  test("pasta do pane ausente: erro claro, sem iniciar nada", () => {
    const result = runCli(setupRepo(), 2);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Pasta do pane "fantasma" \(nao-existe\): a pasta não existe/);
    assert.ok(!result.stdout.includes("cwd="));
  });

  test("pasta que um link simbólico leva para fora do repositório: recusa sem iniciar nada", { skip: IS_WINDOWS }, () => {
    const result = runCli(setupRepo(), 4);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /a pasta resolve para fora do repositório/);
    assert.ok(!result.stdout.includes("cwd="));
  });

  test("layout que não está em .orca/layouts: erro de layout não encontrado", () => {
    const repo = setupRepo();
    const result = spawnSync(process.execPath, [ENTRY, "run-pane", join(repo.root, "solto.layout.json"), "0"], {
      encoding: "utf8",
      env: repo.env,
    });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Layout "solto" não encontrado/);
  });

  test("comando inexistente: o shell devolve 127 e o runner repassa", { skip: IS_WINDOWS }, () => {
    const result = runCli(setupRepo(), 3);
    assert.equal(result.status, 127);
    assert.ok(result.stdout.includes("[orca-layout] exit sem-comando code=127"));
  });

  test(
    "Ctrl+C no grupo de processos: o runner espera o projeto encerrar com elegância",
    { skip: IS_WINDOWS },
    async () => {
      const repo = setupRepo();
      // detached → grupo próprio, como o do terminal; kill(-pid) imita o Ctrl+C do terminal.
      const child = spawn(process.execPath, [ENTRY, "run-pane", repo.layoutFile, "1"], {
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: repo.env,
      });
      let output = "";
      child.stdout.on("data", (chunk) => {
        output += chunk;
      });
      const closed = new Promise((resolve) => child.on("close", (code) => resolve(code)));

      await waitFor(() => output.includes("ready"));
      process.kill(-child.pid, "SIGINT");
      const code = await closed;

      assert.equal(code, 0, output);
      assert.ok(output.includes("graceful-begin"), output);
      assert.ok(output.includes("graceful-done"), "o runner saiu antes do projeto terminar o shutdown");
      assert.ok(output.includes("[orca-layout] exit graceful code=0"), output);
    },
  );
});

describe("run-pane só executa layout confirmado", () => {
  test("layout nunca confirmado: recusa com código 3 e não inicia nada", () => {
    const repo = setupRepo({ trusted: false });
    const result = runCli(repo, 0);
    assert.equal(result.status, EXIT_UNTRUSTED, result.stderr);
    assert.match(result.stderr, /não está confirmado/);
    assert.ok(result.stderr.includes(`--trust ${shortHash(hashLayout(loadLayout(repo.root, "demo").text))}`));
    assert.ok(!result.stdout.includes("cwd="), "nada pode ter rodado");
  });

  test("layout alterado depois da confirmação (git pull, edição): a linha antiga do histórico não roda o conteúdo novo", () => {
    const repo = setupRepo();
    assert.equal(runCli(repo, 0).status, 7, "confirmado: roda");

    writeLayout(repo.root, "demo", {
      panes: [{ name: "printer", dir: "app", cmd: "node -e \"console.log('CONTEÚDO NOVO')\"", env: { EXIT_WITH: "0" } }],
    });
    const result = runCli(repo, 0);
    assert.equal(result.status, EXIT_UNTRUSTED);
    assert.ok(!result.stdout.includes("CONTEÚDO NOVO"), "o conteúdo não confirmado não pode executar");
  });

  test("voltar ao conteúdo confirmado volta a funcionar", () => {
    const repo = setupRepo();
    const original = JSON.stringify(LAYOUT, null, 2);
    writeLayout(repo.root, "demo", { panes: [{ name: "x", cmd: "echo oi" }] });
    assert.equal(runCli(repo, 0).status, EXIT_UNTRUSTED);
    writeLayout(repo.root, "demo", original);
    assert.equal(runCli(repo, 0).status, 7);
  });

  test("a confiança é por arquivo: o mesmo conteúdo em outro repositório não herda", () => {
    const first = setupRepo();
    const second = setupRepo({ trusted: false });
    second.env = { ...second.env, ORCA_LAYOUT_STATE_DIR: first.env.ORCA_LAYOUT_STATE_DIR };
    assert.equal(runCli(first, 0).status, 7);
    assert.equal(runCli(second, 0).status, EXIT_UNTRUSTED);
  });
});

describe("runPane (com processo falso)", () => {
  const fakeChild = (emit) => {
    const child = new EventEmitter();
    child.kill = () => true;
    queueMicrotask(() => emit(child));
    return child;
  };

  test("término por sinal vira 128 + número do sinal", async () => {
    const repo = setupRepo();
    const lines = [];
    const code = await runPane(repo.layoutFile, "1", {
      trustFile: repo.trustFile,
      spawnChild: () => fakeChild((child) => child.emit("close", null, "SIGTERM")),
      write: (line) => lines.push(line),
    });
    assert.equal(code, 143);
    assert.ok(lines.at(-1).endsWith("code=143"));
  });

  test("falha ao iniciar vira 127 com a mensagem", async () => {
    const repo = setupRepo();
    const lines = [];
    const code = await runPane(repo.layoutFile, "1", {
      trustFile: repo.trustFile,
      spawnChild: () => fakeChild((child) => child.emit("error", new Error("spawn ENOENT"))),
      write: (line) => lines.push(line),
    });
    assert.equal(code, 127);
    assert.ok(lines.some((line) => line.includes("não consegui iniciar o comando: spawn ENOENT")));
  });

  test("inicia com cwd do pane, env mesclado, shell e terminal herdado", async () => {
    const repo = setupRepo();
    let received;
    await runPane(repo.layoutFile, "0", {
      trustFile: repo.trustFile,
      spawnChild: (command, options) => {
        received = { command, options };
        return fakeChild((child) => child.emit("close", 0, null));
      },
      write: () => {},
    });
    assert.equal(received.command, "node print.mjs");
    assert.equal(received.options.cwd, join(repo.root, "app"));
    assert.equal(received.options.shell, true);
    assert.equal(received.options.stdio, "inherit");
    assert.equal(received.options.env.FOO, "segredo-bar");
    assert.equal(received.options.env.PATH, process.env.PATH);
  });

  test("remove os handlers de sinal ao terminar (sem vazar listeners)", async () => {
    const repo = setupRepo();
    const signals = ["SIGINT", "SIGTERM", "SIGHUP"];
    const before = signals.map((signal) => process.listenerCount(signal));
    await runPane(repo.layoutFile, "1", {
      trustFile: repo.trustFile,
      spawnChild: () => fakeChild((child) => child.emit("close", 0, null)),
      write: () => {},
    });
    assert.deepEqual(
      signals.map((signal) => process.listenerCount(signal)),
      before,
    );
  });

  test("relé de sinais: POSIX registra SIGINT, SIGTERM e SIGHUP; Windows não registra SIGHUP", async () => {
    const repo = setupRepo();
    for (const [platform, expectsHangup] of [
      ["linux", true],
      ["win32", false],
    ]) {
      const baseline = ["SIGINT", "SIGTERM", "SIGHUP"].map((signal) => process.listenerCount(signal));
      let during;
      await runPane(repo.layoutFile, "1", {
        trustFile: repo.trustFile,
        platform,
        spawnChild: () =>
          fakeChild((child) => {
            during = ["SIGINT", "SIGTERM", "SIGHUP"].map((signal) => process.listenerCount(signal));
            child.emit("close", 0, null);
          }),
        write: () => {},
      });
      assert.equal(during[0], baseline[0] + 1, `${platform}: SIGINT é absorvido`);
      assert.equal(during[1], baseline[1] + 1, `${platform}: SIGTERM é repassado`);
      assert.equal(during[2], baseline[2] + (expectsHangup ? 1 : 0), `${platform}: SIGHUP`);
    }
  });

  test("POSIX: SIGTERM recebido pelo runner é repassado ao projeto", async () => {
    const repo = setupRepo();
    const killed = [];
    await runPane(repo.layoutFile, "1", {
      trustFile: repo.trustFile,
      platform: "linux",
      spawnChild: () => {
        const child = new EventEmitter();
        child.kill = (signal) => {
          killed.push(signal);
          return true;
        };
        queueMicrotask(() => {
          // Num sinal real o Node passa o nome do sinal ao handler; `emit` à mão não passa.
          process.emit("SIGTERM", "SIGTERM");
          child.emit("close", null, "SIGTERM");
        });
        return child;
      },
      write: () => {},
    });
    assert.deepEqual(killed, ["SIGTERM"]);
  });
});
