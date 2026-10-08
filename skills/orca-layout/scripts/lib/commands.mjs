/**
 * Os comandos da CLI: up, down, plan, list e doctor. Cada um recebe um
 * contexto com tudo o que toca no mundo (Orca, relógio, saída), para poderem
 * ser testados sem terminal nem Orca.
 *
 * @typedef {object} Context
 * @property {string} root raiz do repositório
 * @property {string} scriptPath caminho deste CLI (vai no comando digitado em cada pane)
 * @property {string} platform
 * @property {string} trustFile arquivo de confiança
 * @property {ReturnType<import("./orca.mjs").createOrcaClient>} orca
 * @property {(line: string) => void} log
 * @property {(line: string) => void} warn
 * @property {(ms: number) => Promise<void>} sleep
 * @property {() => number} now epoch em milissegundos
 */
import { CliError, EXIT_INTERRUPTED, EXIT_UNTRUSTED } from "./errors.mjs";
import {
  DEFAULT_LAYOUT_NAME,
  LAYOUTS_DIR,
  assertValidName,
  findBadDirs,
  gridRows,
  listLayoutNames,
  loadLayout,
  planGrid,
  tabSuffix,
  tabTitle,
} from "./layout.mjs";
import { buildPaneCommand, needsQuoting, quoteArg, toForwardSlashes } from "./orca.mjs";
import { EXIT_MARKER, START_MARKER } from "./runner.mjs";
import { firstLine, printable } from "./text.mjs";
import { hashLayout, hashMatchesPrefix, isTrusted, saveTrust, shortHash } from "./trust.mjs";

/** Teto de espera pelo encerramento dos projetos no `down`; o normal é bem menos. */
export const DEFAULT_GRACE_SECONDS = 15;
const POLL_INTERVAL_MS = 1000;
const MS_PER_SECOND = 1000;
/** Teto de espera pelo encaixe de um pane na aba; o Orca costuma dar o veredito em ~2 s. */
const ADOPTION_TIMEOUT_MS = 6000;
const ADOPTION_POLL_MS = 250;
/** Sem `paneRuntimeId`, quanto tempo sem virar órfão basta para considerar o pane encaixado. */
const ADOPTION_SETTLE_MS = 3000;

/** Quantos terminais pedir ao Orca por listagem; acima disso a lista vem truncada e o comando recusa. */
const LIST_LIMIT = 1000;
/** Códigos do Orca para "esse terminal não existe mais". */
const GONE_ORCA_CODES = new Set(["terminal_handle_stale", "terminal_not_found"]);
/**
 * Variáveis que mudam o que um comando executa sem aparecer nele (carregam código
 * ou trocam binários). Legítimas em alguns casos, então só são destacadas no plano.
 */
const RISKY_ENV_NAME =
  /^(NODE_OPTIONS|NODE_PATH|PATH|PATHEXT|LD_[A-Z_]+|DYLD_[A-Z_]+|BASH_ENV|ENV|SHELL|COMSPEC|PYTHON(PATH|STARTUP|HOME)|RUBYOPT|RUBYLIB|PERL5(OPT|LIB)|JAVA_TOOL_OPTIONS|_JAVA_OPTIONS|JDK_JAVA_OPTIONS|DOTNET_STARTUP_HOOKS|DOTNET_ADDITIONAL_DEPS|CORECLR_PROFILER[A-Z_]*|COR_PROFILER[A-Z_]*|GIT_(SSH_COMMAND|EXEC_PATH|ASKPASS))$/i;

const isGone = (error) => error instanceof CliError && GONE_ORCA_CODES.has(error.orcaCode);

// --- apresentação -----------------------------------------------------------

/** O comando como o shell o leria, com o env na frente. Só para exibição. */
function formatCommand(pane) {
  const assignments = Object.entries(pane.env).map(([key, value]) => `${key}=${value}`);
  return [...assignments, pane.cmd].join(" ");
}

/**
 * Texto do plano: o que será digitado em cada pane, a grade e a situação de
 * confiança. Tudo o que vem do arquivo já passou pela validação de texto.
 * @param {{ layout: import("./layout.mjs").Layout, file: string }} loaded
 * @param {{ trusted: boolean, hash: string }} status
 * @returns {string}
 */
