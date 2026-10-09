// O que a pessoa vê: a linha acima do prompt, o painel, a faixa quando não há espaço, o gráfico, o /boletim.
import { describe, expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { comecarTurno, esperarAte, iniciarSessao, rodarComando, rodarTurno, terminarTurno } from './fluxo'
import { criarMotor } from './motor'
import { elementos, linhasDe, linhasDoPainel, montarFaixa, montarPainel, textosEstilizados } from './tela'
import type { No } from './tela'

const NOTAS_7_3 = [2, 1, 0, 2, 1, 2]
const NOTAS_6_0 = [1, 1, 1, 1, 1, 1]
const NOTAS_10 = [2, 2, 2, 2, 2, 2]
const LINHA_7_3 =
  'Boletim: nota 7,3 · 2 pontos de melhoria · /boletim pra ver, /melhorar pra gravar no CLAUDE.md'
const AVISO_VAZIO = 'Ainda não tem boletim. Ele aparece quando o turno terminar.'

const PAINEL_7_3 = [
  'Nota do último turno: 7,3 · Jev respondeu em 412 ms',
  ' ',
  'Resumo final        ótimo  █████████░ 0,90',
  'Como conferir       ok     █████████░ 0,90',
  'Prova               fraco  █████████░ 0,90',
  'Suposições          ótimo  █████████░ 0,90',
  'Tamanho da mudança  ok     █████████░ 0,90',
  'Próximo passo       ótimo  █████████░ 0,90',
  ' ',
  'Pontos de melhoria',
  'Prova (fraco)',
  '  Regra sugerida: Antes de dizer que terminou, rode os testes e diga o resultado.',
  'Como conferir (ok)',
  '  Regra sugerida: Ao terminar, diga como eu confiro na tela: qual página abrir e o que fazer.',
  '/melhorar grava essas regras no CLAUDE.md',
  ' ',
  'Últimos turnos',
  '▆',
  '7,3',
]

// A pessoa fecha o painel: o motor de teste só deixa um plugin chamar `$.ui.close`, e o mod
// trata qualquer fechamento do painel dele do mesmo jeito.
const PESSOA = {
  name: 'pessoa',
  register(on: On) {
    on('session.start', async ($, e, next) => {
      await $.command.register({ name: 'fechar-painel', description: 'Fecha o painel como a pessoa fecharia' })
      return next(e)
    })
    on('command.run', { command: 'fechar-painel' }, async $ => {
      await $.ui.close({ id: 'boletim-do-claude' })
      return { text: 'fechado' }
    })
  },
}

const ABERTURA = { id: 'boletim-do-claude', title: 'Boletim do Claude' }

async function arvoreDaFaixa($: Parameters<typeof montarFaixa>[0], opcoes?: { hasSurvey?: boolean }): Promise<No> {
  const faixa = await montarFaixa($, opcoes)
  const arvore = (await faixa.drawn()) as unknown as No
  await faixa.unmount()
  return arvore
}

const caixasCiano = (arvore: No) =>
  elementos(arvore).filter(elemento => elemento.type === 'Box' && elemento.props?.borderColor === 'cyan')

describe('linha acima do prompt e painel, com espaço', () => {
  test('a nota vai na linha acima do prompt e o painel fica aberto, sem ninguém fechá-lo', async ($, on) => {
    const motor = criarMotor(on, { latenciaDoJevMs: 412 })
    motor.responderJev({ tipo: 'notas', scores: NOTAS_7_3 })
    await iniciarSessao($)

    await rodarTurno($, motor, { id: 't1' })

    const faixa = await arvoreDaFaixa($)
    expect(linhasDe(faixa)).toEqual([LINHA_7_3])
    expect(caixasCiano(faixa)).toHaveLength(0)
    // Abriu em prompt.submit e de novo em turn.complete.
    expect(motor.aberturas).toEqual([ABERTURA, ABERTURA])
    expect(motor.fechamentos).toEqual([])
    expect(await linhasDoPainel($)).toEqual(PAINEL_7_3)
  })

  test('o degrau vai em negrito: verde ótimo, normal ok, vermelho fraco', async ($, on) => {
    const motor = criarMotor(on)
    motor.responderJev({ tipo: 'notas', scores: NOTAS_7_3 })
    await iniciarSessao($)
    await rodarTurno($, motor, { id: 't1' })

    const painel = await montarPainel($)
    const arvore = (await painel.drawn()) as unknown as No
    await painel.unmount()

    expect(textosEstilizados(arvore, 'ótimo').map(texto => texto.props)).toEqual([
      { bold: true, color: 'green' },
      { bold: true, color: 'green' },
      { bold: true, color: 'green' },
    ])
    expect(textosEstilizados(arvore, 'ok').map(texto => texto.props)).toEqual([{ bold: true }, { bold: true }])
    expect(textosEstilizados(arvore, 'fraco').map(texto => texto.props)).toEqual([{ bold: true, color: 'red' }])
  })

  test('com a confiança abaixo de 0,6 todos os degraus ficam amarelos', async ($, on) => {
    const motor = criarMotor(on)
    motor.responderJev({ tipo: 'notas', scores: NOTAS_7_3, confianca: 0.59 })
    await iniciarSessao($)
    await rodarTurno($, motor, { id: 't1' })

    const painel = await montarPainel($)
    const arvore = (await painel.drawn()) as unknown as No
    await painel.unmount()

    const degraus = ['ótimo', 'ok', 'fraco'].flatMap(degrau => textosEstilizados(arvore, degrau))
    expect(degraus).toHaveLength(6)
    expect(degraus.every(texto => texto.props?.color === 'yellow' && texto.props?.bold === true)).toBe(true)
    expect(linhasDe(arvore)).toContain('Prova               fraco  ██████░░░░ 0,59')
  })

  test('com 0,6 de confiança o degrau mantém a cor do degrau', async ($, on) => {
    const motor = criarMotor(on)
    motor.responderJev({ tipo: 'notas', scores: NOTAS_7_3, confianca: 0.6 })
    await iniciarSessao($)
    await rodarTurno($, motor, { id: 't1' })

    const painel = await montarPainel($)
    const arvore = (await painel.drawn()) as unknown as No
    await painel.unmount()

    expect(textosEstilizados(arvore, 'fraco').map(texto => texto.props?.color)).toEqual(['red'])
  })

  test('uma pesquisa (survey) na faixa tem prioridade: a linha do boletim some', async ($, on) => {
    const motor = criarMotor(on)
    await iniciarSessao($)
    await rodarTurno($, motor, { id: 't1' })

    const faixa = await arvoreDaFaixa($, { hasSurvey: true })

    expect(linhasDe(faixa)).toEqual([])
  })

  test('antes do primeiro turno não há linha nenhuma, e o painel explica', async ($, on) => {
    criarMotor(on)
    await iniciarSessao($)

    expect(linhasDe(await arvoreDaFaixa($))).toEqual([])
    expect(await linhasDoPainel($)).toEqual([AVISO_VAZIO])
  })
})

describe('em cada superfície', () => {
  test('o painel desenha o mesmo boletim no terminal, no desktop, no VS Code e no celular', async ($, on) => {
    const motor = criarMotor(on, { latenciaDoJevMs: 412 })
    motor.responderJev({ tipo: 'notas', scores: NOTAS_7_3 })
    await iniciarSessao($)
    await rodarTurno($, motor, { id: 't1' })

    for (const superficie of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
      const painel = await montarPainel($, superficie)
      expect(linhasDe((await painel.drawn()) as unknown as No)).toEqual(PAINEL_7_3)
      await painel.unmount()
    }
  })

  test('a faixa acima do prompt desenha no terminal e no desktop, com e sem espaço', async ($, on) => {
    const motor = criarMotor(on, { latenciaDoJevMs: 412, temEspaco: false })
    motor.responderJev({ tipo: 'notas', scores: NOTAS_7_3 })
    await iniciarSessao($)
    await rodarTurno($, motor, { id: 't1' })

    for (const superficie of ['terminal', 'desktop'] as const) {
      const faixa = await montarFaixa($, {}, superficie)
      const linhas = linhasDe((await faixa.drawn()) as unknown as No)
      await faixa.unmount()
      expect(linhas).toEqual([...PAINEL_7_3, LINHA_7_3])
    }
  })
})

describe('turno sem melhoria', () => {
  test('linha na conversa, linha discreta acima do prompt e painel em verde', async ($, on) => {
    const motor = criarMotor(on, { latenciaDoJevMs: 30 })
    motor.responderJev({ tipo: 'notas', scores: NOTAS_10 })
    await iniciarSessao($)

    await rodarTurno($, motor, { id: 't1' })

    expect(motor.conversa).toEqual(['Boletim: nota 10,0 · nenhum ponto de melhoria'])
    const faixa = await arvoreDaFaixa($)
    const linha = 'Boletim: nota 10,0 · nenhum ponto de melhoria · /boletim pra ver'
    expect(linhasDe(faixa)).toEqual([linha])
    expect(textosEstilizados(faixa, linha).map(texto => texto.props)).toEqual([{ dimColor: true }])

    const painel = await montarPainel($)
    const arvore = (await painel.drawn()) as unknown as No
    await painel.unmount()
    const linhas = linhasDe(arvore)
    expect(linhas.at(0)).toBe('Nota do último turno: 10,0 · Jev respondeu em 30 ms')
    expect(linhas).toContain('Nenhum ponto de melhoria neste turno.')
    expect(linhas).not.toContain('Pontos de melhoria')
    expect(
      textosEstilizados(arvore, 'Nenhum ponto de melhoria neste turno.').map(texto => texto.props),
    ).toEqual([{ color: 'green' }])
  })
})

describe('sem espaço para o painel', () => {
  test('o boletim inteiro vai para a faixa, numa caixa de borda ciano, e o painel nunca é fechado', async ($, on) => {
    const motor = criarMotor(on, { latenciaDoJevMs: 412, temEspaco: false })
    motor.responderJev({ tipo: 'notas', scores: NOTAS_7_3 })
    await iniciarSessao($)

    await rodarTurno($, motor, { id: 't1' })

    const faixa = await arvoreDaFaixa($)
    const [caixa, ...outras] = caixasCiano(faixa)
    expect(outras).toEqual([])
    expect(caixa?.props).toMatchObject({ borderStyle: 'round', borderColor: 'cyan' })
    expect(linhasDe(caixa as No)).toEqual(PAINEL_7_3)
    // A linha de uma linha só continua embaixo da caixa.
    expect(linhasDe(faixa).at(-1)).toBe(LINHA_7_3)
    // O painel foi pedido (e ficou esperando espaço), mas o mod nunca o fecha.
    expect(motor.aberturas).toEqual([ABERTURA, ABERTURA])
    expect(motor.fechamentos).toEqual([])
  })

  test('a faixa mostra o mesmo boletim que o painel mostraria', async ($, on) => {
    const motor = criarMotor(on, { latenciaDoJevMs: 412, temEspaco: false })
    motor.responderJev({ tipo: 'notas', scores: NOTAS_7_3 })
    await iniciarSessao($)
    await rodarTurno($, motor, { id: 't1' })

    const caixa = caixasCiano(await arvoreDaFaixa($)).at(0)

    expect(linhasDe(caixa as No)).toEqual(await linhasDoPainel($))
  })

  test('com o Jev avaliando ou fora do ar não há caixa, só a linha', async ($, on) => {
    const motor = criarMotor(on, { temEspaco: false })
    motor.responderJev({ tipo: 'rede', erro: 'caiu' })
    await iniciarSessao($)

    await rodarTurno($, motor, { id: 't1' })

    const faixa = await arvoreDaFaixa($)
    expect(caixasCiano(faixa)).toHaveLength(0)
    expect(linhasDe(faixa)).toEqual(['Boletim: Jev fora do ar'])
  })

  test('quando o espaço aparece, o turno seguinte volta para o painel e a caixa some', async ($, on) => {
    const motor = criarMotor(on, { temEspaco: false })
    await iniciarSessao($)
    await rodarTurno($, motor, { id: 't1' })
    expect(caixasCiano(await arvoreDaFaixa($))).toHaveLength(1)

    motor.definirEspaco(true)
    await rodarTurno($, motor, { id: 't2' })

    expect(caixasCiano(await arvoreDaFaixa($))).toHaveLength(0)
    expect(motor.fechamentos).toEqual([])
  })
})

describe('mini gráfico e histórico', () => {
  test('várias notas viram um gráfico ▁..█ e as últimas notas em seta, e vão para o store', async ($, on) => {
    const motor = criarMotor(on)
    await iniciarSessao($)

    motor.responderJev({ tipo: 'notas', scores: NOTAS_6_0 })
    await rodarTurno($, motor, { id: 't1' })
    motor.responderJev({ tipo: 'notas', scores: NOTAS_7_3 })
    await rodarTurno($, motor, { id: 't2' })
    motor.responderJev({ tipo: 'notas', scores: NOTAS_10 })
    await rodarTurno($, motor, { id: 't3' })

    expect((await linhasDoPainel($)).slice(-3)).toEqual(['Últimos turnos', '▅▆█', '6,0 → 7,3 → 10,0'])
    expect(motor.store.get('historico')).toEqual([6, 7.3, 10])
  })

  test('o texto mostra só as últimas 6 notas; o gráfico mostra todas', async ($, on) => {
    const motor = criarMotor(on)
    await iniciarSessao($)

    for (const [posicao, scores] of [NOTAS_6_0, NOTAS_7_3, NOTAS_10, NOTAS_6_0, NOTAS_7_3, NOTAS_10, NOTAS_6_0, NOTAS_7_3].entries()) {
      motor.responderJev({ tipo: 'notas', scores })
      await rodarTurno($, motor, { id: `t${posicao}` })
    }

    const [titulo, grafico, notas] = (await linhasDoPainel($)).slice(-3)
    expect(titulo).toBe('Últimos turnos')
    expect(grafico).toBe('▅▆█▅▆█▅▆')
    expect(notas).toBe('10,0 → 6,0 → 7,3 → 10,0 → 6,0 → 7,3')
  })

  test('o histórico guarda só as últimas 20 notas', async ($, on) => {
    const motor = criarMotor(on)
    await iniciarSessao($)

    for (let turno = 0; turno < 22; turno += 1) {
      motor.responderJev({ tipo: 'notas', scores: turno % 2 === 0 ? NOTAS_6_0 : NOTAS_10 })
      await rodarTurno($, motor, { id: `t${turno}` })
    }

    const guardado = motor.store.get('historico') as number[]
    expect(guardado).toHaveLength(20)
    expect(guardado.at(0)).toBe(6)
    expect(guardado.at(-1)).toBe(10)
    expect((await linhasDoPainel($)).at(-2)).toHaveLength(20)
  })

  test('no session.start o histórico volta do store, e o painel o mostra antes de qualquer turno', async ($, on) => {
    const motor = criarMotor(on, { store: { historico: [6, 7.3, 10] } })

    await iniciarSessao($)

    expect(await linhasDoPainel($)).toEqual([AVISO_VAZIO, ' ', 'Últimos turnos', '▅▆█', '6,0 → 7,3 → 10,0'])
    motor.responderJev({ tipo: 'notas', scores: NOTAS_7_3 })
    await rodarTurno($, motor, { id: 't1' })
    expect(motor.store.get('historico')).toEqual([6, 7.3, 10, 7.3])
  })

  test('lixo no store é ignorado', async ($, on) => {
    criarMotor(on, { store: { historico: 'seis, sete' } })

    await iniciarSessao($)

    expect(await linhasDoPainel($)).toEqual([AVISO_VAZIO])
  })

  test('um novo session.start (recarga do mod) não troca o histórico que já está na memória', async ($, on) => {
    const motor = criarMotor(on)
    await iniciarSessao($)
    await rodarTurno($, motor, { id: 't1' })
    motor.store.set('historico', [1, 2, 3])

    await iniciarSessao($)

    expect((await linhasDoPainel($)).slice(-2)).toEqual(['█', '10,0'])
  })

  test('uma avaliação que a recarga do mod derrubou não fica "avaliando" para sempre', async ($, on) => {
    const motor = criarMotor(on)
    motor.segurarJev(1)
    await iniciarSessao($)
    await comecarTurno($, { id: 't1' })
    await terminarTurno($, { id: 't1' })
    await esperarAte(motor, () => motor.requisicoes.length > 0)
    expect(linhasDe(await arvoreDaFaixa($))).toEqual(['Boletim: Jev avaliando o turno…'])

    // Ao recarregar o mod, o motor chama o session.start de novo.
    await iniciarSessao($)

    expect(linhasDe(await arvoreDaFaixa($))).toEqual([])
  })

  test('um turno sem nota (Jev fora) não entra no histórico', async ($, on) => {
    const motor = criarMotor(on, { store: { historico: [6] } })
    motor.responderJev({ tipo: 'rede', erro: 'caiu' })
    await iniciarSessao($)

    await rodarTurno($, motor, { id: 't1' })

    expect(motor.store.get('historico')).toEqual([6])
  })
})

describe('comandos /boletim', () => {
  test('o session.start registra /boletim e /melhorar', async ($, on) => {
    const motor = criarMotor(on)

    await iniciarSessao($)

    expect(motor.comandos).toEqual(['boletim', 'melhorar'])
  })

  test('/boletim abre o painel e avisa que ele está ao lado da conversa', async ($, on) => {
    const motor = criarMotor(on)
    await iniciarSessao($)

    const text = await rodarComando($, 'boletim')

    expect(text).toBe('Boletim do Claude aberto ao lado da conversa.')
    expect(motor.aberturas).toEqual([ABERTURA])
  })

  test('/boletim sem espaço avisa que o boletim aparece acima do prompt, e a faixa o mostra', async ($, on) => {
    const motor = criarMotor(on, { latenciaDoJevMs: 412, temEspaco: true })
    motor.responderJev({ tipo: 'notas', scores: NOTAS_7_3 })
    await iniciarSessao($)
    await rodarTurno($, motor, { id: 't1' })
    motor.definirEspaco(false)

    const text = await rodarComando($, 'boletim')

    expect(text).toBe('Sem espaço pro painel: o boletim aparece acima do prompt.')
    expect(caixasCiano(await arvoreDaFaixa($))).toHaveLength(1)
    expect(motor.fechamentos).toEqual([])
  })

  test('/boletim reabre o último turno depois que a pessoa fecha o painel', { plugins: [PESSOA] }, async ($, on) => {
    const motor = criarMotor(on, { latenciaDoJevMs: 412 })
    motor.responderJev({ tipo: 'notas', scores: NOTAS_7_3 })
    await iniciarSessao($)
    await rodarTurno($, motor, { id: 't1' })
    motor.definirEspaco(false)
    await rodarComando($, 'boletim')
    expect(caixasCiano(await arvoreDaFaixa($))).toHaveLength(1)

    await rodarComando($, 'fechar-painel')

    // Fechado pela pessoa: sem painel e sem caixa, só a linha, até o próximo turno ou o /boletim.
    expect(linhasDe(await arvoreDaFaixa($))).toEqual([LINHA_7_3])
    expect(caixasCiano(await arvoreDaFaixa($))).toHaveLength(0)

    motor.definirEspaco(true)
    const text = await rodarComando($, 'boletim')

    expect(text).toBe('Boletim do Claude aberto ao lado da conversa.')
    expect(await linhasDoPainel($)).toEqual(PAINEL_7_3)
  })

  test('depois de fechado pela pessoa, o próximo turno abre o painel de novo', { plugins: [PESSOA] }, async ($, on) => {
    const motor = criarMotor(on, { temEspaco: false })
    await iniciarSessao($)
    await rodarTurno($, motor, { id: 't1' })
    await rodarComando($, 'fechar-painel')
    expect(caixasCiano(await arvoreDaFaixa($))).toHaveLength(0)

    await rodarTurno($, motor, { id: 't2' })

    expect(caixasCiano(await arvoreDaFaixa($))).toHaveLength(1)
  })
})

describe('abrir o painel', () => {
  test('um prompt descartado não abre o painel', async ($, on) => {
    const motor = criarMotor(on)
    motor.descartarPrompts('bloqueado por outro plugin')
    await iniciarSessao($)

    await $.prompt.submit({ text: 'oi', wait: false, origin: { kind: 'composer' } })

    expect(motor.aberturas).toEqual([])
  })

  test('um comando que não registra não impede a volta do histórico no session.start', async ($, on) => {
    const motor = criarMotor(on, { store: { historico: [6, 7.3, 10] } })
    motor.recusarComandos(true)

    await iniciarSessao($)

    expect(motor.comandos).toEqual([])
    expect(motor.depuracao.some(linha => linha.includes('comandos indisponíveis'))).toBe(true)
    expect((await linhasDoPainel($)).at(-1)).toBe('6,0 → 7,3 → 10,0')
  })
})

test('a faixa desenha por cima do que já estava lá (next)', async ($, on) => {
  // Registrado antes do motor, o que está embaixo do mod nesta faixa é o texto de outro plugin.
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Text', children: ['de outro plugin'] }))
  const motor = criarMotor(on)
  await iniciarSessao($)
  await rodarTurno($, motor, { id: 't1' })

  const linhas = linhasDe(await arvoreDaFaixa($))

  expect(linhas.at(0)).toBe('de outro plugin')
  expect(linhas.at(-1)).toContain('Boletim: nota 10,0')
})
