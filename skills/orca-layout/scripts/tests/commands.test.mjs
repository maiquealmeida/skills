import assert from "node:assert/strict";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, test } from "node:test";
import {
  hasFinished,
  lastMarker,
  renderPlan,
  runDoctor,
  runDown,
  runList,
  runPlan,
  runUp,
} from "../lib/commands.mjs";
import { CliError, EXIT_INTERRUPTED, EXIT_UNTRUSTED } from "../lib/errors.mjs";
import { loadLayout } from "../lib/layout.mjs";
import { buildPaneCommand } from "../lib/orca.mjs";
import { EXIT_MARKER, START_MARKER } from "../lib/runner.mjs";
import { hashLayout, isTrusted, saveTrust, shortHash } from "../lib/trust.mjs";
import {
  FOUR_PANE_DIRS,
  argAfter,
  createFakeOrca,
  createTempRepo,
  createTestContext,
  fourPaneLayout,
  writeLayout,
} from "./helpers.mjs";

const IS_WINDOWS = process.platform === "win32";

const cleanups = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()();
});

/** Repositório + Orca falso + contexto, com limpeza automática. */
function setup({ layouts = { default: fourPaneLayout() }, dirs = FOUR_PANE_DIRS, orcaOptions, platform, scriptPath } = {}) {
  const repo = createTempRepo(layouts, dirs);
  const stateDir = mkdtempSync(join(tmpdir(), "orca-layout-state-"));
  const trustFile = join(stateDir, "trusted.json");
  const orca = createFakeOrca(orcaOptions);
  const harness = createTestContext({ root: repo.root, orca, platform, trustFile, scriptPath });
  cleanups.push(repo.cleanup, () => rmSync(stateDir, { recursive: true, force: true }));
  return { ...harness, orca, root: repo.root, trustFile };
}

/** Marca o conteúdo atual do layout como já confirmado. */
function trustNow({ root, trustFile }, name = "default") {
  const { file, text } = loadLayout(root, name);
  saveTrust(trustFile, file, hashLayout(text));
}

/** O hash curto que o plano mostra e o `--trust` repete. */
const hashOf = ({ root }, name = "default") => shortHash(hashLayout(loadLayout(root, name).text));

const callsOf = (orca, key) => orca.calls.filter((args) => args.slice(0, 2).join(" ") === key);

describe("renderPlan", () => {
  test("mostra comandos, grade, hash e a situação de confiança", () => {
    const { root } = setup();
    const loaded = loadLayout(root, "default");
    const hash = hashLayout(loaded.text);
    const text = renderPlan(loaded, { trusted: false, hash });
    for (const expected of [
      'Layout "default" · aba "Dev Teste [default]" · 4 pane(s)',
      `Hash: ${shortHash(hash)}`,
      "1. api — src/api",
      "$ PORT=5101 dotnet run",
      "[1] api  |  [2] bff",
      "[3] auth  |  [4] worker",
      "NÃO confiável",
    ]) {
      assert.ok(text.includes(expected), `faltou "${expected}" em:\n${text}`);
    }
    assert.ok(renderPlan(loaded, { trusted: true, hash }).includes("Confiança: confiável"));
  });

  test("destaca env que muda o que roda sem aparecer no comando", () => {
    const { root } = setup({
      layouts: {
        default: {
          panes: [
            { name: "a", cmd: "yarn dev", env: { NODE_OPTIONS: "--require ./x.js", LD_PRELOAD: "/tmp/x.so", PORT: "3000" } },
          ],
        },
      },
      dirs: [],
    });
    const loaded = loadLayout(root, "default");
    const text = renderPlan(loaded, { trusted: false, hash: hashLayout(loaded.text) });
    assert.match(text, /⚠ env que muda o que roda sem aparecer no comando: NODE_OPTIONS, LD_PRELOAD/);
    assert.ok(!/⚠.*PORT/.test(text), "PORT é inofensiva");
  });
});

