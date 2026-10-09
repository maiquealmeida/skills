// Tudo o que não precisa do motor: requisição ao Jev, notas, gráfico, textos do
// boletim e edição do CLAUDE.md. Sem `$`, sem relógio, sem arquivo: só entra
// valor e sai valor, para dar para testar sem motor.

import type { Avaliacao, Comando, Degrau, Resultado, Turno } from '../types'

export type Criterio = {
  nome: string
  pergunta: string
  regra: string
  degraus: Readonly<Record<Degrau, string>>
}

/** O turno como o Jev o vê: o que foi pedido, o que foi feito e o que foi respondido. */
export type Retrato = {
  pedido: string
  arquivos: readonly string[]
  comandos: readonly Comando[]
  resposta: string
}

export type AvaliacaoPronta = Extract<Avaliacao, { estado: 'ok' }>

export type PerguntaDoJev = {
  type: 'score'
  instructions: { tarefa: string; criterio: string; pergunta: string }
  criteria: string[]
}

export type RequisicaoDoJev = {
  model: string
  state: {
    pedido: string
    arquivos: string[]
    comandos: { comando: string; resultado: 'deu certo' | 'falhou'; teste: boolean }[]
    resposta: string
  }
  questions: Record<string, PerguntaDoJev>
}

/** Um pedaço de texto com estilo. Uma linha do boletim é uma lista deles. */
export type Trecho = {
  texto: string
  cor?: 'green' | 'red' | 'yellow'
  negrito?: boolean
  discreto?: boolean
}

export type Linha = readonly Trecho[]

export type TomDaLinha = 'normal' | 'discreto' | 'aviso'

/** O que uma chamada de ferramenta deixa no retrato do turno. */
export type Registro = { arquivo: string } | { comando: Comando }

/** O que o /melhorar faz: avisa que não há o que gravar, ou grava estas regras. */
export type Plano = { tipo: 'aviso'; texto: string } | { tipo: 'regras'; regras: string[] }

export type RegrasIncluidas = {
  conteudo: string
  adicionadas: string[]
  jaExistiam: string[]
}

export const URL_DO_JEV = 'https://api.typesafe.ai/v1/systemone'
export const MODELO_DO_JEV = 'jev-latest'
export const NOME_DA_CHAVE = 'TYPESAFE_API_KEY'
export const TITULO_DA_SECAO = '## Regras do boletim'
export const TURNO_VAZIO: Turno = { pedido: '', arquivos: [], comandos: [] }
export const DEGRAUS: readonly Degrau[] = ['fraco', 'ok', 'ótimo']

const PONTOS_DO_DEGRAU: Readonly<Record<Degrau, number>> = { fraco: 2, ok: 6, ótimo: 10 }
const DEGRAUS_GENERICOS: Readonly<Record<Degrau, string>> = {
  fraco: 'não atende ao critério',
  ok: 'atende em parte',
  ótimo: 'atende bem',
}
const COR_DO_DEGRAU: Readonly<Record<Degrau, Trecho['cor']>> = {
  fraco: 'red',
  ok: undefined,
  ótimo: 'green',
}
const TAREFA =
  'Você avalia a resposta final de um assistente de programação (o Claude Code) a um pedido do usuário. ' +
  'O state descreve o turno: "pedido" é o que o usuário pediu; "arquivos" são os arquivos que o assistente alterou; ' +
  '"comandos" são os comandos de shell que ele rodou, cada um com o "resultado" ("deu certo" ou "falhou") e ' +
  '"teste" (true quando é teste, tipagem, lint ou build); "resposta" é a mensagem final que o usuário leu. ' +
  'Julgue só o critério abaixo, usando apenas esses dados.'

const FERRAMENTAS_DE_ARQUIVO: ReadonlySet<string> = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])
const FERRAMENTAS_DE_SHELL: ReadonlySet<string> = new Set(['Bash', 'PowerShell'])
const PADRAO_DE_TESTE = /test|tests|vitest|jest|pytest|mocha|playwright|cypress|tsc|lint|eslint|build/i

const NOTA_MAXIMA = 10
const CONFIANCA_BAIXA = 0.6
const MAX_PEDIDO = 2000
const MAX_RESPOSTA = 8000
const MAX_COMANDO = 300
const MAX_GUARDADOS = 50
const MAX_ARQUIVOS_ENVIADOS = 50
const MAX_COMANDOS_ENVIADOS = 30
const MAX_HISTORICO = 20
const MAX_MELHORIAS = 2
const MAX_NOTAS_NO_TEXTO = 6
const MAX_TRECHO_DO_CORPO = 200
const LARGURA_DA_BARRA = 10
const LARGURA_DO_DEGRAU = 5
const ESCALA_DO_GRAFICO = '▁▂▃▄▅▆▇█'
const SEPARADOR_DE_NOTAS = ' → '
const LINHA_EM_BRANCO: Linha = []

