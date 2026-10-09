// Motor falso dos testes: tudo o que fica por baixo do mod. O Jev responde o que o
// teste mandar, o sistema de arquivos e o store vivem na memória, o relógio só anda
// quando o teste anda, e o painel tem ou não tem espaço conforme o teste decidir.

import { mock } from 'claude-code/testing'
import type { MockClock } from 'claude-code/testing'
import type { On } from 'claude-code'

import { URL_DO_JEV } from '../hooks/jev'

export const PLUGIN = 'boletim-do-claude'
export const RAIZ_COM_BARRA_INVERTIDA = 'C:\\repo'
export const RAIZ = 'C:/repo'
export const CHAVE = 'sk-ts-segredo-123456'
export const ENV_COM_CHAVE = `# chaves\nexport TYPESAFE_API_KEY="${CHAVE}" # chave do Jev\n`
export const HOME = '/home/maique'
/** A chave vem do ~/.env.local; o .env.local da raiz do projeto não conta. */
export const ARQUIVO_ENV = `${HOME}/.env.local`
export const ARQUIVO_ENV_DO_PROJETO = `${RAIZ}/.env.local`
export const ARQUIVO_CLAUDE = `${RAIZ}/CLAUDE.md`

export const REGRAS = {
  resumo: 'Ao terminar, resuma em poucas linhas o que mudou e em quais arquivos.',
  conferir: 'Ao terminar, diga como eu confiro na tela: qual página abrir e o que fazer.',
  prova: 'Antes de dizer que terminou, rode os testes e diga o resultado.',
  suposicoes: 'Quando decidir algo que eu não especifiquei, avise no final o que decidiu.',
  tamanho: 'Mexa só no que o pedido exige; se achar outra melhoria, sugira em vez de fazer.',
  proximo: 'Termine sugerindo um próximo passo que faça sentido.',
} as const

export const CRITERIOS = [
  { nome: 'Resumo final', pergunta: 'Disse o que mudou e em quais arquivos?', regra: REGRAS.resumo },
  { nome: 'Como conferir', pergunta: 'Disse qual página abrir e o que clicar?', regra: REGRAS.conferir },
  { nome: 'Prova', pergunta: 'Rodou testes e disse o resultado?', regra: REGRAS.prova },
  { nome: 'Suposições', pergunta: 'Avisou o que decidiu sozinho?', regra: REGRAS.suposicoes },
  { nome: 'Tamanho da mudança', pergunta: 'Mexeu só no que o pedido exigia?', regra: REGRAS.tamanho },
  { nome: 'Próximo passo', pergunta: 'Sugeriu um próximo passo concreto?', regra: REGRAS.proximo },
].map((criterio, posicao) =>
  // O primeiro critério descreve os degraus; os outros caem nos textos genéricos.
  posicao === 0 ? { ...criterio, degraus: { fraco: 'F0', ok: 'O0', ótimo: 'T0' } } : criterio,
)

export const CRITERIOS_EM_JSON = JSON.stringify({ criterios: CRITERIOS })

/** O que o Jev responde: uma nota (0 a 2, pode ser fracionária) por critério, ou uma falha. */
export type RespostaDoJev =
  | { tipo: 'notas'; scores: readonly number[]; confianca?: number }
  | { tipo: 'http'; status: number; corpo: string }
  | { tipo: 'rede'; erro: string }
  | { tipo: 'corpo'; corpo: string }

export type ChamadaAoJev = {
  url: string
  method: string | undefined
  headers: Record<string, string>
  corpo: {
    model: string
    state: {
      pedido: string
      arquivos: string[]
      comandos: { comando: string; resultado: string; teste: boolean }[]
      resposta: string
    }
    questions: Record<
      string,
      { type: string; instructions: { tarefa: string; criterio: string; pergunta: string }; criteria: string[] }
    >
  }
}

type SaidaDaFerramenta = 'ok' | 'erro' | 'negada'

