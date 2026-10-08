/**
 * Ponte com o CLI do Orca: resolve o executável, roda `orca ... --json` em
 * qualquer SO e monta o comando que cada pane digita.
 *
 * O Orca digita o `--command` no shell do pane (zsh, PowerShell, cmd...), e
 * `cd`, `&&` e `VAR=x cmd` mudam entre eles. Por isso o pane digita só
 * `node <este CLI> run-pane <layout> <índice>`: uma linha idêntica em qualquer
 * shell. Quem faz o chdir, o env e o spawn do projeto é o `run-pane`.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CliError, EXIT_ERROR } from "./errors.mjs";
import { UNSAFE_TEXT_CHARS, firstLine, printable } from "./text.mjs";

const ORCA_CALL_TIMEOUT_MS = 30_000;
const DEFAULT_PATHEXT = ".COM;.EXE;.BAT;.CMD";
const WINDOWS_EXECUTABLE_PATTERN = /\.(exe|com)$/i;

/** Argumentos que dispensam aspas em qualquer shell. Sem `,`: o PowerShell o lê como array. */
const SAFE_ARG_PATTERN = /^[A-Za-z0-9_@+=:./-]+$/;
/** O mesmo para o cmd.exe, onde a barra invertida também é inofensiva. */
const SAFE_CMD_ARG_PATTERN = /^[A-Za-z0-9_@+=:,./\\-]+$/;
/** Dentro de aspas, o cmd.exe ainda expande `%VAR%` e não tem como escapar `"`. */
const UNSAFE_CMD_CHARS = /["%\r\n]/;
/**
 * Dentro de aspas duplas, o PowerShell ainda expande `$` e crase e trata as
 * aspas curvas (U+201C, U+201D, U+201E) como aspas duplas; o cmd.exe, `%`, `^` e `!`.
 */
const UNSAFE_WINDOWS_QUOTED_CHARS = /["%^!$`\u201c\u201d\u201e]/;

// --- resolução do executável ------------------------------------------------

/**
 * Mesma regra dos guias oficiais do Orca: `ORCA_CLI_COMMAND` manda; num
 * checkout de desenvolvimento do Orca, `orca-dev`; no Linux, fora dos
 * terminais do Orca, `orca-ide` (o `orca` puro costuma ser o leitor de tela
 * GNOME e começaria a falar na máquina do usuário).
 * @param {NodeJS.ProcessEnv} [env]
 * @param {string} [platform]
 * @returns {string}
 */
export function resolveOrcaCommand(env = process.env, platform = process.platform) {
  if (env.ORCA_CLI_COMMAND) return env.ORCA_CLI_COMMAND;
  if (env.ORCA_DEV_REPO_ROOT) return "orca-dev";
  const insideOrca = Boolean(env.ORCA_TERMINAL_HANDLE || env.ORCA_WORKTREE_ID);
  if (platform === "linux" && !insideOrca) return "orca-ide";
  return "orca";
}

/**
 * Procura `command` no PATH, respeitando o PATHEXT no Windows. Usa as regras de
 * caminho da plataforma pedida, não da máquina que roda (permite testar o
 * Windows no macOS).
 *
 * Só entradas ABSOLUTAS do PATH valem: uma relativa (`.`, `bin`) dependeria do
 * diretório atual, que é o repositório que se está abrindo. Um comando com
 * caminho (`ORCA_CLI_COMMAND=C:\Tools\orca.exe`) é testado direto, sem busca.
 * @param {string} command
 * @param {{ env?: NodeJS.ProcessEnv, platform?: string, exists?: (path: string) => boolean }} [options]
 * @returns {string | null}
 */
export function findExecutable(command, { env = process.env, platform = process.platform, exists = existsSync } = {}) {
  const windows = platform === "win32";
  const pathApi = windows ? path.win32 : path.posix;
  const hasExtension = windows && /\.[A-Za-z0-9]+$/.test(command);
  const extensions = windows && !hasExtension ? (env.PATHEXT ?? DEFAULT_PATHEXT).split(";").filter(Boolean) : [""];

  const candidatesIn = (directory) =>
    extensions.map((extension) => pathApi.join(directory, `${command}${extension}`));

  if (/[\\/]/.test(command)) {
    if (!pathApi.isAbsolute(command)) return null;
    return extensions.map((extension) => `${command}${extension}`).find((candidate) => exists(candidate)) ?? null;
  }

  const directories = (env.PATH ?? env.Path ?? "")
    .split(pathApi.delimiter)
    .filter((directory) => directory && pathApi.isAbsolute(directory));
  for (const directory of directories) {
    const found = candidatesIn(directory).find((candidate) => exists(candidate));
    if (found) return found;
  }
  return null;
}

// --- citação de argumentos --------------------------------------------------

/** No Windows os caminhos vão com `/`: o Node e os shells aceitam, e some a barra invertida. */
export function toForwardSlashes(value) {
  return value.replace(/\\/g, "/");
}

/**
 * Cita um argumento do comando que o pane vai digitar. Aspas simples no POSIX
 * (valem em zsh, bash e fish); duplas no Windows (valem em cmd e PowerShell).
 * Caractere de controle é recusado em qualquer SO: digitado no shell, uma quebra
 * de linha executaria o que vem depois dela.
 * @param {string} value
 * @param {string} [platform]
 * @returns {string}
 */
export function quoteArg(value, platform = process.platform) {
  if (UNSAFE_TEXT_CHARS.test(value)) {
    throw new CliError(`Caminho com caractere de controle: ${printable(value)}`);
  }
  if (SAFE_ARG_PATTERN.test(value)) return value;
  if (platform === "win32") {
    if (UNSAFE_WINDOWS_QUOTED_CHARS.test(value)) {
      throw new CliError(`Caminho com caractere não suportado no Windows: ${value}`);
    }
    return `"${value}"`;
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Cita um argumento do CLI do Orca quando ele é um `.cmd`, que só roda via
 * cmd.exe. Recusa em vez de escapar o que não dá para escapar com segurança.
 * @param {string} arg
 * @returns {string}
 * @throws {CliError}
 */
export function quoteForCmd(arg) {
  if (UNSAFE_CMD_CHARS.test(arg)) {
    throw new CliError(
      `O CLI do Orca no Windows (.cmd) não aceita este argumento (aspas, "%" ou quebra de linha): ${printable(arg)}. ` +
        "Use caminhos só com letras ASCII, números e . _ - / (sem espaços, acentos ou parênteses) para a skill e o repositório.",
    );
  }
  return SAFE_CMD_ARG_PATTERN.test(arg) ? arg : `"${arg}"`;
}

/** Caminho que o `quoteArg` precisaria citar (espaço, acento, parêntese...). */
export function needsQuoting(value) {
  return !SAFE_ARG_PATTERN.test(toForwardSlashes(value));
}

/**
 * O comando que cada pane digita para iniciar o seu projeto.
 * @param {{ scriptPath: string, layoutFile: string, index: number, platform?: string }} options
 * @returns {string}
 */
export function buildPaneCommand({ scriptPath, layoutFile, index, platform = process.platform }) {
  const portable = (value) => (platform === "win32" ? toForwardSlashes(value) : value);
  return [
    "node",
    quoteArg(portable(scriptPath), platform),
    "run-pane",
    quoteArg(portable(layoutFile), platform),
    String(index),
  ].join(" ");
}

// --- execução ---------------------------------------------------------------

/**
 * Roda o CLI do Orca — sempre com o diretório de trabalho fora do repositório e,
 * no Windows, pelo caminho ABSOLUTO resolvido: o cmd.exe procura o diretório
 * atual antes do PATH, e um `orca.cmd` plantado no repo rodaria até no `doctor`
 * e no `down`, que não passam pela confirmação do layout.
 *
 * No Windows o executável pode ser um `.exe` (spawn direto, o Node cita os
 * argumentos) ou um `.cmd` (só roda via cmd.exe, que não separa argumentos
 * sozinho: citamos cada um).
 * @param {string} command
 * @param {string[]} args
 * @param {{ platform: string, env: NodeJS.ProcessEnv, exists: (path: string) => boolean, spawn: typeof spawnSync, cwd?: string }} context
 */
export function runProcess(command, args, { platform, env, exists, spawn, cwd = tmpdir() }) {
  const options = { encoding: "utf8", timeout: ORCA_CALL_TIMEOUT_MS, windowsHide: true, cwd };
  if (platform !== "win32") return spawn(command, args, options);

  const executable = findExecutable(command, { env, platform, exists });
  if (!executable) {
    return { error: Object.assign(new Error(`${command} não está no PATH`), { code: "ENOENT" }) };
  }
  if (WINDOWS_EXECUTABLE_PATTERN.test(executable)) return spawn(executable, args, options);

  const line = [executable, ...args].map(quoteForCmd).join(" ");
  return spawn(line, [], {
    ...options,
    shell: true,
    env: { ...env, NoDefaultCurrentDirectoryInExePath: "1" },
  });
}

function tryParseJson(text) {
  try {
    const value = JSON.parse(text);
    return value !== null && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

function describeSpawnError(command, error) {
  if (error.code === "ENOENT") {
    return `CLI do Orca não encontrada ("${command}"). Registre-a em Orca → Settings → General → Orca CLI (e abra um terminal novo) ou defina ORCA_CLI_COMMAND.`;
  }
  if (error.code === "ETIMEDOUT") return `O CLI do Orca ("${command}") não respondeu a tempo.`;
  return `Não consegui executar o CLI do Orca ("${command}"): ${error.message}`;
}

function describeOrcaError(args, error) {
  const code = error?.code ?? "erro desconhecido";
  if (code === "selector_not_found") {
    return (
      `O Orca não reconhece ${error?.data?.selector ?? "este diretório"} como worktree. ` +
      "Adicione o repositório ao Orca (orca repo add --path <raiz>) e tente de novo."
    );
  }
  // O Orca costuma repetir o código em `message`; quando traz mais, vale mostrar.
  const detail = error?.message && error.message !== code ? ` — ${error.message}` : "";
  return `'orca ${args.slice(0, 2).join(" ")}' falhou: ${code}${detail}`;
}

/**
 * Cliente do CLI do Orca. `call(args)` roda `orca <args> --json` e devolve o
 * `result` da resposta; qualquer falha vira `CliError` com uma mensagem útil
 * (e, quando veio do Orca, o código dele em `orcaCode`).
 * @param {{ command?: string, platform?: string, env?: NodeJS.ProcessEnv, exists?: (path: string) => boolean, spawn?: typeof spawnSync, cwd?: string }} [options]
 */
export function createOrcaClient(options = {}) {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const command = options.command ?? resolveOrcaCommand(env, platform);
  const context = {
    platform,
    env,
    exists: options.exists ?? existsSync,
    spawn: options.spawn ?? spawnSync,
    ...(options.cwd ? { cwd: options.cwd } : {}),
  };

  return {
    command,

    /** Caminho resolvido do executável, ou null quando não está no PATH. */
    locate: () => findExecutable(command, { env, platform, exists: context.exists }),

    /** Saída de `orca --version`, ou null se o comando falhar. */
    version() {
      const result = runProcess(command, ["--version"], context);
      return result.error || result.status !== 0 ? null : firstLine(result.stdout);
    },

    call(args) {
      const result = runProcess(command, [...args, "--json"], context);
      if (result.error) throw new CliError(describeSpawnError(command, result.error));

      const output = (result.stdout ?? "").trim();
      const payload = tryParseJson(output);
      if (payload === null) {
        const detail = printable(firstLine(output || result.stderr));
        throw new CliError(
          `Resposta inesperada do Orca em 'orca ${args.slice(0, 2).join(" ")}'${detail ? `: ${detail}` : ""}`,
        );
      }
      if (payload.ok !== true) {
        throw new CliError(describeOrcaError(args, payload.error), EXIT_ERROR, payload.error?.code);
      }
      return payload.result;
    },
  };
}