const ehObjeto = (valor: unknown): valor is Record<string, unknown> =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor)

const ehTexto = (valor: unknown): valor is string => typeof valor === 'string' && valor.trim() !== ''

function lerJson(texto: string, origem: string): unknown {
  try {
    return JSON.parse(texto)
  } catch {
    throw new Error(`${origem} não é um JSON válido`)
  }
}

// ── Critérios (criterios.json) ──────────────────────────────────────────────

function degrausDe(bruto: unknown): Record<Degrau, string> {
  const dado = ehObjeto(bruto) ? bruto : {}
  const textoDe = (degrau: Degrau): string => {
    const valor = dado[degrau]
    return ehTexto(valor) ? valor.trim() : DEGRAUS_GENERICOS[degrau]
  }
  return { fraco: textoDe('fraco'), ok: textoDe('ok'), ótimo: textoDe('ótimo') }
}

function criterioDe(item: unknown): Criterio[] {
  if (!ehObjeto(item) || !ehTexto(item.nome) || !ehTexto(item.pergunta) || !ehTexto(item.regra)) {
    return []
  }
  return [
    {
      nome: item.nome.trim(),
      pergunta: item.pergunta.trim(),
      regra: item.regra.trim(),
      degraus: degrausDe(item.degraus),
    },
  ]
}

/** Lê o criterios.json. Item sem nome, pergunta ou regra é ignorado; lista vazia é erro. */
export function parseCriterios(texto: string): Criterio[] {
  const bruto = lerJson(texto, 'criterios.json')
  const lista = ehObjeto(bruto) ? bruto.criterios : undefined
  if (!Array.isArray(lista)) {
    throw new Error('criterios.json precisa de uma lista "criterios"')
  }
  const criterios = lista.flatMap(criterioDe)
  if (criterios.length === 0) {
    throw new Error('criterios.json não tem nenhum critério válido')
  }
  return criterios
}

// ── Chave (~/.env.local) ────────────────────────────────────────────────────

const LINHA_DA_CHAVE = new RegExp(`^\\s*(?:export\\s+)?${NOME_DA_CHAVE}\\s*=\\s*(.*)$`)