export function renderPlan({ layout, file }, { trusted, hash }) {
  const lines = [
    `Layout "${layout.name}" · aba "${tabTitle(layout)}" · ${layout.panes.length} pane(s)`,
    `Arquivo: ${file}`,
    `Hash: ${shortHash(hash)}`,
  ];
  layout.panes.forEach((pane, index) => {
    lines.push(`  ${index + 1}. ${pane.name} — ${pane.dir}`, `     $ ${formatCommand(pane)}`);
    const risky = Object.keys(pane.env).filter((key) => RISKY_ENV_NAME.test(key));
    if (risky.length > 0) lines.push(`     ⚠ env que muda o que roda sem aparecer no comando: ${risky.join(", ")}`);
  });
  lines.push("Grade:");
  for (const row of gridRows(layout.panes.length, layout.columns)) {
    lines.push(`  ${row.map((index) => `[${index + 1}] ${layout.panes[index].name}`).join("  |  ")}`);
  }
  lines.push(`Confiança: ${trusted ? "confiável (conteúdo já confirmado)" : "NÃO confiável (novo ou alterado)"}`);
  return lines.join("\n");
}

function worktreeSelector(ctx) {
  return `path:${ctx.platform === "win32" ? toForwardSlashes(ctx.root) : ctx.root}`;
}

function downCommand(ctx, name) {
  const suffix = name === DEFAULT_LAYOUT_NAME ? "" : ` ${name}`;
  return `node ${quoteArg(ctx.scriptPath, ctx.platform)} down${suffix}`;
}

function assertDirsOk(layout, root) {
  const bad = findBadDirs(layout, root);
  if (bad.length > 0) {
    const list = bad.map(({ pane, reason }) => `  - ${pane.name} (${pane.dir}): ${reason}`).join("\n");
    throw new CliError(`Pastas com problema no layout "${layout.name}" (relativas a ${root}):\n${list}`);
  }
}

// --- Orca -------------------------------------------------------------------

function assertOrcaReachable(ctx) {
  try {
    ctx.orca.call(["status"]);
  } catch (error) {
    throw new CliError(`O Orca não está acessível (${firstLine(error.message)}). Abra o app (orca open) e tente de novo.`);
  }
}

/**
 * Terminais do worktree. Uma lista parcial não serve: o `down` pularia panes, a
 * checagem de aba aberta falharia e a varredura de sobras perderia terminais.
 */
function listTerminals(ctx) {
  const result = ctx.orca.call(["terminal", "list", "--worktree", worktreeSelector(ctx), "--limit", String(LIST_LIMIT)]);
  if (result?.truncated === true) {
    throw new CliError(
      `O Orca devolveu só parte dos terminais deste worktree (${result.terminals?.length ?? "?"} de ${result.totalCount ?? "?"}); ` +
        "não é seguro agir sobre uma lista incompleta. Feche terminais que não usa e tente de novo.",
    );
  }
  return result?.terminals ?? [];
}

/**
 * Panes (com o id da aba) das abas do layout `name` neste worktree. A aba é
 * reconhecida pela marca ` [nome]` no fim do título, que só o `up` põe.
 */
function findTabPanes(ctx, name) {
  const suffix = tabSuffix(name);
  return listTerminals(ctx)
    .filter((terminal) => typeof terminal.title === "string" && terminal.title.endsWith(suffix))
    .map((terminal) => ({ tabId: terminal.tabId, handle: terminal.handle, title: terminal.title }));
}

function requireHandle(handle) {
  if (!handle) {
    throw new CliError("O Orca não devolveu o handle do terminal criado (versão incompatível?). Rode o doctor.");
  }
  return handle;
}

/**
 * Sem `--focus` de propósito: o Orca espera a UI adotar o terminal e estoura o
 * tempo (10 s) quando a janela não está pintando. A aba é revelada depois, por
 * `revealTab`, em melhor esforço.
 * @returns {{ handle: string, tabId: string | undefined }}
 */
function createPane(ctx, title, command) {
  const result = ctx.orca.call([
    "terminal",
    "create",
    "--worktree",
    worktreeSelector(ctx),
    "--title",
    title,
    "--command",
    command,
  ]);
  return { handle: requireHandle(result?.terminal?.handle), tabId: result?.terminal?.tabId };
}

/** @returns {{ handle: string, tabId: string | undefined }} */
function splitPane(ctx, fromHandle, direction, command) {
  const result = ctx.orca.call([
    "terminal",
    "split",
    "--terminal",
    fromHandle,
    "--direction",
    direction,
    "--command",
    command,
  ]);
  return { handle: requireHandle(result?.split?.handle), tabId: result?.split?.tabId };
}

