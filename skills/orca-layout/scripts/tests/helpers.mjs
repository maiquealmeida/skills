/**
 * Utilitários dos testes: repositório temporário, Orca falso em memória e
 * contexto com relógio falso (o `sleep` só avança o relógio, então esperas
 * longas não custam tempo real).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CliError, EXIT_ERROR } from "../lib/errors.mjs";
import { planGrid } from "../lib/layout.mjs";
import { EXIT_MARKER, START_MARKER } from "../lib/runner.mjs";

/**
 * Cria um repositório temporário (com `.git`), as pastas pedidas e os layouts.
 * @param {Record<string, object | string>} [layouts] nome → conteúdo (objeto vira JSON)
 * @param {string[]} [dirs] pastas relativas a criar
 */
export function createTempRepo(layouts = {}, dirs = []) {
  const root = mkdtempSync(join(tmpdir(), "orca-layout-test-"));
  mkdirSync(join(root, ".git"));
  for (const dir of dirs) mkdirSync(join(root, ...dir.split("/")), { recursive: true });
  for (const [name, content] of Object.entries(layouts)) writeLayout(root, name, content);
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

export function writeLayout(root, name, content) {
  mkdirSync(join(root, ".orca", "layouts"), { recursive: true });
  const text = typeof content === "string" ? content : JSON.stringify(content, null, 2);
  writeFileSync(join(root, ".orca", "layouts", `${name}.layout.json`), text);
}

/** Layout de 4 panes em 2 colunas, o formato mais comum. */
export function fourPaneLayout(overrides = {}) {
  return {
    title: "Dev Teste",
    columns: 2,
    panes: [
      { name: "api", dir: "src/api", cmd: "dotnet run", env: { PORT: "5101" } },
      { name: "bff", dir: "src/bff", cmd: "dotnet run" },
      { name: "auth", dir: "src/auth", cmd: "dotnet run" },
      { name: "worker", dir: "src/worker", cmd: "dotnet run" },
    ],
    ...overrides,
  };
}

export const FOUR_PANE_DIRS = ["src/api", "src/bff", "src/auth", "src/worker"];

export const argAfter = (args, flag) => args[args.indexOf(flag) + 1];

// --- geometria --------------------------------------------------------------

/**
 * Modelo físico do Orca 1.4.x: `vertical` põe o pane novo à DIREITA do que foi
 * dividido (divisória vertical) e `horizontal` o põe ABAIXO — o contrário do que o
 * guia embutido do CLI diz. Cada pane ocupa um retângulo da área unitária.
 */
export function createGeometry() {
  const rects = new Map();
  return {
    create(id) {
      rects.set(id, { x0: 0, y0: 0, x1: 1, y1: 1 });
    },
    split(fromId, newId, direction) {
      const rect = rects.get(fromId);
      if (direction === "vertical") {
        const middle = (rect.x0 + rect.x1) / 2;
        rects.set(fromId, { ...rect, x1: middle });
        rects.set(newId, { ...rect, x0: middle });
      } else {
        const middle = (rect.y0 + rect.y1) / 2;
        rects.set(fromId, { ...rect, y1: middle });
        rects.set(newId, { ...rect, y0: middle });
      }
    },
    /** Ids agrupados por linha (de cima para baixo) e, dentro dela, da esquerda para a direita. */
    rows() {
      const EPSILON = 1e-9;
      const entries = [...rects.entries()].sort(([, a], [, b]) => a.y0 - b.y0 || a.x0 - b.x0);
      const rows = [];
      for (const [id, rect] of entries) {
        const last = rows.at(-1);
        if (last && Math.abs(last.y0 - rect.y0) < EPSILON) last.ids.push(id);
        else rows.push({ y0: rect.y0, ids: [id] });
      }
      return rows.map((row) => row.ids);
    },
  };
}

/**
 * Executa `planGrid` sobre o modelo físico e devolve os índices dos panes por linha
 * do grid resultante: deve ser a ordem de leitura do layout (esquerda→direita, cima→baixo).
 */
export function simulateGrid(paneCount, columns) {
  const geometry = createGeometry();
  for (const step of planGrid(paneCount, columns)) {
    if (step.from === null) geometry.create(step.pane);
    else geometry.split(step.from, step.pane, step.direction);
  }
  return geometry.rows();
}

// --- Orca falso -------------------------------------------------------------

const INDEX_IN_COMMAND = /run-pane\s+(?:'[^']*'|"[^"]*"|\S+)\s+(\d+)/;
const NOISE_LINES = 200;
const gone = () => new CliError("terminal_handle_stale", EXIT_ERROR, "terminal_handle_stale");

/**
 * Orca falso: guarda as chamadas e simula terminais, abas, a geometria dos panes,
 * o encaixe deles pela UI e o scrollback que o `run-pane` deixaria.
 *
 * Encaixe (`terminal show`): cada pane fica pendente (`paneRuntimeId: -1`) por
 * `adoptionDelayChecks` consultas; depois é encaixado (id positivo) ou, com
 * `orphanSplits`, vira órfão (só os splits, como na janela sem pintar).
 * `neverAttach` o deixa pendente para sempre; `legacyNoRuntimeId` omite o campo.
 *
 * Saída (`terminal read`): sem `--cursor`, as últimas 120 linhas, como o Orca de
 * verdade; com `--cursor n`, só o que veio depois. `chatty` empurra o marcador de
 * início para fora dessas 120 linhas; `alreadyExited` deixa o projeto encerrado.
 *
 * `failWhen(args, n)` devolve `true` (erro genérico) ou um código do Orca (string).
 * `crashWhen(args, n)` lança um erro comum, que não é do Orca. `failAfterCreate`
 * faz o Orca criar o terminal e só então dar o erro (o timeout "sem handle").
 *
 * @param {{
 *   terminals?: object[],
 *   failWhen?: (args: string[], callNumber: number) => boolean | string,
 *   crashWhen?: (args: string[], callNumber: number) => boolean,
 *   failAfterCreate?: (args: string[]) => boolean,
 *   onCall?: (args: string[], callNumber: number) => void,
 *   finishAfterReads?: number,
 *   neverFinish?: boolean,
 *   chatty?: boolean,
 *   alreadyExited?: boolean,
 *   orphanSplits?: boolean,
 *   adoptionDelayChecks?: number,
 *   neverAttach?: boolean,
 *   legacyNoRuntimeId?: boolean,
 *   truncateList?: boolean,
 * }} [options]
 */
export function createFakeOrca({
  terminals = [],
  failWhen = null,
  crashWhen = null,
  failAfterCreate = null,
  onCall = null,
  finishAfterReads = 0,
  neverFinish = false,
  chatty = false,
  alreadyExited = false,
  orphanSplits = false,
  adoptionDelayChecks = 0,
  neverAttach = false,
  legacyNoRuntimeId = false,
  truncateList = false,
} = {}) {
  const calls = [];
  const geometry = createGeometry();
  let counter = 0;

  /** Scrollback inicial de um pane: o que o `run-pane` deixa, ou ruído que empurra o início para fora. */
  const initialOutput = () => {
    const output = chatty
      ? Array.from({ length: NOISE_LINES }, (_, line) => `log ${line}`)
      : [`${START_MARKER} projeto · dir`];
    if (alreadyExited) output.push(`${EXIT_MARKER} projeto code=0`);
    return output;
  };

  const state = {
    terminals: terminals.map((terminal) => ({ output: initialOutput(), ...terminal })),
    interrupted: new Set(),
    reads: {},
  };

  const register = (terminal) => {
    const index = Number(INDEX_IN_COMMAND.exec(terminal.command ?? "")?.[1]);
    state.terminals.push({ pendingChecks: adoptionDelayChecks, index, output: initialOutput(), ...terminal });
    return terminal.handle;
  };

  const find = (handle) => {
    const terminal = state.terminals.find((candidate) => candidate.handle === handle);
    if (!terminal) throw gone();
    return terminal;
  };

  const showView = (terminal) => {
    const pending = terminal.pendingChecks > 0;
    if (pending) terminal.pendingChecks -= 1;
    if (!pending && terminal.willOrphan) {
      terminal.orphaned = true;
      terminal.tabId = "pty:fake";
    }
    const attached = !pending && !terminal.willOrphan && !neverAttach;
    const view = { handle: terminal.handle, tabId: terminal.tabId, orphaned: Boolean(terminal.orphaned) };
    if (!legacyNoRuntimeId) view.paneRuntimeId = attached ? 1 : -1;
    return view;
  };

  const readView = (terminal, cursor) => {
    if (state.interrupted.has(terminal.handle)) {
      state.reads[terminal.handle] = (state.reads[terminal.handle] ?? 0) + 1;
      const alreadyPrinted = terminal.output.some((line) => line.includes(EXIT_MARKER));
      if (!neverFinish && !alreadyPrinted && state.reads[terminal.handle] > finishAfterReads) {
        terminal.output.push(`${EXIT_MARKER} projeto code=130`);
      }
    }
    const latestCursor = terminal.output.length;
    const lines = cursor === undefined ? terminal.output.slice(-120) : terminal.output.slice(cursor);
    return { handle: terminal.handle, tail: lines, latestCursor, nextCursor: latestCursor, oldestCursor: 0 };
  };

  return {
    calls,
    state,
    geometry,
    command: "orca",
    locate: () => "/usr/local/bin/orca",
    version: () => "9.9.9",

    /** Índices dos panes por linha do grid, na ordem física (só os do `up`, encaixados). */
    gridIndexes() {
      const byHandle = new Map(state.terminals.map((terminal) => [terminal.handle, terminal.index]));
      return geometry.rows().map((row) => row.map((handle) => byHandle.get(handle)));
    },

    call(args) {
      calls.push(args);
      onCall?.(args, calls.length);
      if (crashWhen?.(args, calls.length)) throw new Error("erro inesperado simulado");
      const failure = failWhen?.(args, calls.length);
      if (failure) {
        throw new CliError(
          "falha simulada do Orca",
          EXIT_ERROR,
          typeof failure === "string" ? failure : undefined,
        );
      }

      switch (args.slice(0, 2).join(" ")) {
        case "status":
          return {};
        case "worktree show":
          return { worktree: {} };
        case "terminal list": {
          const rows = state.terminals.map((terminal) => ({
            handle: terminal.handle,
            tabId: terminal.tabId,
            title: terminal.orphaned ? undefined : terminal.title,
            orphaned: Boolean(terminal.orphaned),
          }));
          return {
            terminals: truncateList ? rows.slice(0, 1) : rows,
            truncated: truncateList,
            totalCount: rows.length,
          };
        }
        case "terminal show":
          return { terminal: showView(find(argAfter(args, "--terminal"))) };
        case "terminal create": {
          counter += 1;
          const handle = register({
            handle: `term_${counter}`,
            tabId: `tab_${counter}`,
            title: argAfter(args, "--title"),
            command: argAfter(args, "--command"),
          });
          geometry.create(handle);
          if (failAfterCreate?.(args)) throw new CliError("Timed out waiting for terminal handle after creation");
          return { terminal: { handle, tabId: `tab_${counter}` } };
        }
        case "terminal split": {
          const origin = find(argAfter(args, "--terminal"));
          counter += 1;
          const handle = register({
            handle: `term_${counter}`,
            tabId: origin.tabId,
            title: origin.title,
            command: argAfter(args, "--command"),
            willOrphan: orphanSplits,
          });
          geometry.split(origin.handle, handle, argAfter(args, "--direction"));
          if (failAfterCreate?.(args)) throw new CliError("Timed out waiting for terminal handle after creation");
          return { split: { handle, tabId: origin.tabId, paneRuntimeId: -1 } };
        }
        case "terminal send":
          find(argAfter(args, "--terminal"));
          state.interrupted.add(argAfter(args, "--terminal"));
          return {};
        case "terminal switch":
          return {};
        case "terminal read": {
          const cursor = args.includes("--cursor") ? Number(argAfter(args, "--cursor")) : undefined;
          return { terminal: readView(find(argAfter(args, "--terminal")), cursor) };
        }
        case "terminal close": {
          const target = find(argAfter(args, "--terminal"));
          // `--tab` leva a aba inteira; sem ele, só o pane (como no Orca de verdade).
          state.terminals = args.includes("--tab")
            ? state.terminals.filter((terminal) => terminal.tabId !== target.tabId)
            : state.terminals.filter((terminal) => terminal.handle !== target.handle);
          return { close: {} };
        }
        default:
          throw new Error(`chamada inesperada ao Orca falso: ${args.join(" ")}`);
      }
    },
  };
}

/** Contexto de comandos com saída capturada e relógio falso. */
export function createTestContext({ root, orca, platform = "linux", trustFile, scriptPath }) {
  const logs = [];
  const warnings = [];
  let clock = 0;
  const ctx = {
    root,
    scriptPath: scriptPath ?? "/skills/orca-layout/scripts/orca-layout.mjs",
    platform,
    trustFile,
    orca,
    log: (line) => logs.push(line),
    warn: (line) => warnings.push(line),
    sleep: async (ms) => {
      clock += ms;
    },
    now: () => clock,
  };
  return { ctx, logs, warnings, elapsed: () => clock };
}
