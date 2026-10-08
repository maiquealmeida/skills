/**
 * Códigos de saída. O agente decide o próximo passo olhando para eles:
 * 2 → criar o layout; 3 → pedir confirmação ao usuário e repetir com --trust.
 */
export const EXIT_OK = 0;
export const EXIT_ERROR = 1;
export const EXIT_LAYOUT_NOT_FOUND = 2;
export const EXIT_UNTRUSTED = 3;
/** Convenção dos shells para término por Ctrl+C: 128 + SIGINT. */
export const EXIT_INTERRUPTED = 130;

/** Erro esperado (entrada inválida, Orca fora do ar...): vira mensagem, sem stack trace. */
export class CliError extends Error {
  /**
   * @param {string} message
   * @param {number} [exitCode]
   * @param {string} [orcaCode] código de erro do Orca, quando o erro veio dele
   */
  constructor(message, exitCode = EXIT_ERROR, orcaCode = undefined) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
    this.orcaCode = orcaCode;
  }
}
