#!/usr/bin/env node
/**
 * Layouts de terminais do Orca — Node puro, sem dependências.
 *
 * Abre no Orca uma aba com um grid de panes, um por projeto, a partir de
 * `.orca/layouts/<nome>.layout.json` (na raiz do repositório), e inicia cada
 * projeto em modo de desenvolvimento. Roda igual em macOS, Linux e Windows:
 * não usa `jq`, `bash` nem sintaxe de shell. Os panes digitam só
 * `node <este arquivo> run-pane ...`, então o shell de cada pane não importa.
 *
 * A lógica mora em `lib/`; este arquivo só lê os argumentos e despacha. Assim
 * ele roda igual por symlink (como a CLI de skills instala) e os módulos podem
 * ser importados pelos testes sem executar nada.
 */
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { DEFAULT_GRACE_SECONDS, runDoctor, runDown, runList, runPlan, runUp } from "./lib/commands.mjs";
import { CliError, EXIT_ERROR, EXIT_OK } from "./lib/errors.mjs";
import { DEFAULT_LAYOUT_NAME, assertValidName, findRepoRoot } from "./lib/layout.mjs";
import { createOrcaClient } from "./lib/orca.mjs";
import { runPane } from "./lib/runner.mjs";
import { trustFilePath } from "./lib/trust.mjs";

const ACTIONS = new Set(["up", "down", "plan", "list", "doctor"]);
const ACTIONS_WITHOUT_NAME = new Set(["list", "doctor"]);
const RUN_PANE = "run-pane";

const HELP = `Uso: orca-layout.mjs [ação] [nome] [opções]

Ações:
  up [nome]     abre a aba do layout e inicia os projetos (padrão)
  down [nome]   envia Ctrl+C, espera os projetos encerrarem e fecha a aba
  plan [nome]   valida o layout e mostra o que seria executado (não toca no Orca)
  list          lista os layouts do repositório
  doctor        diagnostica o ambiente (Orca, Node, caminhos)

O nome padrão é "${DEFAULT_LAYOUT_NAME}" (.orca/layouts/${DEFAULT_LAYOUT_NAME}.layout.json).
"orca-layout.mjs backend" equivale a "up backend".

Opções:
  --trust <hash>  confirma um layout novo ou alterado: repete o "Hash:" do plano que você revisou
  --grace <s>     segundos de espera pelo encerramento no down (padrão ${DEFAULT_GRACE_SECONDS})
  --root <dir>    raiz do repositório (padrão: a do diretório atual)
  -h, --help      mostra esta ajuda

Códigos de saída: 0 ok · 1 erro · 2 layout não encontrado · 3 layout não confirmado (use --trust <hash>)`;

function parseCliArgs(argv) {
  try {
    return parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        trust: { type: "string" },
        grace: { type: "string" },
        root: { type: "string" },
        help: { type: "boolean", short: "h" },
      },
    });
  } catch (error) {
    throw new CliError(`${error.message}\n\n${HELP}`);
  }
}

function parseGraceSeconds(value) {
  if (value === undefined) return DEFAULT_GRACE_SECONDS;
  const seconds = Number(value);
  if (!Number.isInteger(seconds) || seconds < 0) {
    throw new CliError(`--grace deve ser um número inteiro de segundos (recebi "${value}").`);
  }
  return seconds;
}

function createContext(values) {
  return {
    root: values.root ? resolve(values.root) : findRepoRoot(process.cwd()),
    scriptPath: fileURLToPath(import.meta.url),
    platform: process.platform,
    trustFile: trustFilePath(),
    orca: createOrcaClient(),
    log: (line) => console.log(line),
    warn: (line) => console.error(line),
    sleep,
    now: Date.now,
  };
}

/**
 * @param {string[]} argv
 * @returns {Promise<number>} código de saída
 */
async function main(argv) {
  const { values, positionals } = parseCliArgs(argv);
  if (values.help) {
    console.log(HELP);
    return EXIT_OK;
  }

  const [first, ...rest] = positionals;
  if (first === RUN_PANE) return runPane(rest[0], rest[1]);

  // `orca-layout.mjs backend` é atalho de `up backend`.
  const action = ACTIONS.has(first) ? first : "up";
  const names = ACTIONS.has(first) ? rest : positionals;
  const maxNames = ACTIONS_WITHOUT_NAME.has(action) ? 0 : 1;
  if (names.length > maxNames) throw new CliError(`Argumentos demais para "${action}".\n\n${HELP}`);

  const name = names[0] ?? DEFAULT_LAYOUT_NAME;
  if (maxNames > 0) assertValidName(name);

  const ctx = createContext(values);
  switch (action) {
    case "up":
      await runUp(ctx, name, { trust: values.trust });
      break;
    case "down":
      await runDown(ctx, name, { graceSeconds: parseGraceSeconds(values.grace) });
      break;
    case "plan":
      runPlan(ctx, name);
      break;
    case "list":
      runList(ctx);
      break;
    case "doctor":
      runDoctor(ctx);
      break;
  }
  return EXIT_OK;
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    if (error instanceof CliError) {
      console.error(`Erro: ${error.message}`);
      process.exitCode = error.exitCode;
      return;
    }
    console.error(error?.stack ?? error);
    process.exitCode = EXIT_ERROR;
  },
);