describe("runUp: confirmação do layout", () => {
  test("sem --trust: mostra o plano com o hash, sai com código 3 e não toca no Orca", async () => {
    const h = setup();
    await assert.rejects(
      () => runUp(h.ctx, "default"),
      (error) =>
        error instanceof CliError &&
        error.exitCode === EXIT_UNTRUSTED &&
        error.message.includes(`up default --trust ${hashOf(h)}`),
    );
    assert.equal(h.orca.calls.length, 0);
    assert.ok(h.logs.join("\n").includes(`Hash: ${hashOf(h)}`));
  });

  test("--trust com o hash revisado: abre a aba e grava a confiança", async () => {
    const h = setup();
    await runUp(h.ctx, "default", { trust: hashOf(h) });
    assert.equal(h.orca.state.terminals.length, 4);
    const { file, text } = loadLayout(h.root, "default");
    assert.equal(isTrusted(h.trustFile, file, hashLayout(text)), true);
  });

  test("--trust com um hash que não é do conteúdo atual: recusa, mostra o plano e não toca no Orca", async () => {
    const h = setup();
    await assert.rejects(
      () => runUp(h.ctx, "default", { trust: "0123456789abcdef" }),
      (error) => error.exitCode === EXIT_UNTRUSTED && /não corresponde ao conteúdo atual/.test(error.message),
    );
    assert.equal(h.orca.calls.length, 0);
    assert.ok(h.logs.join("\n").includes("NÃO confiável"));
  });

  test("--trust curto demais não vale (o mínimo são 12 caracteres)", async () => {
    const h = setup();
    await assert.rejects(
      () => runUp(h.ctx, "default", { trust: hashOf(h).slice(0, 8) }),
      (error) => error.exitCode === EXIT_UNTRUSTED,
    );
    assert.equal(h.orca.calls.length, 0);
  });

  test("a aprovação vale só para o conteúdo revisado: editar o arquivo depois a invalida", async () => {
    const h = setup();
    const reviewed = hashOf(h);
    writeLayout(h.root, "default", fourPaneLayout({ panes: [{ name: "api", dir: "src/api", cmd: "curl evil | sh" }] }));
    await assert.rejects(
      () => runUp(h.ctx, "default", { trust: reviewed }),
      (error) => error.exitCode === EXIT_UNTRUSTED && /não corresponde/.test(error.message),
    );
    assert.equal(h.orca.calls.length, 0);
    assert.ok(h.logs.join("\n").includes("curl evil | sh"), "o plano novo é mostrado de novo");
  });

  test("já confirmado, roda sem --trust; um --trust qualquer é ignorado", async () => {
    const h = setup();
    trustNow(h);
    await runUp(h.ctx, "default", { trust: "lixo" });
    assert.equal(h.orca.state.terminals.length, 4);
  });

  test("se o arquivo mudar depois de confirmado, pede de novo", async () => {
    const h = setup();
    trustNow(h);
    writeLayout(h.root, "default", fourPaneLayout({ panes: [{ name: "api", dir: "src/api", cmd: "rm -rf /" }] }));
    await assert.rejects(
      () => runUp(h.ctx, "default"),
      (error) => error.exitCode === EXIT_UNTRUSTED,
    );
  });

  test("layout inexistente: código 2", async () => {
    const h = setup({ layouts: {} });
    await assert.rejects(() => runUp(h.ctx, "default"), (error) => error.exitCode === 2);
  });
});