export type Motor = {
  relogio: MockClock
  /** O que o mod escreveu na conversa e no log de debug. */
  conversa: string[]
  depuracao: string[]
  /** Pedidos feitos ao Jev, na ordem. */
  requisicoes: ChamadaAoJev[]
  /** Arquivos em memória, pelo caminho que o mod mandou (com `/`). */
  arquivos: Map<string, string>
  leituras: string[]
  store: Map<string, unknown>
  aberturas: { id: string; title: string | undefined }[]
  fechamentos: { id: string; origem: string }[]
  comandos: string[]
  /** O que cada ferramenta devolveu, para conferir que o mod não mexeu em nada. */
  resultadosDasFerramentas: unknown[]
  responderJev: (resposta: RespostaDoJev) => void
  /** Faz o Jev segurar a requisição de número `numero` (1, 2, ...) até chamar o que volta. */
  segurarJev: (numero: number) => () => void
  /** Põe ou tira o espaço do painel: sem espaço, `ui.open` devolve isPlaced false. */
  definirEspaco: (temEspaco: boolean) => void
  /** Decide como cada chamada de ferramenta termina (padrão: ok). */
  definirFerramentas: (decidir: (entrada: Record<string, unknown>) => SaidaDaFerramenta) => void
  definirCriterios: (texto: string) => void
  /** Com um motivo, o motor descarta os prompts (`{ drop }`); com null, deixa entrar. */
  descartarPrompts: (motivo: string | null) => void
  recusarComandos: (recusa: boolean) => void
  falharEscrita: (falha: boolean) => void
}

export type OpcoesDoMotor = {
  /** Conteúdo do ~/.env.local (em HOME); null = o arquivo não existe. */
  env?: string | null
  /** As variáveis de ambiente que o mod enxerga; padrão: só HOME. */
  variaveis?: Readonly<Record<string, string>>
  /** Conteúdo do CLAUDE.md; ausente = o arquivo não existe. */
  claude?: string
  store?: Readonly<Record<string, unknown>>
  temEspaco?: boolean
  latenciaDoJevMs?: number
}

const ERRO_DE_SAIDA = 'falhou de propósito'

// Neste Mac o motor resolve `C:/repo/x` contra a pasta do mod antes de chegar aqui. O que
// interessa é o que o mod mandou, então o caminho volta a começar em `C:/`.
const comoOModMandou = (caminho: string): string => {
  const inicio = caminho.indexOf('C:/')
  return inicio === -1 ? caminho : caminho.slice(inicio)
}

type Probabilidades = Record<string, number>

/** O corpo de uma resposta do Jev, no formato da API: `answers` por id, `usage` e `model`. */
export function corpoDoJev(
  scores: readonly number[],
  opcoes: { confianca?: number; probabilidades?: readonly Probabilidades[]; sem?: readonly number[] } = {},
): string {
  const answers = Object.fromEntries(
    scores
      .map((score, posicao) => ({ score, posicao }))
      .filter(({ posicao }) => !opcoes.sem?.includes(posicao))
      .map(({ score, posicao }) => {
        const baixo = Math.min(2, Math.floor(score))
        const peso = score - baixo
        const derivadas = { '0': 0, '1': 0, '2': 0, [String(baixo)]: 1 - peso, [String(Math.min(2, baixo + 1))]: peso }
        return [
          `c${posicao}`,
          {
            type: 'score',
            score,
            confidence: opcoes.confianca ?? 0.9,
            probabilities: opcoes.probabilidades?.[posicao] ?? derivadas,
            legend: { '0': 'fraco', '1': 'ok', '2': 'ótimo' },
          },
        ]
      }),
  )
  return JSON.stringify({ model: 'jev-1.13.0', answers, usage: { input_tokens: 296, output_tokens: 20 } })
}

