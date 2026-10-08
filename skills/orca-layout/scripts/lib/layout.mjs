/**
 * Layouts: descoberta na raiz do repositório, validação do JSON e geometria do
 * grid. Não fala com o Orca — tudo aqui é determinístico e testável sem terminal.
 *
 * O arquivo do layout é conteúdo NÃO CONFIÁVEL (vem do repositório). Por isso é
 * lido com limite de tamanho, sem seguir link simbólico, e todo texto que ele
 * traz é validado antes de ser exibido, digitado ou executado.
 */
import {
  closeSync,
  constants as fsConstants,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { dirname, isAbsolute, join, posix, relative, resolve, sep } from "node:path";
import { CliError, EXIT_LAYOUT_NOT_FOUND } from "./errors.mjs";
import { UNSAFE_TEXT_CHARS, printable } from "./text.mjs";

export const DEFAULT_LAYOUT_NAME = "default";
export const LAYOUTS_DIR = ".orca/layouts";
export const LAYOUT_SUFFIX = ".layout.json";

const DEFAULT_TITLE = "Layout";
const DEFAULT_COLUMNS = 2;
const MAX_LAYOUT_BYTES = 64 * 1024;
const MAX_PANES = 16;
const MAX_TITLE_LENGTH = 80;
const MAX_NAME_LENGTH = 80;
const MAX_TEXT_LENGTH = 2000;

/** Nomes de ação da CLI: um layout assim ficaria ambíguo na linha de comando. */
const RESERVED_NAMES = new Set(["up", "down", "plan", "list", "doctor", "run-pane", "help"]);
const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** Caminho absoluto em qualquer SO: `/x`, `\x`, `C:/x`, `C:\x`. */
const ABSOLUTE_PATH_PATTERN = /^([A-Za-z]:|[\\/])/;
/** O título vira argumento do CLI do Orca: aspas e `%` não atravessam o cmd.exe, `\` desloca argumentos. */
const FORBIDDEN_TITLE_CHARS = /["%\\]/;
const BYTE_ORDER_MARK = /^\uFEFF/;

const TOP_LEVEL_KEYS = new Set(["$schema", "description", "title", "columns", "panes"]);
const PANE_KEYS = new Set(["name", "dir", "cmd", "env"]);
const ENV_VALUE_TYPES = new Set(["string", "number", "boolean"]);

// --- descoberta -------------------------------------------------------------

/**
 * Sobe a partir de `startDir` até o primeiro diretório com `.git` (pasta, ou
 * arquivo quando é worktree). Fora de um repositório, a raiz é o próprio `startDir`.
 * @param {string} startDir
 * @returns {string}
 */
export function findRepoRoot(startDir) {
  let current = resolve(startDir);
  for (;;) {
    if (existsSync(join(current, ".git"))) return current;
    const parent = dirname(current);
    if (parent === current) return resolve(startDir);
    current = parent;
  }
}

/** Caminho do arquivo de um layout: `<raiz>/.orca/layouts/<nome>.layout.json`. */
export function layoutFilePath(root, name) {
  return join(root, ".orca", "layouts", `${name}${LAYOUT_SUFFIX}`);
}

/** Nomes (sem o sufixo) dos layouts existentes na raiz, em ordem alfabética. */
export function listLayoutNames(root) {
  const dir = join(root, ".orca", "layouts");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => file.endsWith(LAYOUT_SUFFIX))
    .map((file) => file.slice(0, -LAYOUT_SUFFIX.length))
    .sort();
}

/** @throws {CliError} quando o nome não serve como nome de arquivo ou colide com uma ação */
export function assertValidName(name) {
  if (!NAME_PATTERN.test(name) || RESERVED_NAMES.has(name.toLowerCase())) {
    throw new CliError(
      `Nome de layout inválido: "${printable(name)}". Use letras, números, "-" ou "_", e evite ${[...RESERVED_NAMES].join(", ")}.`,
    );
  }
}

/**
 * Marca que o `up` põe no fim do título da aba. O `down` e a checagem de aba já
 * aberta procuram por ela, em vez do título cru: um layout não consegue, por
 * conta própria, dar à aba o título de outra aba do usuário.
 */
export const tabSuffix = (name) => ` [${name}]`;

/** Título da aba criada para o layout, como aparece no Orca. */
export const tabTitle = (layout) => `${layout.title}${tabSuffix(layout.name)}`;

/**
 * Lê o arquivo de um layout sem confiar nele: só arquivo comum (nada de link
 * simbólico, FIFO ou dispositivo, que travariam a leitura) e até 64 KiB.
 * @returns {string}
 * @throws {CliError} código 2 quando o arquivo não existe
 */
function readLayoutFile(file, name) {
  let info;
  try {
    info = lstatSync(file);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new CliError(`Layout "${name}" não encontrado: ${file}`, EXIT_LAYOUT_NOT_FOUND);
    }
    throw new CliError(`Não consegui ler ${file}: ${error.message}`);
  }
  if (info.isSymbolicLink() || !info.isFile()) {
    throw new CliError(`${file} precisa ser um arquivo comum: links simbólicos e arquivos especiais são recusados.`);
  }
  if (info.size > MAX_LAYOUT_BYTES) {
    throw new CliError(`${file} tem ${info.size} bytes; o máximo aceito é ${MAX_LAYOUT_BYTES}.`);
  }

  let fd;
  try {
    // O_NOFOLLOW (onde existe) fecha a janela entre o lstat e a abertura.
    fd = openSync(file, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    if (fstatSync(fd).size > MAX_LAYOUT_BYTES) {
      throw new CliError(`${file} passou de ${MAX_LAYOUT_BYTES} bytes enquanto era lido.`);
    }
    return readFileSync(fd, "utf8");
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError(`Não consegui ler ${file}: ${error.message}`);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

/**
 * Lê e valida um layout. O texto lido é devolvido junto: quem confere a
 * confiança e quem executa usam a MESMA leitura, sem reabrir o arquivo.
 * @param {string} root
 * @param {string} name
 * @returns {{ file: string, text: string, layout: Layout }}
 * @throws {CliError} código 2 quando o arquivo não existe
 */
export function loadLayout(root, name) {
  assertValidName(name);
  const file = layoutFilePath(root, name);
  const text = readLayoutFile(file, name);
  return { file, text, layout: parseLayout(text, name) };
}

// --- validação --------------------------------------------------------------

/**
 * @typedef {{ name: string, dir: string, cmd: string, env: Record<string, string> }} Pane
 * @typedef {{ name: string, title: string, columns: number, panes: Pane[] }} Layout
 */

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

/** Texto não vazio, de tamanho limitado e sem caracteres que o terminal interpretaria. */
const isSafeText = (value, max = MAX_TEXT_LENGTH) =>
  typeof value === "string" && value.trim() !== "" && value.length <= max && !UNSAFE_TEXT_CHARS.test(value);

/**
 * Valida o JSON e devolve o layout normalizado (defaults aplicados). Junta todos
 * os problemas numa só mensagem, para o autor corrigir de uma vez.
 * @param {string} text conteúdo do arquivo
 * @param {string} name nome do layout (vem do nome do arquivo)
 * @returns {Layout}
 * @throws {CliError}
 */
export function parseLayout(text, name) {
  let raw;
  try {
    raw = JSON.parse(text.replace(BYTE_ORDER_MARK, ""));
  } catch (error) {
    // A mensagem do JSON.parse cita trechos do arquivo: pode trazer escapes.
    throw new CliError(`JSON inválido: ${printable(error.message)}`);
  }
  if (!isPlainObject(raw)) throw new CliError("O layout deve ser um objeto JSON.");

  const problems = [];
  for (const key of Object.keys(raw)) {
    if (!TOP_LEVEL_KEYS.has(key)) problems.push(`campo desconhecido: ${printable(JSON.stringify(key))}`);
  }
  const title = parseTitle(raw.title, problems);
  const columns = parseColumns(raw.columns, problems);
  const panes = parsePanes(raw.panes, problems);

  if (problems.length > 0) {
    throw new CliError(`Layout "${name}" inválido:\n${problems.map((problem) => `  - ${problem}`).join("\n")}`);
  }
  return { name, title, columns, panes };
}

function parseTitle(rawTitle, problems) {
  const title = rawTitle ?? DEFAULT_TITLE;
  // Nada de `-` na frente: o parser do CLI do Orca leria o título como uma flag.
  const valid = isSafeText(title, MAX_TITLE_LENGTH) && !FORBIDDEN_TITLE_CHARS.test(title) && !title.startsWith("-");
  if (!valid) {
    problems.push(
      `"title" deve ter até ${MAX_TITLE_LENGTH} caracteres, sem aspas, "%", "\\" nem caracteres de controle, e não pode começar com "-"`,
    );
  }
  return title;
}

function parseColumns(rawColumns, problems) {
  const columns = rawColumns ?? DEFAULT_COLUMNS;
  if (!Number.isInteger(columns) || columns < 1) {
    problems.push('"columns" deve ser um número inteiro maior ou igual a 1');
    return DEFAULT_COLUMNS;
  }
  return columns;
}

function parsePanes(rawPanes, problems) {
  if (!Array.isArray(rawPanes) || rawPanes.length === 0) {
    problems.push('"panes" deve ser uma lista com pelo menos um pane');
    return [];
  }
  if (rawPanes.length > MAX_PANES) {
    problems.push(`"panes" aceita no máximo ${MAX_PANES} panes (recebi ${rawPanes.length})`);
  }
  const seenNames = new Set();
  return rawPanes.slice(0, MAX_PANES).map((rawPane, index) => parsePane(rawPane, index, seenNames, problems));
}

function parsePane(rawPane, index, seenNames, problems) {
  const label = `panes[${index}]`;
  if (!isPlainObject(rawPane)) {
    problems.push(`${label} deve ser um objeto`);
    return null;
  }
  for (const key of Object.keys(rawPane)) {
    if (!PANE_KEYS.has(key)) problems.push(`${label}: campo desconhecido ${printable(JSON.stringify(key))}`);
  }
  return {
    name: parsePaneName(rawPane.name, label, seenNames, problems),
    dir: parsePaneDir(rawPane.dir, label, problems),
    cmd: parsePaneCmd(rawPane.cmd, label, problems),
    env: parsePaneEnv(rawPane.env, label, problems),
  };
}

function parsePaneName(rawName, label, seenNames, problems) {
  if (!isSafeText(rawName, MAX_NAME_LENGTH)) {
    problems.push(`${label}: "name" é obrigatório (até ${MAX_NAME_LENGTH} caracteres, sem caracteres de controle)`);
    return "";
  }
  if (seenNames.has(rawName)) problems.push(`${label}: "name" repetido: "${rawName}"`);
  seenNames.add(rawName);
  return rawName;
}

function parsePaneDir(rawDir, label, problems) {
  const dir = rawDir ?? ".";
  if (!isSafeText(dir)) {
    problems.push(`${label}: "dir" deve ser um texto não vazio, sem caracteres de controle`);
    return ".";
  }
  if (dir.includes("\\")) {
    problems.push(`${label}: use "/" como separador em "dir" ("${dir}")`);
    return ".";
  }
  if (ABSOLUTE_PATH_PATTERN.test(dir)) {
    problems.push(`${label}: "dir" deve ser relativo à raiz do repositório ("${dir}")`);
    return ".";
  }
  // `:` no meio vira letra de unidade ou stream alternativo no Windows (`a/D:/b`).
  if (dir.includes(":")) {
    problems.push(`${label}: "dir" não pode conter ":" ("${dir}")`);
    return ".";
  }
  const normalized = posix.normalize(dir);
  if (normalized === ".." || normalized.startsWith("../")) {
    problems.push(`${label}: "dir" não pode sair da raiz do repositório ("${dir}")`);
    return ".";
  }
  return normalized;
}

function parsePaneCmd(rawCmd, label, problems) {
  if (!isSafeText(rawCmd)) {
    problems.push(
      `${label}: "cmd" é obrigatório (texto de uma linha, até ${MAX_TEXT_LENGTH} caracteres, sem caracteres de controle)`,
    );
    return "";
  }
  return rawCmd.trim();
}

function parsePaneEnv(rawEnv, label, problems) {
  if (rawEnv === undefined) return {};
  if (!isPlainObject(rawEnv)) {
    problems.push(`${label}: "env" deve ser um objeto`);
    return {};
  }
  const env = {};
  for (const [key, value] of Object.entries(rawEnv)) {
    if (!ENV_NAME_PATTERN.test(key)) {
      problems.push(`${label}: nome de variável inválido em "env": ${printable(JSON.stringify(key))}`);
    } else if (!ENV_VALUE_TYPES.has(typeof value)) {
      problems.push(`${label}: "env.${key}" deve ser texto, número ou booleano`);
    } else if (typeof value === "string" && (value.length > MAX_TEXT_LENGTH || UNSAFE_TEXT_CHARS.test(value))) {
      problems.push(`${label}: "env.${key}" é longo demais ou tem caracteres de controle`);
    } else {
      env[key] = String(value);
    }
  }
  return env;
}

// --- pastas -----------------------------------------------------------------

/** Pasta absoluta onde o projeto de um pane roda. */
export function paneDirectory(root, pane) {
  return resolve(root, ...pane.dir.split("/"));
}

/**
 * Panes cuja pasta não existe, não é pasta, ou — por link simbólico — resolve
 * para fora do repositório. A checagem léxica de `parseLayout` não vê links.
 * @param {{ panes: Pane[] }} layout
 * @param {string} root
 * @param {{ stat?: (path: string) => import("node:fs").Stats, realpath?: (path: string) => string }} [fsApi]
 * @returns {Array<{ pane: Pane, reason: string }>}
 */
export function findBadDirs(layout, root, { stat = statSync, realpath = realpathSync } = {}) {
  const problems = [];
  const realRoot = realpath(root);
  for (const pane of layout.panes) {
    const dir = paneDirectory(root, pane);
    let info;
    try {
      info = stat(dir);
    } catch {
      problems.push({ pane, reason: "a pasta não existe" });
      continue;
    }
    if (!info.isDirectory()) {
      problems.push({ pane, reason: "o caminho não é uma pasta" });
      continue;
    }
    const inside = relative(realRoot, realpath(dir));
    if (inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside)) {
      problems.push({ pane, reason: "a pasta resolve para fora do repositório (link simbólico?)" });
    }
  }
  return problems;
}

// --- grid -------------------------------------------------------------------

/**
 * Passos para montar o grid com `create` (primeiro pane) e `split` (os demais),
 * com os panes em ordem de leitura (esquerda→direita, cima→baixo) e `columns`
 * panes por linha. Primeiro sai a coluna da esquerda, cada linha nova dividindo
 * a anterior (para baixo); depois cada linha é dividida para a direita até
 * fechar as colunas. Cada divisão é ao meio, então com 3 ou mais colunas
 * (ou linhas) os tamanhos saem desiguais.
 *
 * ATENÇÃO ao sentido: no app do Orca, `vertical` coloca o pane novo à DIREITA
 * (divisória vertical, painéis lado a lado) e `horizontal` o coloca ABAIXO. O
 * guia embutido do CLI diz o contrário, mas vale o app: o CLI repassa o
 * `direction` sem alterar, e o renderer o mapeia para `is-vertical` ⇒
 * `flex-direction: row`.
 * @param {number} paneCount
 * @param {number} columns
 * @returns {Array<{ pane: number, from: number | null, direction: "vertical" | "horizontal" | null }>}
 */
export function planGrid(paneCount, columns) {
  const cols = Math.max(1, Math.min(columns, paneCount));
  const steps = [{ pane: 0, from: null, direction: null }];
  for (let pane = cols; pane < paneCount; pane += cols) {
    steps.push({ pane, from: pane - cols, direction: "horizontal" });
  }
  for (let pane = 0; pane < paneCount; pane += 1) {
    if (pane % cols !== 0) steps.push({ pane, from: pane - 1, direction: "vertical" });
  }
  return steps;
}

/**
 * Índices dos panes agrupados por linha do grid.
 * @returns {number[][]}
 */
export function gridRows(paneCount, columns) {
  const cols = Math.max(1, Math.min(columns, paneCount));
  const rows = [];
  for (let start = 0; start < paneCount; start += cols) {
    rows.push(Array.from({ length: Math.min(cols, paneCount - start) }, (_, offset) => start + offset));
  }
  return rows;
}