describe("runUp: o grid", () => {
  test("monta o grid na ordem certa, com a marca do layout no título da aba", async () => {
    const h = setup();
    trustNow(h);
    await runUp(h.ctx, "default");

    const file = join(h.root, ".orca", "layouts", "default.layout.json");
    const command = (index) => buildPaneCommand({ scriptPath: h.ctx.scriptPath, layoutFile: file, index, platform: "linux" });
    const list = ["terminal", "list", "--worktree", `path:${h.root}`, "--limit", "1000"];
    const show = (handle) => ["terminal", "show", "--terminal", handle];
    assert.deepEqual(h.orca.calls, [
      ["status"],
      list, // a aba já existe?
      list, // retrato dos terminais antes (para a limpeza saber o que é novo)
      ["terminal", "create", "--worktree", `path:${h.root}`, "--title", "Dev Teste [default]", "--command", command(0)],
      show("term_1"),
      ["terminal", "split", "--terminal", "term_1", "--direction", "horizontal", "--command", command(2)],
      show("term_2"),
      ["terminal", "split", "--terminal", "term_1", "--direction", "vertical", "--command", command(1)],
      show("term_3"),
      ["terminal", "split", "--terminal", "term_2", "--direction", "vertical", "--command", command(3)],
      show("term_4"),
      ["terminal", "switch", "--terminal", "term_1"],
    ]);
  });

  test("a posição FÍSICA dos panes é a ordem de leitura do layout (4 panes, 2 colunas: duas linhas de dois)", async () => {
    const h = setup();
    trustNow(h);
    await runUp(h.ctx, "default");
    assert.deepEqual(h.orca.gridIndexes(), [[0, 1], [2, 3]]);
  });

  for (const [panes, columns, expected] of [
    [3, 2, [[0, 1], [2]]],
    [4, 1, [[0], [1], [2], [3]]],
    [4, 3, [[0, 1, 2], [3]]],
    [5, 2, [[0, 1], [2, 3], [4]]],
    [1, 2, [[0]]],
  ]) {
    test(`posição física: ${panes} panes em ${columns} coluna(s)`, async () => {
      const layout = {
        columns,
        panes: Array.from({ length: panes }, (_, i) => ({ name: `p${i}`, cmd: "x" })),
      };
      const h = setup({ layouts: { default: layout }, dirs: [] });
      trustNow(h);
      await runUp(h.ctx, "default");
      assert.deepEqual(h.orca.gridIndexes(), expected);
    });
  }

  test("nunca usa --focus no create (o Orca estoura o tempo quando a UI está ocupada)", async () => {
    const h = setup();
    trustNow(h);
    await runUp(h.ctx, "default");
    assert.equal(h.orca.calls.flat().includes("--focus"), false);
  });

  test("não conseguir revelar a aba é só um aviso: o grid já está de pé", async () => {
    const h = setup({ orcaOptions: { failWhen: (args) => args[1] === "switch" } });
    trustNow(h);
    await runUp(h.ctx, "default");
    assert.equal(h.orca.state.terminals.length, 4);
    assert.match(h.warnings.join("\n"), /não consegui trazer a aba para a frente/);
    assert.ok(h.logs.join("\n").includes("aberta com 4 pane(s)"));
  });

  test("aba do layout já aberta (pela marca): recusa sem criar nada", async () => {
    const h = setup({ orcaOptions: { terminals: [{ handle: "t1", tabId: "tab_a", title: "Qualquer título [default]" }] } });
    trustNow(h);
    await assert.rejects(() => runUp(h.ctx, "default"), /já está aberta.*down/s);
    assert.equal(callsOf(h.orca, "terminal create").length, 0);
  });

  test("aba do usuário com o título cru, ou de outro layout, não conta como aberta", async () => {
    const h = setup({
      orcaOptions: {
        terminals: [
          { handle: "t1", tabId: "tab_a", title: "Dev Teste" },
          { handle: "t2", tabId: "tab_b", title: "Terminal 2" },
          { handle: "t3", tabId: "tab_c", title: "Dev Teste [my-default]" },
        ],
      },
    });
    trustNow(h);
    await runUp(h.ctx, "default");
    assert.equal(callsOf(h.orca, "terminal create").length, 1);
  });

  test("lista de terminais truncada pelo Orca: recusa agir sobre uma lista incompleta", async () => {
    const h = setup({ orcaOptions: { truncateList: true } });
    trustNow(h);
    await assert.rejects(() => runUp(h.ctx, "default"), /só parte dos terminais deste worktree/);
    assert.equal(callsOf(h.orca, "terminal create").length, 0);
  });

  test("pasta inexistente: erro antes de falar com o Orca", async () => {
    const h = setup({ dirs: ["src/api"] });
    trustNow(h);
    await assert.rejects(() => runUp(h.ctx, "default"), /Pastas com problema[\s\S]*bff \(src\/bff\): a pasta não existe/);
    assert.equal(h.orca.calls.length, 0);
  });

  test("pasta que um link simbólico leva para fora do repo: recusa antes do Orca", { skip: IS_WINDOWS }, async () => {
    const h = setup({ dirs: ["src/api"] });
    const outside = mkdtempSync(join(tmpdir(), "orca-layout-outside-"));
    cleanups.push(() => rmSync(outside, { recursive: true, force: true }));
    writeLayout(h.root, "default", { panes: [{ name: "fuga", dir: "src/fuga", cmd: "x" }] });
    symlinkSync(outside, join(h.root, "src", "fuga"));
    trustNow(h);
    await assert.rejects(() => runUp(h.ctx, "default"), /fuga \(src\/fuga\): a pasta resolve para fora do repositório/);
    assert.equal(h.orca.calls.length, 0);
  });

  test("Orca fora do ar: mensagem com a saída", async () => {
    const h = setup({ orcaOptions: { failWhen: (args) => args[0] === "status" } });
    trustNow(h);
    await assert.rejects(() => runUp(h.ctx, "default"), /não está acessível.*orca open/s);
  });

  test("um pane só: apenas o create", async () => {
    const h = setup({ layouts: { default: { panes: [{ name: "web", cmd: "yarn dev" }] } }, dirs: [] });
    trustNow(h);
    await runUp(h.ctx, "default");
    assert.equal(callsOf(h.orca, "terminal create").length, 1);
    assert.equal(callsOf(h.orca, "terminal split").length, 0);
  });

  test("Windows: caminho do script com espaço vai entre aspas duplas e com /", async () => {
    const scriptPath = "C:\\Users\\Maique Almeida\\.agents\\skills\\orca-layout\\scripts\\orca-layout.mjs";
    const h = setup({ platform: "win32", scriptPath });
    trustNow(h);
    await runUp(h.ctx, "default");
    const command = argAfter(callsOf(h.orca, "terminal create")[0], "--command");
    assert.ok(
      command.startsWith('node "C:/Users/Maique Almeida/.agents/skills/orca-layout/scripts/orca-layout.mjs" run-pane '),
      command,
    );
  });

  test("resumo: lista os panes e diz como encerrar (com o nome quando não é o default)", async () => {
    const h = setup({ layouts: { backend: fourPaneLayout() } });
    trustNow(h, "backend");
    await runUp(h.ctx, "backend");
    const output = h.logs.join("\n");
    assert.ok(output.includes('Aba "Dev Teste [backend]" aberta com 4 pane(s)'));
    assert.ok(output.includes("1. api     src/api"));
    assert.ok(output.includes("Para encerrar: node /skills/orca-layout/scripts/orca-layout.mjs down backend"));
  });

  test("encaixe demorado mas bem-sucedido: espera sem falhar", async () => {
    const h = setup({ orcaOptions: { adoptionDelayChecks: 2 } });
    trustNow(h);
    await runUp(h.ctx, "default");
    assert.equal(h.orca.state.terminals.length, 4);
    assert.equal(h.elapsed(), 2000, "2 esperas de 250 ms para cada um dos 4 panes");
  });

  test("Orca sem paneRuntimeId: só aceita o pane depois de um tempo seguro sem virar órfão", async () => {
    const h = setup({
      layouts: { default: { panes: [{ name: "web", cmd: "yarn dev" }] } },
      dirs: [],
      orcaOptions: { legacyNoRuntimeId: true },
    });
    trustNow(h);
    await runUp(h.ctx, "default");
    assert.equal(h.elapsed(), 3000);
  });
});

