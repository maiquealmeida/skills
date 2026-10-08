import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { CliError, EXIT_LAYOUT_NOT_FOUND } from "../lib/errors.mjs";
import {
  assertValidName,
  findBadDirs,
  findRepoRoot,
  gridRows,
  layoutFilePath,
  listLayoutNames,
  loadLayout,
  paneDirectory,
  parseLayout,
  planGrid,
  tabSuffix,
  tabTitle,
} from "../lib/layout.mjs";
import { createTempRepo, fourPaneLayout, simulateGrid } from "./helpers.mjs";

const IS_WINDOWS = process.platform === "win32";
const validPane = { name: "api", dir: "src/api", cmd: "dotnet run" };

function problemsOf(layout) {
  try {
    parseLayout(JSON.stringify(layout), "x");
  } catch (error) {
    assert.ok(error instanceof CliError);
    return error.message;
  }
  assert.fail("o layout deveria ser inválido");
}

describe("findRepoRoot", () => {
  test("sobe até o diretório com .git", () => {
    const { root, cleanup } = createTempRepo({}, ["a/b/c"]);
    try {
      assert.equal(findRepoRoot(join(root, "a", "b", "c")), root);
    } finally {
      cleanup();
    }
  });

  test("aceita .git como arquivo, como num worktree", () => {
    const dir = mkdtempSync(join(tmpdir(), "orca-layout-test-"));
    try {
      writeFileSync(join(dir, ".git"), "gitdir: /algum/lugar\n");
      mkdirSync(join(dir, "sub"));
      assert.equal(findRepoRoot(join(dir, "sub")), dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("fora de um repositório devolve o próprio diretório", () => {
    const dir = mkdtempSync(join(tmpdir(), "orca-layout-test-"));
    try {
      assert.equal(findRepoRoot(dir), dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("descoberta de layouts", () => {
  test("lista só *.layout.json, em ordem alfabética", () => {
    const { root, cleanup } = createTempRepo({ web: fourPaneLayout(), backend: fourPaneLayout(), default: fourPaneLayout() });
    try {
      writeFileSync(join(root, ".orca", "layouts", "notas.md"), "x");
      assert.deepEqual(listLayoutNames(root), ["backend", "default", "web"]);
    } finally {
      cleanup();
    }
  });

  test("sem a pasta .orca/layouts a lista é vazia", () => {
    const { root, cleanup } = createTempRepo();
    try {
      assert.deepEqual(listLayoutNames(root), []);
    } finally {
      cleanup();
    }
  });

  test("loadLayout sem o arquivo falha com código 2", () => {
    const { root, cleanup } = createTempRepo();
    try {
      assert.throws(
        () => loadLayout(root, "default"),
        (error) => error instanceof CliError && error.exitCode === EXIT_LAYOUT_NOT_FOUND,
      );
    } finally {
      cleanup();
    }
  });

  test("loadLayout lê o arquivo e tolera BOM (editores do Windows)", () => {
    const { root, cleanup } = createTempRepo({ default: `\uFEFF${JSON.stringify(fourPaneLayout())}` });
    try {
      const { layout, file } = loadLayout(root, "default");
      assert.equal(layout.panes.length, 4);
      assert.equal(file, layoutFilePath(root, "default"));
    } finally {
      cleanup();
    }
  });
});

describe("leitura do arquivo é endurecida (o conteúdo vem do repositório)", () => {
  test("recusa arquivo maior que 64 KiB", () => {
    const { root, cleanup } = createTempRepo({ grande: `{"panes":[],"description":"${"x".repeat(70 * 1024)}"}` });
    try {
      assert.throws(() => loadLayout(root, "grande"), /bytes; o máximo aceito é 65536/);
    } finally {
      cleanup();
    }
  });

  test("recusa link simbólico, mesmo apontando para um arquivo inofensivo", { skip: IS_WINDOWS }, () => {
    const { root, cleanup } = createTempRepo({ real: fourPaneLayout() });
    try {
      symlinkSync(layoutFilePath(root, "real"), layoutFilePath(root, "atalho"));
      assert.throws(() => loadLayout(root, "atalho"), /arquivo comum: links simbólicos/);
    } finally {
      cleanup();
    }
  });

  test("recusa FIFO sem travar (abrir um bloquearia para sempre)", { skip: IS_WINDOWS }, () => {
    const { root, cleanup } = createTempRepo({ x: fourPaneLayout() });
    try {
      const fifo = layoutFilePath(root, "fifo");
      assert.equal(spawnSync("mkfifo", [fifo]).status, 0);
      assert.throws(() => loadLayout(root, "fifo"), /arquivo comum/);
    } finally {
      cleanup();
    }
  });

  test("recusa um diretório com nome de layout", () => {
    const { root, cleanup } = createTempRepo({ x: fourPaneLayout() });
    try {
      mkdirSync(layoutFilePath(root, "pasta"));
      assert.throws(() => loadLayout(root, "pasta"), /arquivo comum/);
    } finally {
      cleanup();
    }
  });
});

describe("assertValidName", () => {
  for (const name of ["default", "backend", "web-2", "api_v2", "A1"]) {
    test(`aceita "${name}"`, () => assert.doesNotThrow(() => assertValidName(name)));
  }
  for (const name of ["", "a/b", "..", "-x", "com espaço", "up", "Down", "run-pane", "a.b"]) {
    test(`recusa "${name}"`, () => assert.throws(() => assertValidName(name), CliError));
  }
});

describe("parseLayout", () => {
  test("aplica os padrões: título, 2 colunas, dir na raiz e env vazio", () => {
    const layout = parseLayout(JSON.stringify({ panes: [{ name: "web", cmd: "yarn dev" }] }), "frontend");
    assert.deepEqual(layout, {
      name: "frontend",
      title: "Layout",
      columns: 2,
      panes: [{ name: "web", dir: ".", cmd: "yarn dev", env: {} }],
    });
  });

  test("normaliza dir, converte env para texto e apara o cmd", () => {
    const layout = parseLayout(
      JSON.stringify({ panes: [{ name: "a", dir: "./src/../src/api/", cmd: "  run  ", env: { PORT: 5101, DEBUG: true, X: "y" } }] }),
      "x",
    );
    assert.deepEqual(layout.panes[0], { name: "a", dir: "src/api/", cmd: "run", env: { PORT: "5101", DEBUG: "true", X: "y" } });
  });

  test("aceita $schema, description e env com valor vazio", () => {
    assert.doesNotThrow(() =>
      parseLayout(JSON.stringify({ $schema: "x", description: "y", panes: [{ ...validPane, env: { EMPTY: "" } }] }), "x"),
    );
  });

  const invalid = [
    ["JSON quebrado", "{ nao e json", "JSON inválido"],
    ["raiz que não é objeto", "[]", "deve ser um objeto JSON"],
    ["campo desconhecido na raiz", { colums: 2, panes: [validPane] }, 'campo desconhecido: "colums"'],
    ["sem panes", { panes: [] }, '"panes" deve ser uma lista'],
    ["panes que não é lista", { panes: {} }, '"panes" deve ser uma lista'],
    ["panes demais", { panes: Array.from({ length: 17 }, (_, i) => ({ name: `p${i}`, cmd: "x" })) }, "no máximo 16 panes"],
    ["columns zero", { columns: 0, panes: [validPane] }, '"columns"'],
    ["columns fracionário", { columns: 1.5, panes: [validPane] }, '"columns"'],
    ["título com aspas", { title: 'a"b', panes: [validPane] }, '"title"'],
    ["título com %", { title: "100%", panes: [validPane] }, '"title"'],
    ["título com barra invertida", { title: "a\\", panes: [validPane] }, '"title"'],
    ["título que vira flag do Orca", { title: "--worktree=path:/outro", panes: [validPane] }, '"title"'],
    ["título longo demais", { title: "x".repeat(81), panes: [validPane] }, '"title"'],
    ["título com controle", { title: "a\u001bb", panes: [validPane] }, '"title"'],
    ["pane que não é objeto", { panes: ["api"] }, "panes[0] deve ser um objeto"],
    ["campo desconhecido no pane", { panes: [{ ...validPane, shell: "zsh" }] }, 'panes[0]: campo desconhecido "shell"'],
    ["pane sem name", { panes: [{ dir: "a", cmd: "x" }] }, 'panes[0]: "name"'],
    ["names repetidos", { panes: [validPane, validPane] }, '"name" repetido: "api"'],
    ["pane sem cmd", { panes: [{ name: "a" }] }, 'panes[0]: "cmd"'],
    ["cmd com quebra de linha", { panes: [{ name: "a", cmd: "a\nb" }] }, 'panes[0]: "cmd"'],
    ["cmd com sequência de escape (apaga linhas do plano)", { panes: [{ name: "a", cmd: "x \u001b[2K\u001b[1Gnpm run dev" }] }, 'panes[0]: "cmd"'],
    ["cmd com bidi (inverte a leitura)", { panes: [{ name: "a", cmd: "npm run \u202edev" }] }, 'panes[0]: "cmd"'],
    ["cmd com separador de linha Unicode", { panes: [{ name: "a", cmd: "a\u2028b" }] }, 'panes[0]: "cmd"'],
    ["cmd com controle C1", { panes: [{ name: "a", cmd: "a\u0085b" }] }, 'panes[0]: "cmd"'],
    ["cmd gigante", { panes: [{ name: "a", cmd: "x".repeat(2001) }] }, 'panes[0]: "cmd"'],
    ["name com quebra de linha", { panes: [{ name: "a\nConfiança: confiável", cmd: "x" }] }, 'panes[0]: "name"'],
    ["dir com quebra de linha", { panes: [{ name: "a", dir: "x\ny", cmd: "x" }] }, 'panes[0]: "dir"'],
    ["dir absoluto (posix)", { panes: [{ ...validPane, dir: "/etc" }] }, "relativo à raiz"],
    ["dir absoluto (windows)", { panes: [{ ...validPane, dir: "C:/x" }] }, "relativo à raiz"],
    ["dir com unidade no meio (Windows)", { panes: [{ ...validPane, dir: "a/D:/b" }] }, 'não pode conter ":"'],
    ["dir com barra invertida", { panes: [{ ...validPane, dir: "src\\api" }] }, 'use "/"'],
    ["dir que escapa da raiz", { panes: [{ ...validPane, dir: "../fora" }] }, "não pode sair da raiz"],
    ["dir que escapa por dentro", { panes: [{ ...validPane, dir: "a/../../fora" }] }, "não pode sair da raiz"],
    ["env que não é objeto", { panes: [{ ...validPane, env: "A=1" }] }, '"env" deve ser um objeto'],
    ["nome de variável inválido", { panes: [{ ...validPane, env: { "1A": "x" } }] }, 'nome de variável inválido em "env"'],
    ["valor de variável inválido", { panes: [{ ...validPane, env: { A: { b: 1 } } }] }, '"env.A"'],
    ["valor de variável com quebra de linha (forja linhas no plano)", { panes: [{ ...validPane, env: { A: "1\n  $ npm run dev" } }] }, '"env.A"'],
    ["valor de variável com retorno de carro", { panes: [{ ...validPane, env: { A: "1\rXX" } }] }, '"env.A"'],
  ];
  for (const [label, input, expected] of invalid) {
    test(`recusa: ${label}`, () => {
      const text = typeof input === "string" ? input : JSON.stringify(input);
      assert.throws(() => parseLayout(text, "x"), (error) => error instanceof CliError && error.message.includes(expected));
    });
  }

  test("junta todos os problemas numa só mensagem", () => {
    const message = problemsOf({ columns: 0, extra: 1, panes: [{ name: "a" }] });
    for (const expected of ['"columns"', 'campo desconhecido: "extra"', 'panes[0]: "cmd"']) {
      assert.ok(message.includes(expected), `faltou "${expected}" em:\n${message}`);
    }
  });

  test("nomes de campos desconhecidos voltam escapados, nunca crus (a mensagem sai antes do gate)", () => {
    const message = problemsOf({ "\u001b[2Kevil\u202e": 1, panes: [validPane] });
    assert.ok(!/[\u001b\u202e]/.test(message), "a mensagem não pode carregar o escape");
    assert.ok(message.includes("\\u001b"));
  });

  test("a mensagem de erro do JSON.parse também sai escapada", () => {
    assert.throws(
      () => parseLayout('{"a": "\u001b[2K" x}', "x"),
      (error) => error instanceof CliError && !/\u001b/.test(error.message),
    );
  });

  test("__proto__ vindo do JSON é só um campo desconhecido (não polui nada)", () => {
    assert.throws(() => parseLayout('{"__proto__": {"polluted": true}, "panes": [{"name":"a","cmd":"x"}]}', "x"), /campo desconhecido/);
    assert.equal({}.polluted, undefined);
  });
});

describe("título da aba", () => {
  test("leva o nome do layout como marca no fim", () => {
    assert.equal(tabTitle({ title: "Dev Confia", name: "backend" }), "Dev Confia [backend]");
    assert.equal(tabSuffix("backend"), " [backend]");
  });

  test("a marca de um layout não casa com o nome de outro que termina igual", () => {
    assert.equal(tabTitle({ title: "x", name: "my-backend" }).endsWith(tabSuffix("backend")), false);
  });
});

describe("planGrid", () => {
  const cases = [
    [1, 2, [{ pane: 0, from: null, direction: null }]],
    [
      4,
      2,
      [
        { pane: 0, from: null, direction: null },
        { pane: 2, from: 0, direction: "horizontal" },
        { pane: 1, from: 0, direction: "vertical" },
        { pane: 3, from: 2, direction: "vertical" },
      ],
    ],
    [
      3,
      2,
      [
        { pane: 0, from: null, direction: null },
        { pane: 2, from: 0, direction: "horizontal" },
        { pane: 1, from: 0, direction: "vertical" },
      ],
    ],
    [
      4,
      1,
      [
        { pane: 0, from: null, direction: null },
        { pane: 1, from: 0, direction: "horizontal" },
        { pane: 2, from: 1, direction: "horizontal" },
        { pane: 3, from: 2, direction: "horizontal" },
      ],
    ],
    [
      4,
      3,
      [
        { pane: 0, from: null, direction: null },
        { pane: 3, from: 0, direction: "horizontal" },
        { pane: 1, from: 0, direction: "vertical" },
        { pane: 2, from: 1, direction: "vertical" },
      ],
    ],
    [2, 5, [{ pane: 0, from: null, direction: null }, { pane: 1, from: 0, direction: "vertical" }]],
  ];
  for (const [count, columns, expected] of cases) {
    test(`${count} panes em ${columns} coluna(s)`, () => assert.deepEqual(planGrid(count, columns), expected));
  }

  test("invariantes: cada pane criado uma vez, sempre a partir de um pane já existente", () => {
    for (let count = 1; count <= 9; count += 1) {
      for (let columns = 1; columns <= 4; columns += 1) {
        const steps = planGrid(count, columns);
        const created = new Set();
        for (const step of steps) {
          assert.equal(created.has(step.pane), false, `pane ${step.pane} repetido (${count}x${columns})`);
          if (step.from !== null) assert.ok(created.has(step.from), `pane ${step.pane} parte de um pane ainda inexistente (${count}x${columns})`);
          created.add(step.pane);
        }
        assert.equal(created.size, count, `faltou pane (${count}x${columns})`);
      }
    }
  });

  test("posição FÍSICA: a ordem de leitura do layout é a do grid (vertical = à direita, horizontal = abaixo)", () => {
    for (let count = 1; count <= 12; count += 1) {
      for (let columns = 1; columns <= 4; columns += 1) {
        assert.deepEqual(simulateGrid(count, columns), gridRows(count, columns), `${count} panes em ${columns} coluna(s)`);
      }
    }
  });

  test("o caso do Confia: 4 panes em 2 colunas são duas linhas de dois", () => {
    assert.deepEqual(simulateGrid(4, 2), [[0, 1], [2, 3]]);
  });
});

describe("gridRows", () => {
  test("agrupa por linha", () => assert.deepEqual(gridRows(4, 2), [[0, 1], [2, 3]]));
  test("última linha parcial", () => assert.deepEqual(gridRows(5, 2), [[0, 1], [2, 3], [4]]));
  test("colunas demais viram uma linha só", () => assert.deepEqual(gridRows(2, 5), [[0, 1]]));
});

describe("pastas", () => {
  test("paneDirectory resolve a partir da raiz, com / portátil", () => {
    assert.equal(paneDirectory("/repo", { dir: "src/api" }), join("/repo", "src", "api"));
    assert.equal(paneDirectory("/repo", { dir: "." }), join("/repo"));
  });

  test("findBadDirs aponta o que não existe e o que não é pasta (fs injetado)", () => {
    const layout = parseLayout(JSON.stringify(fourPaneLayout()), "x");
    const dirs = new Map([
      [join("/r", "src", "api"), { isDirectory: () => true }],
      [join("/r", "src", "bff"), { isDirectory: () => false }],
      [join("/r", "src", "auth"), { isDirectory: () => true }],
    ]);
    const bad = findBadDirs(layout, "/r", {
      stat: (path) => {
        if (!dirs.has(path)) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
        return dirs.get(path);
      },
      realpath: (path) => path,
    });
    assert.deepEqual(
      bad.map(({ pane, reason }) => [pane.name, reason]),
      [
        ["bff", "o caminho não é uma pasta"],
        ["worker", "a pasta não existe"],
      ],
    );
  });

  test("findBadDirs pega pasta que um link simbólico leva para fora do repositório", { skip: IS_WINDOWS }, () => {
    const { root, cleanup } = createTempRepo({}, ["src/api"]);
    const outside = mkdtempSync(join(tmpdir(), "orca-layout-outside-"));
    try {
      symlinkSync(outside, join(root, "src", "fuga"));
      const layout = parseLayout(
        JSON.stringify({ panes: [{ name: "ok", dir: "src/api", cmd: "x" }, { name: "fuga", dir: "src/fuga", cmd: "x" }] }),
        "x",
      );
      const bad = findBadDirs(layout, root);
      assert.deepEqual(bad.map(({ pane }) => pane.name), ["fuga"]);
      assert.match(bad[0].reason, /fora do repositório/);
    } finally {
      cleanup();
      rmSync(outside, { recursive: true, force: true });
    }
  });

  test("findBadDirs aceita um link simbólico que continua dentro do repositório", { skip: IS_WINDOWS }, () => {
    const { root, cleanup } = createTempRepo({}, ["src/api"]);
    try {
      symlinkSync(join(root, "src", "api"), join(root, "src", "atalho"));
      const layout = parseLayout(JSON.stringify({ panes: [{ name: "a", dir: "src/atalho", cmd: "x" }] }), "x");
      assert.deepEqual(findBadDirs(layout, root), []);
    } finally {
      cleanup();
    }
  });
});
