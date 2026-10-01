#!/usr/bin/env node
/**
 * Status line do Claude Code — implementação em Node puro, sem dependências.
 *
 * Roda igual em Windows, Linux e macOS: não usa `jq`, `git`, `sed` nem sintaxe
 * POSIX. O Claude Code executa o comando com o cwd na raiz do projeto, então
 * `.claude/settings.json` aponta para `node .claude/statusline.mjs` — caminho
 * relativo, sem expansão de variável, o que funciona tanto no Git Bash quanto
 * no PowerShell (os dois shells que o Claude Code usa no Windows).
 *
 * Entrada: JSON da sessão via stdin. Saída: até duas linhas com escapes ANSI.
 *   linha 1: diretório · branch · modelo · contexto · custo
 *   linha 2: cotas de 5h e 7 dias (só aparece quando a API as informa)
 *
 * Não faz spawn de processos — o branch sai da leitura direta de .git/HEAD.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

const ESC = "\u001b";
const RESET = `${ESC}[0m`;
const CYAN = `${ESC}[36m`;
const GREEN = `${ESC}[32m`;
const YELLOW = `${ESC}[33m`;
const RED = `${ESC}[31m`;
const MAGENTA = `${ESC}[35m`;
const DIM = `${ESC}[2m`;

const SEPARATOR = ` ${DIM}·${RESET} `;
const BAR_WIDTH = 10;
const MIN_COLUMNS = 40;
const DEFAULT_COLUMNS = 120;
const SHORT_SHA_LENGTH = 7;

/**
 * Limiares do contexto, medidos sobre o percentual CONSUMIDO: até 50% é
 * tranquilo (verde), acima disso pede atenção (amarelo) e de 70% em diante
 * é crítico (vermelho).
 */
const CONTEXT_CALM_MAX_PERCENT = 50;
const CONTEXT_DANGER_PERCENT = 70;

/**
 * Limiares das cotas, medidos sobre o percentual RESTANTE: de 50% para cima
 * resta folga (verde), de 26% a 49% pede atenção (amarelo) e abaixo de 26% é
 * crítico (vermelho). Valem para as duas janelas, 5h e 7d.
 */
const QUOTA_CALM_MIN_REMAINING = 50;
const QUOTA_WARN_MIN_REMAINING = 26;

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86400;

/** Janelas de cota, na ordem em que aparecem na linha. */
const QUOTA_WINDOWS = [
  { key: "five_hour", label: "5h" },
  { key: "seven_day", label: "7d" },
];

const paint = (color, text) => `${color}${text}${RESET}`;

/**
 * Relógio injetável: os testes fixam o "agora" para que o tempo até o reset
 * seja determinístico. Em produção a variável nunca está definida.
 * @returns {number} epoch em segundos
 */
function nowInSeconds() {
  const override = Number.parseInt(process.env.CLAUDE_STATUSLINE_NOW ?? "", 10);
  return Number.isFinite(override) ? override : Math.floor(Date.now() / 1000);
}

/** Troca o diretório home pelo `~`, preservando o separador nativo. */
function abbreviateHome(dir) {
  const home = homedir();
  if (!home || !dir.startsWith(home)) return dir;
  const rest = dir.slice(home.length);
  if (rest === "") return "~";
  if (rest.startsWith("/") || rest.startsWith("\\")) return `~${rest}`;
  return dir;
}

/**
 * Resolve o diretório .git real. Em worktree, `.git` é um ARQUIVO contendo
 * `gitdir: <caminho>` — este repo usa worktrees, então o caso não é exótico.
 */
function resolveGitDir(startDir) {
  let current = resolve(startDir);
  for (;;) {
    const candidate = join(current, ".git");
    try {
      const contents = readFileSync(candidate, "utf8");
      const match = /^gitdir:\s*(.+)$/m.exec(contents);
      if (match) {
        const target = match[1].trim();
        return isAbsolute(target) ? target : resolve(current, target);
      }
    } catch (error) {
      // EISDIR: `.git` é um diretório comum — o caso normal, fora de worktree.
      if (error.code === "EISDIR") return candidate;
      // ENOENT e afins: sobe um nível e tenta de novo.
    }
    const parent = resolve(current, "..");
    if (parent === current) return null;
    current = parent;
  }
}

/** Nome do branch, ou o SHA curto quando o HEAD está detached. */
function readBranch(startDir) {
  const gitDir = resolveGitDir(startDir);
  if (!gitDir) return null;
  try {
    const head = readFileSync(join(gitDir, "HEAD"), "utf8").trim();
    const ref = /^ref:\s*refs\/heads\/(.+)$/.exec(head);
    if (ref) return ref[1];
    return head.length >= SHORT_SHA_LENGTH ? `${head.slice(0, SHORT_SHA_LENGTH)} (detached)` : null;
  } catch {
    return null;
  }
}

/** Barra de N blocos representando `percent` preenchido. */
function renderBar(percent) {
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = Math.min(BAR_WIDTH, Math.round((clamped / 100) * BAR_WIDTH));
  return "█".repeat(filled) + "░".repeat(BAR_WIDTH - filled);
}

function contextColor(usedPercent) {
  if (usedPercent >= CONTEXT_DANGER_PERCENT) return RED;
  if (usedPercent > CONTEXT_CALM_MAX_PERCENT) return YELLOW;
  return GREEN;
}

function renderContextBar(usedPercent) {
  const clamped = Math.max(0, Math.min(100, usedPercent));
  // A cor sai do valor ARREDONDADO, o mesmo que aparece na linha: senão 50,4%
  // apareceria como "50%" pintado de amarelo.
  const shown = Math.round(clamped);
  return paint(contextColor(shown), `${renderBar(clamped)} ${shown}%`);
}