describe("runUp: tudo ou nada", () => {
  test("falha no meio do grid: para na hora e fecha o que já tinha aberto", async () => {
    let splits = 0;
    const h = setup({
      orcaOptions: { failWhen: (args) => args[1] === "split" && (splits += 1) === 2 },
    });
    trustNow(h);
    await assert.rejects(() => runUp(h.ctx, "default"), /falha simulada[\s\S]*Tudo o que foi aberto foi fechado/);
    assert.equal(callsOf(h.orca, "terminal split").length, 2, "só o split que falhou, e nenhum depois dele");
    assert.equal(h.orca.state.terminals.length, 0, "nada pode ter sobrado");
    assert.ok(callsOf(h.orca, "terminal close").at(-1).includes("--tab"), "a aba é fechada por último, com --tab");
  });

  test("terminal criado pelo Orca mas sem handle devolvido (timeout): a varredura o encontra e fecha", async () => {
    const h = setup({ orcaOptions: { failAfterCreate: (args) => args[1] === "split" } });
    trustNow(h);
    await assert.rejects(
      () => runUp(h.ctx, "default"),
      /Timed out waiting for terminal handle[\s\S]*Tudo o que foi aberto foi fechado/,
    );
    assert.equal(h.orca.state.terminals.length, 0, "o terminal sem handle não pode ficar rodando escondido");
  });

  test("erro inesperado (não do Orca): ainda assim fecha o que abriu e repassa o erro original", async () => {
    const h = setup({ orcaOptions: { crashWhen: (args) => args[1] === "split" } });
    trustNow(h);
    await assert.rejects(() => runUp(h.ctx, "default"), /erro inesperado simulado/);
    assert.equal(h.orca.state.terminals.length, 0);
  });

  test("Ctrl+C durante o up: interrompe, desfaz o que abriu e sai com 130", async () => {
    let fired = false;
    const h = setup({
      orcaOptions: {
        onCall: (args) => {
          if (args[1] === "split" && !fired) {
            fired = true;
            process.emit("SIGINT");
          }
        },
      },
    });
    trustNow(h);
    const before = process.listenerCount("SIGINT");
    await assert.rejects(
      () => runUp(h.ctx, "default"),
      (error) => error instanceof CliError && error.exitCode === EXIT_INTERRUPTED && /Tudo o que foi aberto foi fechado/.test(error.message),
    );
    assert.equal(h.orca.state.terminals.length, 0);
    assert.equal(process.listenerCount("SIGINT"), before, "os handlers de sinal são removidos");
  });

  test("a limpeza só fecha o que é do up: terminais que o usuário abriu no meio ficam intactos", async () => {
    let created = false;
    const holder = {};
    const h = setup({
      orcaOptions: {
        orphanSplits: true,
        onCall: (args) => {
          if (args[1] === "create" && !created) {
            created = true;
            holder.orca.state.terminals.push({ handle: "user_new", tabId: "tab_user", title: "Terminal 3", output: [] });
          }
        },
      },
    });
    holder.orca = h.orca;
    h.orca.state.terminals.push({ handle: "user_old", tabId: "tab_old", title: "Terminal 1", output: [] });
    trustNow(h);
    await assert.rejects(() => runUp(h.ctx, "default"), /não o encaixou na aba/);
    assert.deepEqual(h.orca.state.terminals.map((terminal) => terminal.handle).sort(), ["user_new", "user_old"]);
  });

  test("janela do Orca sem pintar (PTYs órfãos): detecta, fecha tudo e explica", async () => {
    // O pane parece encaixado por um instante (-1 = pendente) e só então o Orca o declara órfão.
    const h = setup({ orcaOptions: { orphanSplits: true, adoptionDelayChecks: 1 } });
    trustNow(h);
    await assert.rejects(
      () => runUp(h.ctx, "default"),
      /pane "auth", mas não o encaixou na aba[\s\S]*tela bloqueada[\s\S]*Tudo o que foi aberto foi fechado/,
    );
    assert.equal(callsOf(h.orca, "terminal split").length, 1, "não pode continuar criando panes escondidos");
    assert.equal(h.orca.state.terminals.length, 0, "nem o órfão nem a aba podem sobrar");
    assert.equal(h.elapsed(), 500, "desiste assim que o Orca declara o órfão, sem esperar o teto");
    assert.deepEqual(h.warnings, []);
    assert.equal(callsOf(h.orca, "terminal switch").length, 0, "não revela uma aba que foi desfeita");
  });

  test("pane que fica pendente para sempre: desiste no teto e fecha tudo", async () => {
    const h = setup({ orcaOptions: { neverAttach: true } });
    trustNow(h);
    await assert.rejects(() => runUp(h.ctx, "default"), /pane "api", mas não o encaixou na aba[\s\S]*Tudo o que foi aberto foi fechado/);
    assert.ok(h.elapsed() >= 6000);
    assert.equal(h.orca.state.terminals.length, 0);
  });

  test("Orca sem paneRuntimeId que vira órfão dentro do tempo seguro: falha", async () => {
    const h = setup({ orcaOptions: { legacyNoRuntimeId: true, orphanSplits: true, adoptionDelayChecks: 2 } });
    trustNow(h);
    await assert.rejects(() => runUp(h.ctx, "default"), /não o encaixou na aba/);
  });

  test("se o fechamento falha, lista exatamente o que sobrou e como fechar", async () => {
    const h = setup({ orcaOptions: { orphanSplits: true, failWhen: (args) => args[1] === "close" } });
    trustNow(h);
    await assert.rejects(
      () => runUp(h.ctx, "default"),
      /Sobraram terminais abertos[\s\S]*orca terminal close --terminal term_1[\s\S]*orca terminal close --terminal term_2/,
    );
    assert.match(h.warnings.join("\n"), /não consegui fechar term_/);
  });

  test("se nem dá para conferir o que sobrou, diz isso em vez de afirmar que fechou tudo", async () => {
    const h = setup({
      orcaOptions: { orphanSplits: true, failWhen: (args, number) => args[1] === "list" && number > 6 },
    });
    trustNow(h);
    await assert.rejects(
      () => runUp(h.ctx, "default"),
      (error) => /Não consegui conferir se tudo foi fechado/.test(error.message) && !/Tudo o que foi aberto/.test(error.message),
    );
  });
});

