/**
 * `run-pane`: o que cada pane executa. Faz o chdir, aplica o env e inicia o
 * projeto do layout, repassando o terminal (stdio herdado: cores, TTY e teclas
 * interativas, como as do `dotnet watch`, continuam funcionando).
 *
 * Só roda um layout confirmado, e executa exatamente o texto que ele conferiu
 * (uma leitura só): sem isso, a linha digitada no pane ficaria no histórico e,
 * depois de um `git pull`, voltaria a rodar o conteúdo novo sem revisão.
 *
 * Imprime marcadores de início e de fim: o `down` os lê para saber quando o
 * projeto terminou de encerrar depois do Ctrl+C.
 */
import { spawn, spawnSync } from "node:child_process";
import { constants as osConstants } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { CliError, EXIT_UNTRUSTED } from "./errors.mjs";
import { LAYOUT_SUFFIX, findBadDirs, loadLayout, paneDirectory } from "./layout.mjs";
import { hashLayout, isTrusted, shortHash, trustFilePath } from "./trust.mjs";

export const START_MARKER = "[orca-layout] start";
export const EXIT_MARKER = "[orca-layout] exit";

/** Convenção dos shells para "comando não pôde ser executado". */
const EXIT_COMMAND_FAILED_TO_START = 127;
/** Convenção dos shells para término por sinal: 128 + número do sinal. */
const SIGNAL_EXIT_BASE = 128;

const writeLine = (line) => process.stdout.write(`${line}\n`);

/**
 * Encerra o projeto e, no Windows, a árvore dele: lá `kill` só alcança o
 * cmd.exe que o Node abriu, e o projeto ficaria órfão.
 */
function terminate(child, signal, platform) {
  try {
    if (platform === "win32") {
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true });
    } else {
      child.kill(signal);
    }
  } catch {
    // O projeto já saiu entre o sinal e o repasse: nada mais a encerrar.
  }
}

/**
 * Ctrl+C chega ao projeto pelo grupo de processos do terminal, junto com este
 * processo. Aqui só esperamos o projeto encerrar: sair antes o deixaria órfão
 * no meio do shutdown. SIGTERM (e SIGHUP, ao fechar o terminal, onde existe) são
 * repassados.
 */
function relaySignals(child, platform) {
  const ignoreInterrupt = () => {};
  const forward = (signal) => terminate(child, signal, platform);
  const forwarded = platform === "win32" ? ["SIGTERM"] : ["SIGTERM", "SIGHUP"];
  process.on("SIGINT", ignoreInterrupt);
  for (const signal of forwarded) process.on(signal, forward);
  return () => {
    process.off("SIGINT", ignoreInterrupt);
    for (const signal of forwarded) process.off(signal, forward);
  };
}

function waitForExit(child, write) {
  return new Promise((done) => {
    child.once("error", (error) => {
      write(`[orca-layout] não consegui iniciar o comando: ${error.message}`);
      done(EXIT_COMMAND_FAILED_TO_START);
    });
    child.once("close", (code, signal) => {
      done(code ?? (signal ? SIGNAL_EXIT_BASE + (osConstants.signals[signal] ?? 0) : 1));
    });
  });
}

/**
 * Roda o projeto de um pane e devolve o código de saída dele.
 * @param {string} layoutFile caminho absoluto do `.layout.json` (a raiz do repo sai dele)
 * @param {string} indexText índice do pane no layout
 * @param {{ spawnChild?: typeof spawn, write?: (line: string) => void, trustFile?: string, platform?: string }} [io]
 * @returns {Promise<number>}
 * @throws {CliError} código 3 quando o layout não está confirmado
 */
export async function runPane(
  layoutFile,
  indexText,
  { spawnChild = spawn, write = writeLine, trustFile = trustFilePath(), platform = process.platform } = {},
) {
  if (!layoutFile) throw new CliError("run-pane precisa do caminho do layout e do índice do pane.");

  const root = resolve(dirname(layoutFile), "..", "..");
  const name = basename(layoutFile, LAYOUT_SUFFIX);
  const { file, text, layout } = loadLayout(root, name);

  const hash = hashLayout(text);
  if (!isTrusted(trustFile, file, hash)) {
    throw new CliError(
      `O layout "${name}" não está confirmado (ou mudou desde a confirmação). ` +
        `Rode "up ${name}", revise o plano e confirme com --trust ${shortHash(hash)}.`,
      EXIT_UNTRUSTED,
    );
  }

  const pane = layout.panes[Number.parseInt(indexText, 10)];
  if (!pane) throw new CliError(`O pane ${indexText} não existe no layout "${name}".`);

  const [badDir] = findBadDirs({ panes: [pane] }, root);
  if (badDir) throw new CliError(`Pasta do pane "${pane.name}" (${pane.dir}): ${badDir.reason}.`);
  const cwd = paneDirectory(root, pane);

  // Só os nomes das variáveis: valores podem ser sensíveis e o scrollback persiste.
  const envNames = Object.keys(pane.env);
  write(`${START_MARKER} ${pane.name} · ${pane.dir}`);
  write(`[orca-layout] $ ${pane.cmd}${envNames.length > 0 ? `  (env: ${envNames.join(", ")})` : ""}`);

  const child = spawnChild(pane.cmd, {
    cwd,
    env: { ...process.env, ...pane.env },
    shell: true,
    stdio: "inherit",
  });
  const release = relaySignals(child, platform);
  const code = await waitForExit(child, write);
  release();

  write(`${EXIT_MARKER} ${pane.name} code=${code}`);
  return code;
}