/**
 * Espera o veredito do Orca sobre o terminal recém-criado: a UI o encaixou na
 * aba (`paneRuntimeId` >= 0) ou desistiu (`orphaned`). Pendente é `-1`.
 *
 * Com a janela do Orca sem pintar (tela bloqueada, minimizada), o encaixe fica
 * lento e instável; quando falha, o terminal vira um PTY solto em segundo plano:
 * o projeto roda, segurando portas, sem nenhum painel visível. O Orca só marca
 * `orphaned` ~2 s depois da criação; até lá a listagem ainda mostra o pane na
 * aba, então olhar uma vez só não basta.
 *
 * Versões do Orca sem `paneRuntimeId` não dão o sinal direto: aí só aceitamos o
 * pane depois de um tempo seguro sem virar órfão.
 */
async function assertAdopted(ctx, handle, tabId, paneName) {
  const startedAt = ctx.now();
  for (;;) {
    const terminal = ctx.orca.call(["terminal", "show", "--terminal", handle])?.terminal;
    const elapsed = ctx.now() - startedAt;
    const sameTab = !tabId || !terminal?.tabId || terminal.tabId === tabId;
    if (terminal && terminal.orphaned !== true && sameTab) {
      const attached =
        typeof terminal.paneRuntimeId === "number" ? terminal.paneRuntimeId >= 0 : elapsed >= ADOPTION_SETTLE_MS;
      if (attached) return;
    } else {
      break;
    }
    if (elapsed >= ADOPTION_TIMEOUT_MS) break;
    await ctx.sleep(ADOPTION_POLL_MS);
  }
  throw new CliError(
    `O Orca criou o terminal do pane "${paneName}", mas não o encaixou na aba — a janela do Orca ` +
      "provavelmente está oculta, minimizada ou com a tela bloqueada. Traga o Orca para a frente e rode de novo.",
  );
}

/** Fecha um terminal; só avisa se falhar (um que já sumiu não é problema). */
function closeQuietly(ctx, handle, extraArgs) {
  try {
    ctx.orca.call(["terminal", "close", "--terminal", handle, ...extraArgs]);
  } catch (error) {
    if (!(error instanceof CliError)) throw error;
    if (!isGone(error)) ctx.warn(`Aviso: não consegui fechar ${handle}: ${firstLine(error.message)}`);
  }
}

/**
 * Fecha o que um `up` abriu e não vai usar: os handles que ele recebeu (o
 * primeiro leva a aba inteira, `--tab`) e, depois, qualquer terminal NOVO que
 * seja órfão ou tenha o título da aba — o Orca às vezes cria o terminal e dá
 * timeout antes de devolver o handle, e esse nunca entra na lista. Terminais
 * que já existiam, ou que o usuário abriu por conta própria, ficam intactos.
 * @returns {{ verified: boolean, leftovers: string[] }}
 */
function discardTerminals(ctx, created, knownBefore, title) {
  const [first, ...others] = created;
  for (const handle of others.reverse()) closeQuietly(ctx, handle, []);
  if (first) closeQuietly(ctx, first, ["--tab"]);

  try {
    const strays = () =>
      listTerminals(ctx).filter(
        (terminal) => !knownBefore.has(terminal.handle) && (terminal.orphaned === true || terminal.title === title),
      );
    for (const stray of strays()) closeQuietly(ctx, stray.handle, []);
    return { verified: true, leftovers: strays().map((terminal) => terminal.handle) };
  } catch (error) {
    if (!(error instanceof CliError)) throw error;
    ctx.warn(`Aviso: não consegui conferir o que sobrou: ${firstLine(error.message)}`);
    return { verified: false, leftovers: [] };
  }
}

function describeCleanup(ctx, name, { verified, leftovers }) {
  if (!verified) {
    return `Não consegui conferir se tudo foi fechado: veja os terminais do Orca e, se sobrar algum, rode "${downCommand(ctx, name)}".`;
  }
  if (leftovers.length > 0) {
    const commands = leftovers.map((handle) => `orca terminal close --terminal ${handle}`).join("\n  ");
    return `Sobraram terminais abertos; feche cada um com:\n  ${commands}`;
  }
  return "Tudo o que foi aberto foi fechado.";
}