function valorSemAspas(bruto: string): string {
  const texto = bruto.trim()
  const aspas = texto[0]
  if (aspas === '"' || aspas === "'") {
    const fim = texto.indexOf(aspas, 1)
    return fim === -1 ? texto.slice(1) : texto.slice(1, fim)
  }
  const comentario = texto.search(/\s#/)
  return (comentario === -1 ? texto : texto.slice(0, comentario)).trim()
}

/** Acha TYPESAFE_API_KEY num .env: aceita `export`, aspas e comentário no fim da linha. */
export function lerChave(texto: string): string | undefined {
  const valores = texto
    .split(/\r?\n/)
    .map(linha => LINHA_DA_CHAVE.exec(linha)?.[1])
    .filter((valor): valor is string => valor !== undefined)
    .map(valorSemAspas)
    .filter(valor => valor !== '')
  return valores.at(-1)
}

/** Troca a chave por *** em qualquer texto que vá para um log. */
export function esconder(texto: string, chave: string | undefined): string {
  if (chave === undefined || chave === '') return texto
  return texto.split(chave).join('***')
}

// ── Requisição e resposta do Jev ────────────────────────────────────────────

export const idDoCriterio = (posicao: number): string => `c${posicao}`

const fimDoTexto = (texto: string, max: number): string => (texto.length > max ? texto.slice(-max) : texto)

function perguntaDe(criterio: Criterio): PerguntaDoJev {
  const { fraco, ok, ótimo } = criterio.degraus
  return {
    type: 'score',
    instructions: { tarefa: TAREFA, criterio: criterio.nome, pergunta: criterio.pergunta },
    criteria: [`fraco: ${fraco}`, `ok: ${ok}`, `ótimo: ${ótimo}`],
  }
}

/** O corpo do POST: uma pergunta "score" por critério, com o retrato do turno no state. */
export function montarRequisicao(retrato: Retrato, criterios: readonly Criterio[]): RequisicaoDoJev {
  return {
    model: MODELO_DO_JEV,
    state: {
      pedido: retrato.pedido.slice(0, MAX_PEDIDO),
      arquivos: retrato.arquivos.slice(-MAX_ARQUIVOS_ENVIADOS),
      comandos: retrato.comandos.slice(-MAX_COMANDOS_ENVIADOS).map(item => ({
        comando: item.comando,
        resultado: item.ok ? 'deu certo' : 'falhou',
        teste: item.teste,
      })),
      // O fim da resposta é onde estão o resumo e o próximo passo, então é o que fica.
      resposta: fimDoTexto(retrato.resposta, MAX_RESPOSTA),
    },
    questions: Object.fromEntries(criterios.map((criterio, posicao) => [idDoCriterio(posicao), perguntaDe(criterio)])),
  }
}

/** O degrau é a posição ARREDONDADA na escala 0..2, não o degrau que ficou na frente. */
export function degrauDoScore(score: number): Degrau {
  const posicao = Math.round(score)
  if (posicao <= 0) return 'fraco'
  if (posicao >= 2) return 'ótimo'
  return 'ok'
}

const confiancaDe = (valor: unknown): number =>
  typeof valor === 'number' && Number.isFinite(valor) ? Math.min(1, Math.max(0, valor)) : 0

function resultadoDe(criterio: Criterio, posicao: number, resposta: unknown): Resultado {
  if (!ehObjeto(resposta) || typeof resposta.score !== 'number' || !Number.isFinite(resposta.score)) {
    throw new Error(`a resposta do Jev não traz o critério ${idDoCriterio(posicao)}`)
  }
  return {
    nome: criterio.nome,
    degrau: degrauDoScore(resposta.score),
    confianca: confiancaDe(resposta.confidence),
    regra: criterio.regra,
  }
}

function lerCorpoDoJev(texto: string): unknown {
  try {
    return JSON.parse(texto)
  } catch {
    // O começo do corpo ajuda a achar o problema (uma página de erro do gateway, por exemplo).
    throw new Error(`a resposta do Jev não é um JSON válido: ${texto.slice(0, MAX_TRECHO_DO_CORPO)}`)
  }
}

/** Lê o corpo da resposta do Jev. Falta de qualquer critério é erro. */
export function lerRespostas(texto: string, criterios: readonly Criterio[]): Resultado[] {
  const corpo = lerCorpoDoJev(texto)
  const respostas = ehObjeto(corpo) && ehObjeto(corpo.answers) ? corpo.answers : undefined
  if (respostas === undefined) {
    throw new Error('a resposta do Jev não traz "answers"')
  }
  return criterios.map((criterio, posicao) => resultadoDe(criterio, posicao, respostas[idDoCriterio(posicao)]))
}

// ── Nota, melhorias e histórico ─────────────────────────────────────────────

/** Média dos pontos (ótimo 10, ok 6, fraco 2), com uma casa decimal. */
export function notaDoTurno(resultados: readonly Resultado[]): number {
  if (resultados.length === 0) return 0
  const soma = resultados.reduce((total, resultado) => total + PONTOS_DO_DEGRAU[resultado.degrau], 0)
  return Math.round((soma * 10) / resultados.length) / 10
}

/** Os critérios abaixo de ótimo, do mais baixo para o mais alto (empate: pela posição), até 2. */
export function pontosDeMelhoria(resultados: readonly Resultado[]): Resultado[] {
  return resultados
    .map((resultado, posicao) => ({ resultado, posicao }))
    .filter(({ resultado }) => resultado.degrau !== 'ótimo')
    .sort(
      (a, b) =>
        DEGRAUS.indexOf(a.resultado.degrau) - DEGRAUS.indexOf(b.resultado.degrau) || a.posicao - b.posicao,
    )
    .slice(0, MAX_MELHORIAS)
    .map(({ resultado }) => resultado)
}

export function avaliacaoPronta(id: string, resultados: readonly Resultado[], ms: number): AvaliacaoPronta {
  return {
    estado: 'ok',
    id,
    nota: notaDoTurno(resultados),
    ms,
    resultados: [...resultados],
    melhorias: pontosDeMelhoria(resultados),
  }
}

export const acrescentarNota = (historico: readonly number[], nota: number): number[] =>
  [...historico, nota].slice(-MAX_HISTORICO)

/** O que veio do $.store como histórico: só notas de 0 a 10, as últimas 20. */
export function notasValidas(valor: unknown): number[] {
  if (!Array.isArray(valor)) return []
  const notas = valor.filter(
    (nota): nota is number => typeof nota === 'number' && Number.isFinite(nota) && nota >= 0 && nota <= NOTA_MAXIMA,
  )
  return notas.slice(-MAX_HISTORICO)
}

// ── Formatação ──────────────────────────────────────────────────────────────

export const formatarNota = (nota: number): string => nota.toFixed(1).replace('.', ',')

export const formatarConfianca = (confianca: number): string => confianca.toFixed(2).replace('.', ',')

export function barraDeConfianca(confianca: number): string {
  const cheias = Math.round(confianca * LARGURA_DA_BARRA)
  return '█'.repeat(cheias) + '░'.repeat(LARGURA_DA_BARRA - cheias)
}

/** Uma barrinha ▁..█ por nota: nota/10*7 vira a altura. */
export function miniGrafico(notas: readonly number[]): string {
  const topo = ESCALA_DO_GRAFICO.length - 1
  return notas
    .map(nota => {
      const altura = Math.min(topo, Math.max(0, Math.round((nota / NOTA_MAXIMA) * topo)))
      return ESCALA_DO_GRAFICO.charAt(altura)
    })
    .join('')
}

export const ultimasNotas = (historico: readonly number[]): string =>
  historico.slice(-MAX_NOTAS_NO_TEXTO).map(formatarNota).join(SEPARADOR_DE_NOTAS)

// ── Textos do boletim ───────────────────────────────────────────────────────

/** A linha que vai para a conversa quando a avaliação termina. */
export function linhaDeConversa(avaliacao: Avaliacao): string {
  if (avaliacao.estado === 'avaliando') return 'Boletim: Jev avaliando o turno…'
  if (avaliacao.estado === 'fora') return 'Boletim: Jev fora do ar, turno sem nota'
  const nota = formatarNota(avaliacao.nota)
  if (avaliacao.melhorias.length === 0) return `Boletim: nota ${nota} · nenhum ponto de melhoria`
  const lista = avaliacao.melhorias.map(item => `${item.nome} (${item.degrau})`).join(', ')
  return `Boletim: nota ${nota} · melhorar: ${lista}`
}

/** A linha fixa acima do prompt, com o tom em que ela é desenhada. */
export function linhaAcimaDoPrompt(avaliacao: Avaliacao): { texto: string; tom: TomDaLinha } {
  if (avaliacao.estado === 'avaliando') return { texto: 'Boletim: Jev avaliando o turno…', tom: 'discreto' }
  if (avaliacao.estado === 'fora') return { texto: 'Boletim: Jev fora do ar', tom: 'aviso' }
  const nota = formatarNota(avaliacao.nota)
  const quantos = avaliacao.melhorias.length
  if (quantos === 0) {
    return { texto: `Boletim: nota ${nota} · nenhum ponto de melhoria · /boletim pra ver`, tom: 'discreto' }
  }
  const pontos = quantos === 1 ? '1 ponto de melhoria' : `${quantos} pontos de melhoria`
  return {
    texto: `Boletim: nota ${nota} · ${pontos} · /boletim pra ver, /melhorar pra gravar no CLAUDE.md`,
    tom: 'normal',
  }
}

function linhaDoCriterio(resultado: Resultado, largura: number): Linha {
  const cor = resultado.confianca < CONFIANCA_BAIXA ? 'yellow' : COR_DO_DEGRAU[resultado.degrau]
  const folga = ' '.repeat(LARGURA_DO_DEGRAU - resultado.degrau.length)
  return [
    { texto: `${resultado.nome.padEnd(largura)}  ` },
    { texto: resultado.degrau, negrito: true, ...(cor === undefined ? {} : { cor }) },
    { texto: `${folga}  ${barraDeConfianca(resultado.confianca)} ${formatarConfianca(resultado.confianca)}` },
  ]
}

function secaoDeMelhorias(melhorias: readonly Resultado[]): Linha[] {
  if (melhorias.length === 0) {
    return [[{ texto: 'Nenhum ponto de melhoria neste turno.', cor: 'green' }]]
  }
  return [
    [{ texto: 'Pontos de melhoria', negrito: true }],
    ...melhorias.flatMap((item): Linha[] => [
      [{ texto: `${item.nome} (${item.degrau})` }],
      [{ texto: `  Regra sugerida: ${item.regra}` }],
    ]),
    [{ texto: '/melhorar grava essas regras no CLAUDE.md', discreto: true }],
  ]
}

function corpoDoBoletim(avaliacao: Avaliacao | null): Linha[] {
  if (avaliacao === null) {
    return [[{ texto: 'Ainda não tem boletim. Ele aparece quando o turno terminar.', discreto: true }]]
  }
  if (avaliacao.estado === 'avaliando') return [[{ texto: 'Jev avaliando o turno…', discreto: true }]]
  if (avaliacao.estado === 'fora') {
    return [[{ texto: 'Jev fora do ar: o último turno ficou sem nota.', cor: 'yellow' }]]
  }
  const largura = Math.max(...avaliacao.resultados.map(resultado => resultado.nome.length))
  return [
    [{ texto: `Nota do último turno: ${formatarNota(avaliacao.nota)} · Jev respondeu em ${avaliacao.ms} ms` }],
    LINHA_EM_BRANCO,
    ...avaliacao.resultados.map(resultado => linhaDoCriterio(resultado, largura)),
    LINHA_EM_BRANCO,
    ...secaoDeMelhorias(avaliacao.melhorias),
  ]
}

function secaoDoHistorico(historico: readonly number[]): Linha[] {
  if (historico.length === 0) return []
  return [
    LINHA_EM_BRANCO,
    [{ texto: 'Últimos turnos', negrito: true }],
    [{ texto: miniGrafico(historico) }],
    [{ texto: ultimasNotas(historico) }],
  ]
}

/** O boletim inteiro, linha por linha, igual no painel e na faixa acima do prompt. */
export function montarBoletim(avaliacao: Avaliacao | null, historico: readonly number[]): Linha[] {
  return [...corpoDoBoletim(avaliacao), ...secaoDoHistorico(historico)]
}

// ── Retrato do turno ────────────────────────────────────────────────────────

export function iniciarTurno(anterior: Turno, texto: string): Turno {
  return { pedido: texto.trim() === '' ? anterior.pedido : texto, arquivos: [], comandos: [] }
}

/** O que uma chamada de ferramenta acrescenta ao retrato, ou null se não interessa. */
export function registroDaFerramenta(
  ferramenta: string,
  entrada: Readonly<Record<string, unknown>>,
  ok: boolean,
): Registro | null {
  if (FERRAMENTAS_DE_ARQUIVO.has(ferramenta)) {
    const caminho = entrada.file_path ?? entrada.notebook_path
    return ok && ehTexto(caminho) ? { arquivo: caminho } : null
  }
  if (!FERRAMENTAS_DE_SHELL.has(ferramenta)) return null
  const comando = entrada.command
  if (!ehTexto(comando)) return null
  return { comando: { comando: comando.slice(0, MAX_COMANDO), ok, teste: PADRAO_DE_TESTE.test(comando) } }
}

export function aplicarRegistro(turno: Turno, registro: Registro): Turno {
  if ('comando' in registro) {
    return { ...turno, comandos: [...turno.comandos, registro.comando].slice(-MAX_GUARDADOS) }
  }
  if (turno.arquivos.includes(registro.arquivo)) return turno
  return { ...turno, arquivos: [...turno.arquivos, registro.arquivo].slice(-MAX_GUARDADOS) }
}

// ── /melhorar: regras no CLAUDE.md ──────────────────────────────────────────

/** Espaços viram um só e maiúsculas somem: é assim que duas regras são comparadas. */
export const normalizar = (texto: string): string => texto.replace(/\s+/g, ' ').trim().toLowerCase()

const ehTituloDeSecao = (linha: string): boolean => /^#{1,2}\s/.test(linha)

function novaSecao(conteudo: string, regras: readonly string[], usaCrlf: boolean): string {
  const quebra = usaCrlf ? '\r\n' : '\n'
  const bloco = [TITULO_DA_SECAO, '', ...regras.map(regra => `- ${regra}`)].join(quebra) + quebra
  const existente = conteudo.trimEnd()
  return existente === '' ? bloco : `${existente}${quebra}${quebra}${bloco}`
}

function inserirNaSecao(linhas: readonly string[], cabecalho: number, regras: readonly string[], fim: string): string {
  const proxima = linhas.findIndex((linha, posicao) => posicao > cabecalho && ehTituloDeSecao(linha))
  const limite = proxima === -1 ? linhas.length : proxima
  const corpo = linhas.slice(cabecalho + 1, limite)
  const ultimo = corpo.findLastIndex(linha => linha.trim() !== '')
  const marcadores = regras.map(regra => `- ${regra}${fim}`)

  if (ultimo === -1) {
    const separador = limite === cabecalho + 1 && limite < linhas.length ? [fim] : []
    return [
      ...linhas.slice(0, cabecalho + 1),
      fim,
      ...marcadores,
      ...separador,
      ...linhas.slice(cabecalho + 1),
    ].join('\n')
  }
  const depois = cabecalho + 1 + ultimo + 1
  if (depois === linhas.length) {
    // A seção é a última coisa do arquivo e ele não termina em quebra de linha: ganha uma.
    return [...linhas.slice(0, depois - 1), `${linhas[depois - 1]}${fim}`, ...marcadores, ''].join('\n')
  }
  return [...linhas.slice(0, depois), ...marcadores, ...linhas.slice(depois)].join('\n')
}

/**
 * Põe as regras que ainda não estão no CLAUDE.md na seção "## Regras do boletim",
 * no fim dela. Cria a seção (e o arquivo, se `conteudo` for vazio) quando falta e
 * mantém CRLF se o arquivo usa CRLF.
 */
export function incluirRegras(conteudo: string, regras: readonly string[]): RegrasIncluidas {
  const existente = normalizar(conteudo)
  const unicas = regras
    .map(regra => regra.trim())
    .filter((regra, posicao, todas) => {
      const chave = normalizar(regra)
      return chave !== '' && todas.findIndex(outra => normalizar(outra) === chave) === posicao
    })
  const jaExistiam = unicas.filter(regra => existente.includes(normalizar(regra)))
  const adicionadas = unicas.filter(regra => !existente.includes(normalizar(regra)))
  if (adicionadas.length === 0) return { conteudo, adicionadas, jaExistiam }

  const usaCrlf = conteudo.includes('\r\n')
  const linhas = conteudo.split('\n')
  const cabecalho = linhas.findIndex(linha => normalizar(linha) === normalizar(TITULO_DA_SECAO))
  const novo =
    cabecalho === -1
      ? novaSecao(conteudo, adicionadas, usaCrlf)
      : inserirNaSecao(linhas, cabecalho, adicionadas, usaCrlf ? '\r' : '')
  return { conteudo: novo, adicionadas, jaExistiam }
}

const AVISO_SEM_BOLETIM = 'Ainda não tem boletim de um turno pra usar.'

/** Decide o que o /melhorar faz com a avaliação do último turno. */
export function planejarMelhorar(avaliacao: Avaliacao | null): Plano {
  if (avaliacao === null || avaliacao.estado === 'avaliando') {
    return { tipo: 'aviso', texto: AVISO_SEM_BOLETIM }
  }
  if (avaliacao.estado === 'fora') {
    return {
      tipo: 'aviso',
      texto: 'O último turno ficou sem boletim (Jev fora do ar). O CLAUDE.md ficou como estava.',
    }
  }
  if (avaliacao.melhorias.length === 0) {
    return {
      tipo: 'aviso',
      texto: `Nenhum ponto de melhoria no último turno (nota ${formatarNota(avaliacao.nota)}). O CLAUDE.md ficou como estava.`,
    }
  }
  return { tipo: 'regras', regras: avaliacao.melhorias.map(item => item.regra) }
}

function sobraDoCLAUDE(jaExistiam: readonly string[]): string {
  if (jaExistiam.length === 0) return ''
  if (jaExistiam.length === 1) return '\nA outra já estava no CLAUDE.md.'
  return `\nAs outras ${jaExistiam.length} já estavam no CLAUDE.md.`
}

export function textoRegrasGravadas(adicionadas: readonly string[], jaExistiam: readonly string[]): string {
  const sobra = sobraDoCLAUDE(jaExistiam)
  const [unica] = adicionadas
  if (adicionadas.length === 1 && unica !== undefined) {
    return `Gravei no CLAUDE.md esta regra: ${unica}${sobra}`
  }
  const lista = adicionadas.map(regra => `- ${regra}`).join('\n')
  return `Gravei no CLAUDE.md estas ${adicionadas.length} regras:\n${lista}${sobra}`
}

export function textoRegrasJaExistem(regras: readonly string[]): string {
  const citadas = regras.map(regra => `"${regra}"`).join(', ')
  return regras.length === 1
    ? `A regra ${citadas} já está no CLAUDE.md. Nada mudou.`
    : `As regras ${citadas} já estão no CLAUDE.md. Nada mudou.`
}
