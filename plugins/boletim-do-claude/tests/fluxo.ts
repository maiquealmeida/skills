// Os passos de uma sessão e de um turno, do jeito que o motor os levanta.

import type { Engine } from 'claude-code/testing'

import type { Motor } from './motor'

export type Ferramenta = { tool: string } & Record<string, unknown>

export type TurnoDeTeste = {
  id: string
  pedido?: string
  resposta?: string
  ferramentas?: readonly Ferramenta[]
}

export const EDIT = (arquivo: string): Ferramenta => ({
  tool: 'Edit',
  file_path: arquivo,
  old_string: 'a',
  new_string: 'b',
})
export const WRITE = (arquivo: string): Ferramenta => ({ tool: 'Write', file_path: arquivo, content: 'x' })
export const BASH = (comando: string): Ferramenta => ({ tool: 'Bash', command: comando })

/** Digita `/comando` como a pessoa digitaria e devolve o texto que ele mostra. */
export async function rodarComando($: Engine, comando: string): Promise<string | undefined> {
  const { text } = await $.command.run({
    command: comando,
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 120 },
  })
  return text
}

export async function iniciarSessao($: Engine): Promise<void> {
  await $.session.start({ cwd: '/x', surface: 'terminal', isInteractive: true })
}

/** `$.tool.call` sem a tipagem fechada: aqui cabem ferramentas que esta build nem conhece. */
export function chamar($: Engine, ferramenta: Ferramenta): Promise<unknown> {
  const ferramentas = $.tool as unknown as { call: (entrada: unknown) => Promise<unknown> }
  return ferramentas.call(ferramenta)
}

export async function comecarTurno($: Engine, turno: TurnoDeTeste): Promise<void> {
  const pedido = turno.pedido ?? `pedido ${turno.id}`
  await $.prompt.submit({ text: pedido, wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: pedido, turnId: turno.id })
  for (const ferramenta of turno.ferramentas ?? []) {
    await chamar($, ferramenta)
  }
}

export async function terminarTurno(
  $: Engine,
  turno: TurnoDeTeste,
  extras: { agentId?: string } = {},
): Promise<void> {
  await $.turn.complete({
    answer: turno.resposta ?? `resposta ${turno.id}`,
    durationMs: 10,
    isAborted: false,
    turnId: turno.id,
    reason: 'answer',
    ...extras,
  })
}

const MAX_TENTATIVAS = 50

/** Deixa o relógio andar até a condição valer: a avaliação tem vários passos com o motor. */
export async function esperarAte(motor: Motor, condicao: () => boolean): Promise<void> {
  for (let tentativa = 0; tentativa < MAX_TENTATIVAS && !condicao(); tentativa += 1) {
    await motor.relogio.settle()
  }
}

/** Deixa o relógio andar um pouco, para provar que nada acontece. */
export async function deixarPassar(motor: Motor): Promise<void> {
  await esperarAte(motor, () => false)
}

/** Um turno inteiro e a avaliação dele, que corre quando o relógio anda e termina com uma linha na conversa. */
export async function rodarTurno($: Engine, motor: Motor, turno: TurnoDeTeste): Promise<void> {
  const linhasAntes = motor.conversa.length
  await comecarTurno($, turno)
  await terminarTurno($, turno)
  await esperarAte(motor, () => motor.conversa.length > linhasAntes)
}
