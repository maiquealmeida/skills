import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, test } from "node:test";
import { loadLayout } from "../lib/layout.mjs";
import { hashLayout, shortHash } from "../lib/trust.mjs";
import { FOUR_PANE_DIRS, createTempRepo, fourPaneLayout } from "./helpers.mjs";

const ENTRY = fileURLToPath(new URL("../orca-layout.mjs", import.meta.url));

const cleanups = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()();
});

/** Roda a CLI de verdade num repositório temporário, com um Orca que não existe (nada deve chegar a ele). */
function runCli(args, { layouts = { default: fourPaneLayout() }, dirs = FOUR_PANE_DIRS } = {}) {
  const repo = createTempRepo(layouts, dirs);
  const stateDir = mkdtempSync(join(tmpdir(), "orca-layout-state-"));
  cleanups.push(repo.cleanup, () => rmSync(stateDir, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, [ENTRY, ...args, "--root", repo.root], {
    encoding: "utf8",
    env: { ...process.env, ORCA_CLI_COMMAND: join(repo.root, "orca-que-nao-existe"), ORCA_LAYOUT_STATE_DIR: stateDir },
  });
  return { ...result, root: repo.root };
}

describe("CLI", () => {
  test("--help lista as ações e os códigos de saída", () => {
    const result = runCli(["--help"]);
    assert.equal(result.status, 0);
    for (const expected of ["up [nome]", "down [nome]", "plan [nome]", "--trust <hash>", "3 layout não confirmado"]) {
      assert.ok(result.stdout.includes(expected), `faltou "${expected}"`);
    }
  });

  test("opção desconhecida: erro com a ajuda, código 1", () => {
    const result = runCli(["--bogus"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Erro:.*--bogus/s);
  });

  test("--trust exige o hash (a confirmação vale para o conteúdo revisado, não 'sim' genérico)", () => {
    const result = runCli(["up", "--trust"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Erro:.*trust/s);
  });

  test("argumentos demais para list e doctor", () => {
    assert.equal(runCli(["list", "extra"]).status, 1);
    assert.equal(runCli(["doctor", "extra"]).status, 1);
  });

  test("plan sem o layout: código 2", () => {
    const result = runCli(["plan"], { layouts: {} });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Layout "default" não encontrado/);
  });

  test("plan mostra o hash e o comando; nada chega ao Orca", () => {
    const result = runCli(["plan"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Hash: [0-9a-f]{16}/);
    assert.ok(result.stdout.includes("$ PORT=5101 dotnet run"));
  });

  test("up sem --trust: plano + código 3, e o Orca nem é consultado (o CLI configurado nem existe)", () => {
    const result = runCli(["up"]);
    assert.equal(result.status, 3, result.stderr);
    assert.match(result.stdout, /Hash: [0-9a-f]{16}/);
    assert.match(result.stderr, /confirme com: up default --trust [0-9a-f]{16}/);
  });

  test("up --trust com hash errado: código 3, sem chegar ao Orca", () => {
    const result = runCli(["up", "--trust", "0123456789abcdef"]);
    assert.equal(result.status, 3);
    assert.match(result.stderr, /não corresponde ao conteúdo atual/);
  });

  test("up --trust com o hash certo avança até o Orca (que aqui não existe): erro 1, não 3", () => {
    const first = runCli(["up"]);
    const hash = /--trust ([0-9a-f]{16})/.exec(first.stderr)[1];
    // Mesmo repositório e mesmo conteúdo: recalcula a partir do texto, que é o que o usuário revisaria.
    const text = loadLayout(first.root, "default").text;
    assert.equal(shortHash(hashLayout(text)), hash);

    const result = spawnSync(process.execPath, [ENTRY, "up", "--trust", hash, "--root", first.root], {
      encoding: "utf8",
      env: { ...process.env, ORCA_CLI_COMMAND: join(first.root, "orca-que-nao-existe"), ORCA_LAYOUT_STATE_DIR: mkdtempSync(join(tmpdir(), "orca-layout-state-")) },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Orca não está acessível|CLI do Orca não encontrada/);
  });

  test("list mostra os layouts do repositório", () => {
    const result = runCli(["list"], { layouts: { backend: fourPaneLayout(), web: fourPaneLayout({ title: "Web" }) } });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /backend — "Dev Teste"/);
    assert.match(result.stdout, /web — "Web"/);
  });

  test("um nome sozinho é atalho de up", () => {
    const result = runCli(["backend"], { layouts: { backend: fourPaneLayout() } });
    assert.equal(result.status, 3);
    assert.match(result.stderr, /up backend --trust/);
  });
});