/** Ctrl+C e SIGTERM durante o `up` viram um pedido de desfazer, em vez de matar o Node no meio. */
function guardInterruption() {
  let interrupted = false;
  const onSignal = () => {
    interrupted = true;
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  return {
    interrupted: () => interrupted,
    release: () => {
      process.off("SIGINT", onSignal);
      process.off("SIGTERM", onSignal);
    },
  };
}

/**
 * Monta o grid, tudo ou nada: cada pane é conferido depois de criado, e qualquer
 * falha — inclusive a de um terminal criado sem handle, um erro inesperado ou um
 * Ctrl+C — fecha o que já foi aberto. Um grid pela metade (ou com projetos
 * rodando escondidos) é pior que nenhum.
 * @returns {Promise<string>} handle do primeiro pane
 */
async function buildGrid(ctx, layout, layoutFile, name) {
  const title = tabTitle(layout);
  const knownBefore = new Set(listTerminals(ctx).map((terminal) => terminal.handle));
  const created = [];
  const handles = [];
  const guard = guardInterruption();
  let failure;

  try {
    let tabId;
    for (const step of planGrid(layout.panes.length, layout.columns)) {
      await ctx.sleep(0); // dá a vez ao event loop: um sinal pendente precisa ser tratado entre os panes
      if (guard.interrupted()) throw new CliError("Interrompido; desfazendo o que foi aberto.", EXIT_INTERRUPTED);

      const command = buildPaneCommand({
        scriptPath: ctx.scriptPath,
        layoutFile,
        index: step.pane,
        platform: ctx.platform,
      });
      const placed =
        step.from === null
          ? createPane(ctx, title, command)
          : splitPane(ctx, handles[step.from], step.direction, command);
      handles[step.pane] = placed.handle;
      created.push(placed.handle);
      tabId ??= placed.tabId;
      await assertAdopted(ctx, placed.handle, tabId, layout.panes[step.pane].name);
    }
    return handles[0];
  } catch (error) {
    failure = error;
  } finally {
    guard.release();
  }

  const cleanup = discardTerminals(ctx, created, knownBefore, title);
  if (!(failure instanceof CliError)) throw failure;
  throw new CliError(`${failure.message}\n${describeCleanup(ctx, name, cleanup)}`, failure.exitCode);
}

/** Traz a aba nova para a frente; se não der, é só um aviso — o grid já está de pé. */
function revealTab(ctx, handle) {
  try {
    ctx.orca.call(["terminal", "switch", "--terminal", handle]);
  } catch (error) {
    if (!(error instanceof CliError)) throw error;
    ctx.warn(`Aviso: não consegui trazer a aba para a frente (${firstLine(error.message)}); ela está na barra de abas.`);
  }
}

// --- up / plan / list -------------------------------------------------------

/**
 * Exige a confirmação de um layout novo ou alterado. A confirmação (`--trust`)
 * carrega o hash do conteúdo revisado: se o arquivo mudou depois da revisão, ela
 * não vale, e o plano novo é mostrado de novo.
 */
function requireTrust(ctx, loaded, name, hash, confirmation) {
  ctx.log(renderPlan(loaded, { trusted: false, hash }));
  const command = `up ${name} --trust ${shortHash(hash)}`;
  if (confirmation === undefined) {
    throw new CliError(
      `O layout "${name}" é novo ou mudou desde a última confirmação. Revise os comandos acima e confirme com: ${command}`,
      EXIT_UNTRUSTED,
    );
  }
  if (!hashMatchesPrefix(hash, confirmation)) {
    throw new CliError(
      `O --trust informado não corresponde ao conteúdo atual do layout "${name}" (o arquivo mudou depois da revisão?). ` +
        `Revise o plano acima e confirme com: ${command}`,
      EXIT_UNTRUSTED,
    );
  }
}

/**
 * Abre a aba do layout e inicia os projetos.
 * @param {Context} ctx
 * @param {string} name
 * @param {{ trust?: string }} [options] `trust`: hash (prefixo) do conteúdo revisado, para um layout novo ou alterado
 * @throws {CliError} código 2 sem layout; código 3 quando falta a confirmação
 */
export async function runUp(ctx, name, { trust } = {}) {
  const loaded = loadLayout(ctx.root, name);
  const { layout, file, text } = loaded;
  assertDirsOk(layout, ctx.root);

  const hash = hashLayout(text);
  const trusted = isTrusted(ctx.trustFile, file, hash);
  if (!trusted) requireTrust(ctx, loaded, name, hash, trust);

  assertOrcaReachable(ctx);
  if (findTabPanes(ctx, name).length > 0) {
    throw new CliError(`A aba do layout "${name}" já está aberta. Rode "${downCommand(ctx, name)}" antes.`);
  }

  if (!trusted) saveTrust(ctx.trustFile, file, hash);
  revealTab(ctx, await buildGrid(ctx, layout, file, name));

  const width = Math.max(...layout.panes.map((pane) => pane.name.length));
  ctx.log(`Aba "${tabTitle(layout)}" aberta com ${layout.panes.length} pane(s):`);
  layout.panes.forEach((pane, index) => {
    ctx.log(`  ${index + 1}. ${pane.name.padEnd(width)}  ${pane.dir}`);
  });
  ctx.log(`Para encerrar: ${downCommand(ctx, name)}`);
}

/**
 * Valida o layout e mostra o que seria feito, sem tocar no Orca.
 * @param {Context} ctx
 * @param {string} name
 */
export function runPlan(ctx, name) {
  const loaded = loadLayout(ctx.root, name);
  const hash = hashLayout(loaded.text);
  ctx.log(renderPlan(loaded, { trusted: isTrusted(ctx.trustFile, loaded.file, hash), hash }));
  assertDirsOk(loaded.layout, ctx.root);
}

/** Lista os layouts do repositório. @param {Context} ctx */
export function runList(ctx) {
  const names = listLayoutNames(ctx.root);
  if (names.length === 0) {
    ctx.log(`Nenhum layout em ${LAYOUTS_DIR} (raiz: ${ctx.root}).`);
    return;
  }
  for (const name of names) {
    // Nome de arquivo também é conteúdo do repositório: sai escapado.
    const shown = printable(name);
    try {
      const { layout } = loadLayout(ctx.root, name);
      ctx.log(`${shown} — "${layout.title}", ${layout.panes.length} pane(s): ${layout.panes.map((pane) => pane.name).join(", ")}`);
    } catch (error) {
      if (!(error instanceof CliError)) throw error;
      ctx.log(`${shown} — inválido: ${firstLine(error.message)}`);
    }
  }
}

// --- down -------------------------------------------------------------------

/**
 * Qual foi o último marcador do `run-pane` no trecho lido: "start" (rodando),
 * "exit" (encerrou) ou null (nenhum no trecho: o `terminal read` só devolve as
 * últimas ~120 linhas, e num projeto falante o `start` já saiu da janela).
 * @param {string[]} lines
 * @returns {"start" | "exit" | null}
 */
export function lastMarker(lines) {
  let last = null;
  for (const line of lines) {
    if (line.includes(EXIT_MARKER)) last = "exit";
    else if (line.includes(START_MARKER)) last = "start";
  }
  return last;
}

/** O trecho termina com o projeto já encerrado? Sem marcador, não dá para afirmar. */
export const hasFinished = (lines) => lastMarker(lines) === "exit";

/**
 * Como o pane está antes do Ctrl+C: já encerrado (nada a esperar) ou rodando, e
 * o cursor do fim da saída — depois dele só entra saída nova, e o marcador de
 * saída do runner sempre cai ali, mesmo que o `start` tenha rolado para fora.
 */
function snapshotPane(ctx, handle) {
  try {
    const terminal = ctx.orca.call(["terminal", "read", "--terminal", handle])?.terminal;
    return { finished: hasFinished(terminal?.tail ?? []), cursor: terminal?.latestCursor };
  } catch (error) {
    if (!(error instanceof CliError)) throw error;
    // Sumiu: nada a esperar. Qualquer outro erro: estado desconhecido, tratado como rodando.
    return { finished: isGone(error), cursor: undefined };
  }
}

/** O runner imprimiu o marcador de saída depois do Ctrl+C? Erro transitório do Orca não conta como "terminou". */
function hasExited(ctx, { handle, cursor }) {
  try {
    const args = ["terminal", "read", "--terminal", handle, ...(cursor === undefined ? [] : ["--cursor", String(cursor)])];
    const tail = ctx.orca.call(args)?.terminal?.tail ?? [];
    return cursor === undefined ? hasFinished(tail) : tail.some((line) => line.includes(EXIT_MARKER));
  } catch (error) {
    if (!(error instanceof CliError)) throw error;
    return isGone(error);
  }
}

/** Espera até todos os panes terminarem ou o prazo acabar. Devolve se todos terminaram. */
async function waitForPanes(ctx, panes, timeoutMs) {
  const deadline = ctx.now() + timeoutMs;
  let pending = panes;
  for (;;) {
    pending = pending.filter((pane) => !hasExited(ctx, pane));
    if (pending.length === 0) return true;
    if (ctx.now() >= deadline) return false;
    await ctx.sleep(POLL_INTERVAL_MS);
  }
}

/** Um handle por aba: `close --tab` fecha a aba inteira com um só pane. */
function onePanePerTab(panes) {
  return [...new Map(panes.map(({ tabId, handle }) => [tabId, handle])).values()];
}

/**
 * Manda Ctrl+C aos projetos, espera eles encerrarem e fecha a aba do layout.
 * Só mexe em abas com a marca ` [nome]` no título, pelo handle: `close --all`
 * derrubaria os terminais de todo o worktree.
 * @param {Context} ctx
 * @param {string} name
 * @param {{ graceSeconds?: number }} [options]
 */
export async function runDown(ctx, name, { graceSeconds = DEFAULT_GRACE_SECONDS } = {}) {
  assertValidName(name);
  const panes = findTabPanes(ctx, name);
  if (panes.length === 0) {
    ctx.log(`Nenhuma aba do layout "${name}" aberta neste worktree.`);
    return;
  }

  const running = panes.map((pane) => ({ ...pane, ...snapshotPane(ctx, pane.handle) })).filter((pane) => !pane.finished);
  for (const { handle } of running) {
    try {
      ctx.orca.call(["terminal", "send", "--terminal", handle, "--interrupt"]);
    } catch (error) {
      if (!(error instanceof CliError)) throw error;
      ctx.warn(`Aviso: não consegui enviar Ctrl+C a ${handle}: ${firstLine(error.message)}`);
    }
  }

  if (running.length > 0) {
    ctx.log(`Ctrl+C enviado a ${running.length} de ${panes.length} pane(s); aguardando até ${graceSeconds}s o encerramento...`);
    if (!(await waitForPanes(ctx, running, graceSeconds * MS_PER_SECOND))) {
      ctx.warn(`Aviso: nem todos os projetos encerraram em ${graceSeconds}s; fechando a aba mesmo assim.`);
    }
  }
  for (const handle of onePanePerTab(panes)) {
    ctx.orca.call(["terminal", "close", "--terminal", handle, "--tab"]);
  }
  ctx.log(`Aba "${panes[0].title}" fechada.`);
}

// --- doctor -----------------------------------------------------------------

function probe(action) {
  try {
    return action() ?? "ok";
  } catch (error) {
    if (!(error instanceof CliError)) throw error;
    return `não (${firstLine(error.message)})`;
  }
}

/**
 * Diagnóstico do ambiente, para quando algo falha numa máquina nova.
 * @param {Context} ctx
 */
export function runDoctor(ctx) {
  const executable = ctx.orca.locate();
  const names = listLayoutNames(ctx.root);
  const rows = [
    ["Plataforma", `${ctx.platform} ${process.arch} · Node ${process.version}`],
    ["Script", ctx.scriptPath],
    ["Raiz do repositório", ctx.root],
    ["CLI do Orca", `${ctx.orca.command} → ${executable ?? "fora do PATH"} (versão ${ctx.orca.version() ?? "?"})`],
    ["Orca acessível", probe(() => ctx.orca.call(["status"]) && "sim")],
    [
      "Worktree no Orca",
      probe(() => ctx.orca.call(["worktree", "show", "--worktree", worktreeSelector(ctx)]) && "sim"),
    ],
    [`Layouts em ${LAYOUTS_DIR}`, names.length > 0 ? names.map(printable).join(", ") : "nenhum"],
    ["Arquivo de confiança", ctx.trustFile],
  ];
  const width = Math.max(...rows.map(([label]) => label.length));
  for (const [label, value] of rows) ctx.log(`${label.padEnd(width)}  ${value}`);

  const isCmdShim = ctx.platform === "win32" && executable && /\.(cmd|bat)$/i.test(executable);
  if (isCmdShim && [ctx.scriptPath, ctx.root].some(needsQuoting)) {
    ctx.warn(
      "Aviso: o CLI do Orca é um .cmd e há espaços ou caracteres especiais (acentos, parênteses...) no caminho da " +
        "skill ou do repositório; o comando dos panes pode ser recusado. Use caminhos só com letras ASCII, números e . _ - /.",
    );
  }
}
