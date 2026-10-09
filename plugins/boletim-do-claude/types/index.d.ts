/** Os três degraus de cada critério, do pior para o melhor. */
export type Degrau = 'fraco' | 'ok' | 'ótimo'

/** Um comando de shell que o turno rodou. */
export type Comando = {
  comando: string
  /** Não teve deny e não deu erro. */
  ok: boolean
  /** Parece teste, tipagem, lint ou build. */
  teste: boolean
}

/** O que o turno em andamento já fez: o pedido, os arquivos mexidos e os comandos rodados. */
export type Turno = {
  pedido: string
  arquivos: string[]
  comandos: Comando[]
}

/** A nota de um critério no turno avaliado. */
export type Resultado = {
  nome: string
  degrau: Degrau
  /** De 0 a 1, como o Jev devolve. */
  confianca: number
  /** A regra do critério, a que o /melhorar grava no CLAUDE.md. */
  regra: string
}

/** O boletim de um turno: avaliando, sem nota (Jev fora) ou pronto. */
export type Avaliacao =
  | { estado: 'avaliando'; id: string }
  | { estado: 'fora'; id: string }
  | {
      estado: 'ok'
      id: string
      /** Média do turno, com uma casa decimal. */
      nota: number
      /** Quanto o Jev demorou para responder. */
      ms: number
      resultados: Resultado[]
      /** Até 2 critérios abaixo de ótimo, do mais baixo para o mais alto. */
      melhorias: Resultado[]
    }

/** Onde o boletim aparece agora: painel ao lado, faixa acima do prompt ou em lugar nenhum. */
export type Onde = 'painel' | 'faixa' | null

declare module 'claude-code' {
  interface PluginState {
    'boletim-do-claude': {
      turno: Turno
      avaliacao: Avaliacao | null
      historico: number[]
      onde: Onde
    }
  }
}