function formatCost(usd) {
  if (typeof usd !== "number" || Number.isNaN(usd) || usd <= 0) return null;
  return `$${usd.toFixed(2)}`;
}

// --- cotas ------------------------------------------------------------------

function quotaColor(remainingPercent) {
  if (remainingPercent < QUOTA_WARN_MIN_REMAINING) return RED;
  if (remainingPercent < QUOTA_CALM_MIN_REMAINING) return YELLOW;
  return GREEN;
}

/**
 * Tempo restante em forma compacta: `47m`, `2h58m`, `2d17h`.
 * @param {number} seconds
 * @returns {string}
 */
function formatDuration(seconds) {
  if (seconds <= 0) return "agora";
  if (seconds < SECONDS_PER_HOUR) {
    return `${Math.max(1, Math.round(seconds / SECONDS_PER_MINUTE))}m`;
  }
  if (seconds < SECONDS_PER_DAY) {
    const hours = Math.floor(seconds / SECONDS_PER_HOUR);
    const minutes = Math.floor((seconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
    return `${hours}h${String(minutes).padStart(2, "0")}m`;
  }
  const days = Math.floor(seconds / SECONDS_PER_DAY);
  const hours = Math.floor((seconds % SECONDS_PER_DAY) / SECONDS_PER_HOUR);
  return `${days}d${hours}h`;
}

/**
 * Um bloco de cota: rótulo, barra do que RESTA, percentual e tempo até o reset.
 * @param {string} label
 * @param {{ used_percentage?: number, resets_at?: number }} window
 * @param {number} now epoch em segundos
 * @returns {string | null} null quando a janela não traz percentual utilizável
 */
function renderQuota(label, window, now) {
  const used = window?.used_percentage;
  if (typeof used !== "number" || Number.isNaN(used)) return null;

  const remaining = Math.max(0, Math.min(100, 100 - used));
  // Cor a partir do valor arredondado, pelo mesmo motivo da barra de contexto.
  const shown = Math.round(remaining);
  const parts = [
    paint(DIM, label),
    paint(quotaColor(shown), `${renderBar(remaining)} ${shown}%`),
  ];

  const resetsAt = window?.resets_at;
  if (typeof resetsAt === "number" && Number.isFinite(resetsAt)) {
    parts.push(paint(DIM, `reset ${formatDuration(resetsAt - now)}`));
  }
  return parts.join(" ");
}

/**
 * Linha das cotas. Retorna null quando a API não informou nenhuma — o objeto
 * `rate_limits` só existe para assinantes Pro/Max e só após a primeira
 * resposta, e cada janela pode sumir de forma independente.
 * @param {Record<string, unknown> | undefined} rateLimits
 * @param {number} now
 * @returns {string | null}
 */
function buildQuotaLine(rateLimits, now) {
  if (!rateLimits || typeof rateLimits !== "object") return null;

  const blocks = QUOTA_WINDOWS.map(({ key, label }) =>
    renderQuota(label, rateLimits[key], now),
  ).filter(Boolean);

  if (blocks.length === 0) return null;
  return [paint(DIM, "cotas"), blocks.join(SEPARATOR)].join(" ");
}

// --- montagem ---------------------------------------------------------------

/** Corta pelo comprimento VISÍVEL, ignorando os escapes ANSI. */
function truncateToWidth(line, maxWidth) {
  let visible = 0;
  let index = 0;
  let output = "";
  while (index < line.length) {
    if (line[index] === ESC) {
      const end = line.indexOf("m", index);
      if (end === -1) break;
      output += line.slice(index, end + 1);
      index = end + 1;
      continue;
    }
    if (visible >= maxWidth) return `${output}${RESET}…`;
    output += line[index];
    visible += 1;
    index += 1;
  }
  return output;
}

function terminalWidth() {
  const columns = Number.parseInt(process.env.COLUMNS ?? "", 10);
  return Number.isFinite(columns) && columns >= MIN_COLUMNS ? columns : DEFAULT_COLUMNS;
}

function buildSessionLine(data) {
  const currentDir = data?.workspace?.current_dir || data?.cwd || process.cwd();
  const segments = [paint(CYAN, abbreviateHome(currentDir))];

  const branch = readBranch(currentDir);
  if (branch) segments.push(paint(MAGENTA, branch));

  const model = data?.model?.display_name;
  if (model) segments.push(model);

  const usedPercent = data?.context_window?.used_percentage;
  if (typeof usedPercent === "number") segments.push(renderContextBar(usedPercent));

  const cost = formatCost(data?.cost?.total_cost_usd);
  if (cost) segments.push(paint(DIM, cost));

  return segments.join(SEPARATOR);
}

function buildStatusLine(data) {
  const width = terminalWidth() - 2;
  const lines = [buildSessionLine(data)];

  const quotaLine = buildQuotaLine(data?.rate_limits, nowInSeconds());
  if (quotaLine) lines.push(quotaLine);

  return lines.map((line) => truncateToWidth(line, width)).join("\n");
}

function main() {
  let raw = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    raw += chunk;
  });
  process.stdin.on("end", () => {
    let data = {};
    try {
      data = JSON.parse(raw);
    } catch {
      // Sem stdin válido a linha ainda renderiza a partir dos dados locais.
    }
    try {
      process.stdout.write(buildStatusLine(data));
    } catch (error) {
      // A status line nunca deve derrubar a sessão: degrada para o nome do modelo.
      process.stdout.write(data?.model?.display_name ?? "claude");
      if (process.env.CLAUDE_STATUSLINE_DEBUG) {
        process.stderr.write(`statusline: ${error?.stack ?? error}\n`);
      }
    }
  });
}

main();