describe("lastMarker e hasFinished", () => {
  const start = `${START_MARKER} api · src/api`;
  const exit = `${EXIT_MARKER} api code=130`;
  const cases = [
    ["scrollback vazio: sem marcador não dá para afirmar nada", [], null, false],
    ["só ruído (o início rolou para fora da janela)", ["log 1", "log 2"], null, false],
    ["projeto rodando", [start], "start", false],
    ["projeto encerrado", [start, exit], "exit", true],
    ["só o marcador de saída", [exit], "exit", true],
    ["reiniciado depois de encerrar", [start, exit, start], "start", false],
    ["marcador no meio de códigos de cor", [`\u001b[2m${start}\u001b[0m`, "log qualquer"], "start", false],
  ];
  for (const [label, lines, marker, finished] of cases) {
    test(label, () => {
      assert.equal(lastMarker(lines), marker);
      assert.equal(hasFinished(lines), finished);
    });
  }
});

describe("runDown", () => {
  const tab = (id, handles, title = "Dev Teste [default]") => handles.map((handle) => ({ handle, tabId: id, title }));

  test("sem aba aberta: avisa e não faz nada (nem precisa do arquivo do layout)", async () => {
    const h = setup({ layouts: {} });
    await runDown(h.ctx, "default");
    assert.deepEqual(h.logs, ['Nenhuma aba do layout "default" aberta neste worktree.']);
    assert.equal(callsOf(h.orca, "terminal send").length, 0);
  });

  test("Ctrl+C em todos os panes, espera, e fecha a aba uma vez (nunca com --all)", async () => {
    const h = setup({ orcaOptions: { terminals: tab("tab_a", ["t1", "t2", "t3", "t4"]) } });
    await runDown(h.ctx, "default");

    assert.equal(callsOf(h.orca, "terminal send").length, 4);
    for (const args of callsOf(h.orca, "terminal send")) assert.ok(args.includes("--interrupt"));
    const closes = callsOf(h.orca, "terminal close");
    assert.equal(closes.length, 1);
    assert.ok(closes[0].includes("--tab"));
    assert.equal(h.orca.calls.flat().includes("--all"), false);

    const kinds = h.orca.calls.map((args) => args.slice(0, 2).join(" "));
    assert.ok(kinds.lastIndexOf("terminal send") < kinds.indexOf("terminal close"), "o Ctrl+C vem antes de fechar");
    assert.equal(h.orca.state.terminals.length, 0);
  });

  test("espera os projetos terminarem (relógio falso) e não mais que isso", async () => {
    const h = setup({ orcaOptions: { terminals: tab("tab_a", ["t1", "t2"]), finishAfterReads: 2 } });
    await runDown(h.ctx, "default");
    assert.equal(h.elapsed(), 2000);
    assert.deepEqual(h.warnings, []);
  });

  test("projeto falante, com o marcador de início fora das últimas 120 linhas: ainda espera o encerramento", async () => {
    const h = setup({ orcaOptions: { terminals: tab("tab_a", ["t1", "t2"]), chatty: true, finishAfterReads: 2 } });
    await runDown(h.ctx, "default");
    assert.equal(h.elapsed(), 2000, "não pode fechar de imediato por não achar o marcador");
    assert.equal(callsOf(h.orca, "terminal close").length, 1);
    assert.ok(
      callsOf(h.orca, "terminal read").some((args) => args.includes("--cursor")),
      "a espera lê só a saída nova, por cursor",
    );
  });

  test("pane que já tinha encerrado: não recebe Ctrl+C e não atrasa o down", async () => {
    const h = setup({ orcaOptions: { terminals: tab("tab_a", ["t1", "t2"]), alreadyExited: true } });
    await runDown(h.ctx, "default");
    assert.equal(callsOf(h.orca, "terminal send").length, 0);
    assert.equal(h.elapsed(), 0);
    assert.equal(callsOf(h.orca, "terminal close").length, 1);
    assert.ok(!h.logs.join("\n").includes("Ctrl+C enviado"));
  });

  test("projeto que não encerra: avisa, respeita o prazo e fecha mesmo assim", async () => {
    const h = setup({ orcaOptions: { terminals: tab("tab_a", ["t1"]), neverFinish: true } });
    await runDown(h.ctx, "default", { graceSeconds: 3 });
    assert.equal(h.elapsed(), 3000);
    assert.match(h.warnings.join("\n"), /nem todos os projetos encerraram em 3s/);
    assert.equal(callsOf(h.orca, "terminal close").length, 1);
  });

  test("erro transitório do Orca na espera NÃO conta como 'terminou': continua esperando", async () => {
    let transient = 2;
    const h = setup({
      orcaOptions: {
        terminals: tab("tab_a", ["t1"]),
        failWhen: (args) => args[1] === "read" && args.includes("--cursor") && transient-- > 0,
      },
    });
    await runDown(h.ctx, "default");
    assert.equal(h.elapsed(), 2000, "esperou as duas falhas antes de ver o marcador de saída");
    assert.deepEqual(h.warnings, []);
  });

  test("terminal que sumiu durante a espera conta como encerrado", async () => {
    const h = setup({
      orcaOptions: {
        terminals: tab("tab_a", ["t1"]),
        failWhen: (args) => args[1] === "read" && args.includes("--cursor") && "terminal_handle_stale",
      },
    });
    await runDown(h.ctx, "default");
    assert.equal(h.elapsed(), 0);
  });

  test("falha ao enviar Ctrl+C a um pane vira aviso e o down continua", async () => {
    const h = setup({
      orcaOptions: {
        terminals: tab("tab_a", ["t1", "t2"]),
        failWhen: (args) => args[1] === "send" && args.includes("t2"),
      },
    });
    await runDown(h.ctx, "default");
    assert.match(h.warnings.join("\n"), /não consegui enviar Ctrl\+C a t2/);
    assert.equal(callsOf(h.orca, "terminal close").length, 1);
  });

  test("só mexe nas abas com a marca do layout: título cru, outros layouts e outras abas ficam em paz", async () => {
    const h = setup({
      orcaOptions: {
        terminals: [
          ...tab("tab_a", ["t1", "t2"], "Meu Backend [backend]"),
          ...tab("tab_b", ["u1"], "Terminal 2"),
          ...tab("tab_c", ["v1"], "Meu Backend"),
          ...tab("tab_d", ["w1"], "Meu Backend [web]"),
          ...tab("tab_e", ["x1"], "Meu Backend [my-backend]"),
        ],
      },
    });
    await runDown(h.ctx, "backend");
    assert.deepEqual(h.orca.state.terminals.map((terminal) => terminal.handle).sort(), ["u1", "v1", "w1", "x1"]);
    assert.equal(callsOf(h.orca, "terminal send").length, 2, "só os 2 panes do layout recebem Ctrl+C");
  });

  test("um layout não consegue fazer o down fechar outra aba: o título do arquivo nem é lido", async () => {
    const h = setup({
      layouts: { default: fourPaneLayout({ title: "Terminal 1" }) },
      orcaOptions: { terminals: tab("tab_u", ["u1"], "Terminal 1") },
    });
    await runDown(h.ctx, "default");
    assert.deepEqual(h.orca.state.terminals.map((terminal) => terminal.handle), ["u1"]);
    assert.equal(callsOf(h.orca, "terminal send").length, 0);
  });

  test("duas abas com a mesma marca: fecha cada uma uma vez", async () => {
    const h = setup({
      orcaOptions: { terminals: [...tab("tab_a", ["t1", "t2"]), ...tab("tab_b", ["t3", "t4"])] },
    });
    await runDown(h.ctx, "default");
    assert.equal(callsOf(h.orca, "terminal close").length, 2);
    assert.equal(h.orca.state.terminals.length, 0);
  });

  test("lista de terminais truncada: o down também recusa, em vez de pular panes", async () => {
    const h = setup({ orcaOptions: { truncateList: true, terminals: tab("tab_a", ["t1", "t2"]) } });
    await assert.rejects(() => runDown(h.ctx, "default"), /só parte dos terminais deste worktree/);
    assert.equal(callsOf(h.orca, "terminal close").length, 0);
  });

  test("nome de layout inválido: erro, sem falar com o Orca", async () => {
    const h = setup();
    await assert.rejects(() => runDown(h.ctx, "../x"), CliError);
    assert.equal(h.orca.calls.length, 0);
  });
});