/** Registra o motor falso em `on`. Chame antes da primeira chamada em `$`: é ela que carrega o mod. */
export function criarMotor(on: On, opcoes: OpcoesDoMotor = {}): Motor {
  const relogio = mock.clock(on, { now: 1_000 })
  const arquivos = new Map<string, string>()
  const store = new Map<string, unknown>(Object.entries(opcoes.store ?? {}))
  const conversa: string[] = []
  const depuracao: string[] = []
  const requisicoes: ChamadaAoJev[] = []
  const leituras: string[] = []
  const aberturas: Motor['aberturas'] = []
  const fechamentos: Motor['fechamentos'] = []
  const comandos: string[] = []
  const resultadosDasFerramentas: unknown[] = []
  const retencoes = new Map<number, Promise<void>>()
  let resposta: RespostaDoJev = { tipo: 'notas', scores: [2, 2, 2, 2, 2, 2] }
  let temEspaco = opcoes.temEspaco ?? true
  let decidir: (entrada: Record<string, unknown>) => SaidaDaFerramenta = () => 'ok'
  let criterios = CRITERIOS_EM_JSON
  let descarte: string | null = null
  let comandosRecusados = false
  let escritaFalha = false

  const env = opcoes.env === undefined ? ENV_COM_CHAVE : opcoes.env
  if (env !== null) arquivos.set(ARQUIVO_ENV, env)
  if (opcoes.claude !== undefined) arquivos.set(ARQUIVO_CLAUDE, opcoes.claude)

  mock.env(on, opcoes.variaveis ?? { HOME })
  on('session.root', () => ({ value: RAIZ_COM_BARRA_INVERTIDA }))

  on('fs.read', (_$, e) => {
    const caminho = comoOModMandou(e.path)
    leituras.push(caminho)
    if (caminho.endsWith('/criterios.json')) return { value: criterios }
    const texto = arquivos.get(caminho)
    return texto === undefined ? { deny: `ENOENT: ${caminho}` } : { value: texto }
  })
  on('fs.exists', (_$, e) => ({ value: arquivos.has(comoOModMandou(e.path)) }))
  on('fs.write', (_$, e) => {
    if (escritaFalha) return { deny: 'EACCES: sem permissão' }
    arquivos.set(comoOModMandou(e.path), e.text)
    return { value: undefined }
  })

  on('store.get', (_$, e) => ({ value: store.get(e.key) }))
  on('store.set', (_$, e) => {
    store.set(e.key, JSON.parse(JSON.stringify(e.value)))
    return { value: undefined }
  })
  on('store.delete', (_$, e) => {
    store.delete(e.key)
    return { value: undefined }
  })
  on('store.keys', () => ({ value: [...store.keys()] }))

  on('ui.log', (_$, e) => {
    ;(e.to === 'debug' ? depuracao : conversa).push(e.text)
    return { value: undefined }
  })
  on('ui.open', (_$, e) => {
    aberturas.push({ id: e.id, title: e.title })
    return { value: temEspaco ? { isPlaced: true } : { isPlaced: false, reason: 'o terminal está estreito' } }
  })
  on('ui.close', (_$, e) => {
    fechamentos.push({ id: e.id, origem: e.origin.kind })
    return { value: undefined }
  })
  on('command.register', (_$, e) => {
    if (comandosRecusados) return { deny: 'comandos indisponíveis' }
    comandos.push(e.name)
    return { value: { command: e.name } }
  })

  on('http.fetch', async (_$, e) => {
    if (e.url !== URL_DO_JEV) return { deny: `url inesperada: ${e.url}` }
    const corpo = JSON.parse(e.init?.body ?? '{}') as ChamadaAoJev['corpo']
    requisicoes.push({ url: e.url, method: e.init?.method, headers: { ...e.init?.headers }, corpo })
    await retencoes.get(requisicoes.length)
    await relogio.advance(opcoes.latenciaDoJevMs ?? 0)
    if (resposta.tipo === 'rede') return { deny: resposta.erro }
    const status = resposta.tipo === 'http' ? resposta.status : 200
    const texto =
      resposta.tipo === 'notas'
        ? corpoDoJev(resposta.scores, { confianca: resposta.confianca })
        : resposta.corpo
    return { value: { status, ok: status >= 200 && status < 300, headers: {}, text: texto } }
  })

  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_$, e) => (descarte === null ? { text: e.text } : { drop: descarte }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('ui.render', () => ({ type: 'Box' }))
  on('tool.call', (_$, e) => {
    const saida = decidir(e as unknown as Record<string, unknown>)
    const resultado =
      saida === 'negada'
        ? { deny: ERRO_DE_SAIDA }
        : saida === 'erro'
          ? { isError: true as const, result: undefined, text: ERRO_DE_SAIDA }
          : { result: { ferramenta: e.tool }, text: 'ok' }
    resultadosDasFerramentas.push(resultado)
    return resultado
  })

  return {
    relogio,
    conversa,
    depuracao,
    requisicoes,
    arquivos,
    leituras,
    store,
    aberturas,
    fechamentos,
    comandos,
    resultadosDasFerramentas,
    responderJev: nova => {
      resposta = nova
    },
    segurarJev: numero => {
      let liberar: () => void = () => undefined
      retencoes.set(numero, new Promise<void>(resolver => (liberar = resolver)))
      return () => liberar()
    },
    definirEspaco: valor => {
      temEspaco = valor
    },
    definirFerramentas: nova => {
      decidir = nova
    },
    definirCriterios: texto => {
      criterios = texto
    },
    descartarPrompts: motivo => {
      descarte = motivo
    },
    recusarComandos: recusa => {
      comandosRecusados = recusa
    },
    falharEscrita: falha => {
      escritaFalha = falha
    },
  }
}
