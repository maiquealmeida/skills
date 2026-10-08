/**
 * Confiança por hash, no estilo do direnv: um layout do repositório faz o Orca
 * digitar comandos na máquina do usuário, então um arquivo novo ou alterado só
 * roda depois de uma confirmação explícita (`--trust <hash>`). O hash do
 * conteúdo fica guardado por caminho de arquivo; qualquer edição (ou `git pull`)
 * o invalida. A confirmação carrega o hash revisado, então ela vale para
 * aquele conteúdo e não para o que o arquivo virar depois.
 *
 * Quem executa (`run-pane`) confere esta mesma confiança: sem ela, uma linha
 * antiga no histórico do pane rodaria o conteúdo novo do arquivo sem revisão.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { CliError } from "./errors.mjs";

const STATE_DIR_ENV = "ORCA_LAYOUT_STATE_DIR";
/** Quantos caracteres do hash aparecem no plano e são exigidos no `--trust`. */
export const HASH_DISPLAY_LENGTH = 16;
/** O mínimo aceito no `--trust`: 48 bits, fora do alcance de uma colisão de propósito. */
const MIN_TRUST_PREFIX_LENGTH = 12;
const STATE_DIR_MODE = 0o700;
const STATE_FILE_MODE = 0o600;

/**
 * Onde o hash dos layouts confiáveis é guardado. `ORCA_LAYOUT_STATE_DIR`
 * redireciona o diretório (os testes usam isso para não tocar no home); os
 * panes herdam o ambiente do Orca, então o redirecionamento só vale para quem
 * o define no ambiente do próprio Orca.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function trustFilePath(env = process.env) {
  const dir = env[STATE_DIR_ENV] || join(homedir(), ".config", "orca-layout");
  return join(dir, "trusted.json");
}

/** SHA-256 do conteúdo exato do arquivo. */
export function hashLayout(text) {
  return createHash("sha256").update(text).digest("hex");
}

/** O pedaço do hash que o plano mostra e o `--trust` repete. */
export const shortHash = (hash) => hash.slice(0, HASH_DISPLAY_LENGTH);

/** O `--trust` informado (um prefixo do hash) corresponde a este conteúdo? */
export function hashMatchesPrefix(hash, prefix) {
  return (
    typeof prefix === "string" &&
    prefix.length >= MIN_TRUST_PREFIX_LENGTH &&
    /^[0-9a-f]+$/i.test(prefix) &&
    hash.startsWith(prefix.toLowerCase())
  );
}

/** Chave estável por arquivo; no Windows ignora caixa e barra, como o sistema de arquivos. */
function trustKey(layoutFile, platform = process.platform) {
  const absolute = resolve(layoutFile);
  return platform === "win32" ? absolute.replace(/\\/g, "/").toLowerCase() : absolute;
}

function readStore(file) {
  try {
    const store = JSON.parse(readFileSync(file, "utf8"));
    return store !== null && typeof store === "object" && !Array.isArray(store) ? store : {};
  } catch {
    // Sem arquivo, ou ilegível: nada é confiável ainda — o caminho seguro. O
    // próximo `saveTrust` o reescreve.
    return {};
  }
}

/**
 * @param {string} file arquivo de confiança
 * @param {string} layoutFile caminho do layout
 * @param {string} hash resultado de `hashLayout`
 * @returns {boolean}
 */
export function isTrusted(file, layoutFile, hash) {
  return readStore(file)[trustKey(layoutFile)] === hash;
}

/**
 * Marca o conteúdo atual do layout como confiável. Escreve num temporário e
 * renomeia (nunca deixa o arquivo pela metade), com permissão só do dono: a
 * lista de repositórios confiáveis não é para os outros usuários da máquina.
 */
export function saveTrust(file, layoutFile, hash) {
  const store = { ...readStore(file), [trustKey(layoutFile)]: hash };
  const temp = `${file}.${process.pid}.tmp`;
  try {
    mkdirSync(dirname(file), { recursive: true, mode: STATE_DIR_MODE });
    writeFileSync(temp, `${JSON.stringify(store, null, 2)}\n`, { mode: STATE_FILE_MODE });
    renameSync(temp, file);
  } catch (error) {
    try {
      rmSync(temp, { force: true });
    } catch {
      // Melhor esforço: o erro que importa ao usuário é o da gravação, não o da limpeza.
    }
    throw new CliError(`Não consegui gravar a confiança em ${file}: ${error.message}`);
  }
}
