/**
 * Higiene de texto. O layout vem do repositório (conteúdo não confiável) e o que
 * está nele aparece no terminal de quem revisa o plano, nas mensagens de erro e
 * na linha digitada nos panes. Caracteres de controle ali permitem apagar linhas
 * do plano (ESC[2K), forjar linhas novas (\n) ou inverter a leitura (bidi).
 */

/** Controle (C0, DEL, C1), formatação (bidi, largura zero) e separadores de linha/parágrafo. */
export const UNSAFE_TEXT_CHARS = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
const UNSAFE_TEXT_CHARS_EVERYWHERE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;

/**
 * Troca cada caractere perigoso por `\uXXXX`, para citar com segurança um texto
 * que não passou pela validação (chaves desconhecidas, mensagens do JSON.parse).
 * @param {unknown} text
 * @returns {string}
 */
export function printable(text) {
  return String(text).replace(
    UNSAFE_TEXT_CHARS_EVERYWHERE,
    (char) => `\\u${char.codePointAt(0).toString(16).padStart(4, "0")}`,
  );
}

/** Primeira linha não vazia de um texto, para mensagens curtas. */
export function firstLine(text) {
  return (
    String(text ?? "")
      .split(/\r?\n/)
      .find((line) => line.trim() !== "")
      ?.trim() ?? ""
  );
}