describe("runPlan", () => {
  test("mostra o plano sem tocar no Orca", () => {
    const h = setup();
    runPlan(h.ctx, "default");
    assert.equal(h.orca.calls.length, 0);
    assert.ok(h.logs[0].includes("NÃO confiável"));
    assert.ok(h.logs[0].includes(`Hash: ${hashOf(h)}`));
  });

  test("pasta inexistente: imprime o plano e depois falha", () => {
    const h = setup({ dirs: [] });
    assert.throws(() => runPlan(h.ctx, "default"), /Pastas com problema/);
    assert.equal(h.logs.length, 1);
  });

  test("depois de confirmado o plano diz isso", () => {
    const h = setup();
    trustNow(h);
    runPlan(h.ctx, "default");
    assert.ok(h.logs[0].includes("Confiança: confiável"));
  });
});

describe("runList", () => {
  test("sem layouts", () => {
    const { ctx, logs } = setup({ layouts: {} });
    runList(ctx);
    assert.match(logs[0], /Nenhum layout em \.orca\/layouts/);
  });

  test("nome de arquivo com escape sai escapado (list e doctor)", { skip: IS_WINDOWS }, () => {
    const h = setup({ layouts: { backend: fourPaneLayout() } });
    writeFileSync(join(h.root, ".orca", "layouts", "evil\u001b[2Kx.layout.json"), "{}");
    runList(h.ctx);
    runDoctor(h.ctx);
    const output = h.logs.join("\n");
    assert.ok(!output.includes("\u001b"), "nenhum ESC pode chegar ao terminal");
    assert.ok(output.includes("evil\\u001b[2Kx"));
  });

  test("lista os válidos e sinaliza os inválidos sem parar", () => {
    const { ctx, logs } = setup({ layouts: { backend: fourPaneLayout(), quebrado: "{ nao" } });
    runList(ctx);
    assert.equal(logs[0], 'backend — "Dev Teste", 4 pane(s): api, bff, auth, worker');
    assert.match(logs[1], /^quebrado — inválido: JSON inválido/);
  });
});

describe("runDoctor", () => {
  test("mostra o diagnóstico completo", () => {
    const { ctx, logs } = setup();
    runDoctor(ctx);
    const output = logs.join("\n");
    for (const expected of ["Plataforma", "CLI do Orca", "orca → /usr/local/bin/orca (versão 9.9.9)", "default"]) {
      assert.ok(output.includes(expected), `faltou "${expected}" em:\n${output}`);
    }
    assert.match(output, /Orca acessível\s+sim/);
    assert.match(output, /Worktree no Orca\s+sim/);
  });

  test("Orca fora do ar aparece como 'não', sem derrubar o diagnóstico", () => {
    const { ctx, logs } = setup({ orcaOptions: { failWhen: () => true } });
    runDoctor(ctx);
    assert.match(logs.join("\n"), /Orca acessível\s+não \(falha simulada do Orca\)/);
  });

  for (const [label, scriptPath] of [
    ["espaço", "C:\\Users\\Maique Almeida\\o.mjs"],
    ["acento", "C:\\Users\\João\\o.mjs"],
    ["parêntese", "C:\\Program Files (x86)\\o.mjs"],
  ]) {
    test(`Windows com CLI .cmd e ${label} no caminho: avisa`, () => {
      const { ctx, warnings, orca } = setup({ platform: "win32", scriptPath });
      orca.locate = () => "C:\\Orca\\bin\\orca.cmd";
      runDoctor(ctx);
      assert.match(warnings.join("\n"), /espaços ou caracteres especiais/);
    });
  }

  test("Windows com CLI .exe, ou .cmd com caminhos simples: sem aviso", () => {
    for (const locate of ["C:\\Orca\\bin\\orca.exe", "C:\\Orca\\bin\\orca.cmd"]) {
      const { ctx, warnings, orca } = setup({ platform: "win32", scriptPath: "C:\\Users\\x\\skills\\o.mjs" });
      orca.locate = () => locate;
      if (locate.endsWith(".exe")) ctx.scriptPath = "C:\\Users\\Maique Almeida\\o.mjs";
      runDoctor(ctx);
      assert.deepEqual(warnings.filter((line) => /especiais/.test(line)), [], locate);
    }
  });
});
