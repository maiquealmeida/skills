// De um turno do Claude até a nota: o retrato que vai para o Jev, a nota, os turnos de subagente.
import { describe, expect, test } from 'claude-code/testing'

import {
  BASH,
  chamar,
  comecarTurno,
  deixarPassar,
  EDIT,
  esperarAte,
  iniciarSessao,
  rodarTurno,
  terminarTurno,
  WRITE,
} from './fluxo'
import { ARQUIVO_ENV, ARQUIVO_ENV_DO_PROJETO, CHAVE, corpoDoJev, criarMotor } from './motor'
import { linhasDaFaixa } from './tela'

const NOTAS_7_3 = [2, 1, 0, 2, 1, 2]

describe('nota do turno', () => {
  test('é a média e os 2 mais baixos viram pontos de melhoria', async ($, on) => {
    const motor = criarMotor(on)
    motor.responderJev({ tipo: 'notas', scores: NOTAS_7_3 })
    await iniciarSessao($)

    await rodarTurno($, motor, { id: 't1' })

    expect(motor.conversa).toEqual(['Boletim: nota 7,3 · melhorar: Prova (fraco), Como conferir (ok)'])
  })

  test('no empate entra primeiro o critério que vem antes na lista, e nunca mais que 2', async ($, on) => {
    const motor = criarMotor(on)
    motor.responderJev({ tipo: 'notas', scores: [1, 1, 1, 2, 2, 2] })
    await iniciarSessao($)

    await rodarTurno($, motor, { id: 't1' })

    expect(motor.conversa).toEqual(['Boletim: nota 8,0 · melhorar: Resumo final (ok), Como conferir (ok)'])
  })

  test('o degrau sai da posição arredondada, e não do degrau que ficou na frente', async ($, on) => {
    const motor = criarMotor(on)
    // Jev dividido entre fraco (51%) e ótimo (49%): o score fica em 0,98, o meio da escala.
    const dividido = corpoDoJev([2, 0.98, 2, 2, 2, 2], { probabilidades: [{}, { '0': 0.51, '1': 0, '2': 0.49 }] })
    motor.responderJev({ tipo: 'corpo', corpo: dividido })
    await iniciarSessao($)

    await rodarTurno($, motor, { id: 't1' })

    expect(motor.conversa).toEqual(['Boletim: nota 9,3 · melhorar: Como conferir (ok)'])
  })

  test('tudo em ótimo dá 10,0 e nenhum ponto de melhoria', async ($, on) => {
    const motor = criarMotor(on)
    await iniciarSessao($)

    await rodarTurno($, motor, { id: 't1' })

    expect(motor.conversa).toEqual(['Boletim: nota 10,0 · nenhum ponto de melhoria'])
  })

  test('tudo em fraco dá 2,0 e os dois primeiros critérios como melhoria', async ($, on) => {
    const motor = criarMotor(on)
    motor.responderJev({ tipo: 'notas', scores: [0, 0, 0, 0, 0, 0] })
    await iniciarSessao($)

    await rodarTurno($, motor, { id: 't1' })

    expect(motor.conversa).toEqual(['Boletim: nota 2,0 · melhorar: Resumo final (fraco), Como conferir (fraco)'])
  })
})

describe('retrato do turno que vai para o Jev', () => {
  test('manda pedido, arquivos, comandos (com "falhou") e resposta, e gera a nota', async ($, on) => {
    const motor = criarMotor(on)
    motor.definirFerramentas(entrada => (entrada.command === 'npx tsc' ? 'erro' : 'ok'))
    await iniciarSessao($)

    await comecarTurno($, {
      id: 't1',
      pedido: 'ajuste o botão',
      ferramentas: [
        EDIT('src/a.ts'),
        WRITE('src/b.ts'),
        EDIT('src/a.ts'),
        { tool: 'NotebookEdit', notebook_path: 'n.ipynb', new_source: 'x' },
        { tool: 'MultiEdit', file_path: 'src/c.ts', edits: [] },
        { tool: 'Read', file_path: 'src/z.ts' },
        BASH('npm test'),
        BASH('npx tsc'),
        { tool: 'PowerShell', command: 'Get-ChildItem' },
      ],
    })
    await terminarTurno($, { id: 't1', resposta: 'Mudei o botão em a.ts e b.ts.' })
    await esperarAte(motor, () => motor.conversa.length > 0)

    expect(motor.requisicoes).toHaveLength(1)
    expect(motor.requisicoes.at(0)?.corpo.state).toEqual({
      pedido: 'ajuste o botão',
      arquivos: ['src/a.ts', 'src/b.ts', 'n.ipynb', 'src/c.ts'],
      comandos: [
        { comando: 'npm test', resultado: 'deu certo', teste: true },
        { comando: 'npx tsc', resultado: 'falhou', teste: true },
        { comando: 'Get-ChildItem', resultado: 'deu certo', teste: false },
      ],
      resposta: 'Mudei o botão em a.ts e b.ts.',
    })
    expect(motor.conversa).toEqual(['Boletim: nota 10,0 · nenhum ponto de melhoria'])
  })

  test('comando negado também conta como "falhou", e edição negada ou com erro não vira arquivo mexido', async ($, on) => {
    const motor = criarMotor(on)
    motor.definirFerramentas(entrada => {
      if (entrada.command === 'rm -rf x') return 'negada'
      return entrada.file_path === 'src/ruim.ts' ? 'erro' : 'ok'
    })
    await iniciarSessao($)

    await comecarTurno($, {
      id: 't1',
      ferramentas: [BASH('rm -rf x'), EDIT('src/ruim.ts'), EDIT('src/boa.ts')],
    })
    await terminarTurno($, { id: 't1' })
    await esperarAte(motor, () => motor.conversa.length > 0)

    const { state } = motor.requisicoes.at(0)?.corpo ?? { state: undefined }
    expect(state?.comandos).toEqual([{ comando: 'rm -rf x', resultado: 'falhou', teste: false }])
    expect(state?.arquivos).toEqual(['src/boa.ts'])
  })

  test('o comando vai cortado em 300 caracteres', async ($, on) => {
    const motor = criarMotor(on)
    await iniciarSessao($)

    await rodarTurno($, motor, { id: 't1', ferramentas: [BASH(`echo ${'x'.repeat(400)}`)] })

    expect(motor.requisicoes.at(0)?.corpo.state.comandos.at(0)?.comando).toHaveLength(300)
  })

  test('chama o Jev com POST, Bearer, JSON e jev-latest, lendo a chave do ~/.env.local', async ($, on) => {
    const motor = criarMotor(on)
    await iniciarSessao($)

    await rodarTurno($, motor, { id: 't1' })

    const chamada = motor.requisicoes.at(0)
    expect(chamada?.url).toBe('https://api.typesafe.ai/v1/systemone')
    expect(chamada?.method).toBe('POST')
    expect(chamada?.headers).toEqual({ Authorization: `Bearer ${CHAVE}`, 'Content-Type': 'application/json' })
    expect(chamada?.corpo.model).toBe('jev-latest')
    // A chave vem da home (/home/maique/.env.local); o .env.local da raiz do projeto nem é aberto.
    expect(motor.leituras).toContain(ARQUIVO_ENV)
    expect(motor.leituras).not.toContain(ARQUIVO_ENV_DO_PROJETO)
    expect(motor.leituras.some(caminho => caminho.endsWith('/boletim-do-claude/criterios.json'))).toBe(true)
  })

  test('uma pergunta score por critério, com ids c0, c1..., instructions e os três degraus', async ($, on) => {
    const motor = criarMotor(on)
    await iniciarSessao($)

    await rodarTurno($, motor, { id: 't1' })

    const questions = motor.requisicoes.at(0)?.corpo.questions
    expect(Object.keys(questions ?? {})).toEqual(['c0', 'c1', 'c2', 'c3', 'c4', 'c5'])
    expect(questions?.c0).toMatchObject({
      type: 'score',
      instructions: { criterio: 'Resumo final', pergunta: 'Disse o que mudou e em quais arquivos?' },
      criteria: ['fraco: F0', 'ok: O0', 'ótimo: T0'],
    })
    expect(questions?.c0?.instructions.tarefa).toContain('pedido')
    expect(questions?.c2?.criteria).toEqual([
      'fraco: não atende ao critério',
      'ok: atende em parte',
      'ótimo: atende bem',
    ])
  })

  test('o criterios.json é lido de novo a cada turno', async ($, on) => {
    const motor = criarMotor(on)
    await iniciarSessao($)
    await rodarTurno($, motor, { id: 't1' })

    motor.definirCriterios(JSON.stringify({ criterios: [{ nome: 'Só um', pergunta: 'q?', regra: 'r' }] }))
    motor.responderJev({ tipo: 'notas', scores: [1] })
    await rodarTurno($, motor, { id: 't2' })

    expect(Object.keys(motor.requisicoes.at(1)?.corpo.questions ?? {})).toEqual(['c0'])
    expect(motor.conversa.at(1)).toBe('Boletim: nota 6,0 · melhorar: Só um (ok)')
  })

  test('turno que começa com texto vazio (continuação) fica com o pedido de antes e zera o resto', async ($, on) => {
    const motor = criarMotor(on)
    await iniciarSessao($)
    await rodarTurno($, motor, { id: 't1', pedido: 'ajuste o botão', ferramentas: [EDIT('a.ts'), BASH('ls')] })

    await $.turn.start({ text: '', turnId: 't2' })
    await terminarTurno($, { id: 't2' })
    await esperarAte(motor, () => motor.conversa.length > 1)

    const { state } = motor.requisicoes.at(1)?.corpo ?? { state: undefined }
    expect(state?.pedido).toBe('ajuste o botão')
    expect(state?.arquivos).toEqual([])
    expect(state?.comandos).toEqual([])
  })
})

describe('o boletim só observa', () => {
  test('o resultado de cada ferramenta volta intacto: ok, com erro ou negado', async ($, on) => {
    const motor = criarMotor(on)
    motor.definirFerramentas(entrada => {
      if (entrada.command === 'falha') return 'erro'
      return entrada.command === 'nega' ? 'negada' : 'ok'
    })
    await iniciarSessao($)
    await $.turn.start({ text: 'x', turnId: 't1' })

    const devolvidos = [
      await chamar($, BASH('ok')),
      await chamar($, BASH('falha')),
      await chamar($, BASH('nega')),
      await chamar($, EDIT('a.ts')),
    ]

    expect(devolvidos).toMatchObject(motor.resultadosDasFerramentas)
    expect(devolvidos.at(2)).toMatchObject({ deny: 'falhou de propósito' })
    expect(devolvidos.at(1)).toMatchObject({ isError: true })
  })

  test('se o registro falhar, a ferramenta segue normal e o erro vai só para o debug', async ($, on) => {
    const motor = criarMotor(on)
    on('state.set', () => ({ deny: 'estado fora do ar' }))
    await iniciarSessao($)

    const devolvido = await chamar($, BASH('npm test'))

    expect(devolvido).toMatchObject(motor.resultadosDasFerramentas.at(0) as object)
    expect(motor.depuracao.some(linha => linha.includes('estado fora do ar'))).toBe(true)
    expect(motor.conversa).toEqual([])
  })

  test('o fim do turno não espera a avaliação: o Jev só é chamado quando o relógio anda', async ($, on) => {
    const motor = criarMotor(on, { latenciaDoJevMs: 5000 })
    motor.responderJev({ tipo: 'notas', scores: NOTAS_7_3 })
    await iniciarSessao($)

    await comecarTurno($, { id: 't1' })
    await terminarTurno($, { id: 't1' })

    expect(motor.requisicoes).toHaveLength(0)
    expect(await linhasDaFaixa($)).toEqual(['Boletim: Jev avaliando o turno…'])
    expect(motor.conversa).toEqual([])

    await esperarAte(motor, () => motor.conversa.length > 0)

    expect(motor.requisicoes).toHaveLength(1)
    expect(motor.conversa).toHaveLength(1)
  })
})

describe('turnos que não geram boletim', () => {
  test('o turno de um subagente não gera boletim', async ($, on) => {
    const motor = criarMotor(on)
    await iniciarSessao($)
    await comecarTurno($, { id: 't1' })

    await terminarTurno($, { id: 't-sub' }, { agentId: 'agente-1' })
    await deixarPassar(motor)

    expect(motor.requisicoes).toHaveLength(0)
    expect(motor.conversa).toEqual([])
    expect(await linhasDaFaixa($)).toEqual([])
    expect(motor.aberturas.filter(abertura => abertura.id === 'boletim-do-claude')).toHaveLength(1)
  })

  test('o turno interrompido ou com erro também não gera boletim', async ($, on) => {
    const motor = criarMotor(on)
    await iniciarSessao($)

    await $.turn.complete({ answer: 'x', durationMs: 1, isAborted: true, turnId: 't1', reason: 'aborted' })
    await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't2', reason: 'error' })
    await deixarPassar(motor)

    expect(motor.requisicoes).toHaveLength(0)
    expect(motor.conversa).toEqual([])
  })

  test('depois de um subagente, o turno principal ainda gera o boletim', async ($, on) => {
    const motor = criarMotor(on)
    await iniciarSessao($)
    await comecarTurno($, { id: 't1' })
    await terminarTurno($, { id: 't-sub' }, { agentId: 'agente-1' })

    await terminarTurno($, { id: 't1' })
    await esperarAte(motor, () => motor.conversa.length > 0)

    expect(motor.requisicoes).toHaveLength(1)
    expect(motor.conversa).toEqual(['Boletim: nota 10,0 · nenhum ponto de melhoria'])
  })
})

describe('turnos que se atropelam', () => {
  test('o resultado de um turno mais velho não toma o lugar do que ainda está sendo avaliado', async ($, on) => {
    const motor = criarMotor(on, { latenciaDoJevMs: 100 })
    const liberarSegundo = motor.segurarJev(2)
    await iniciarSessao($)
    motor.responderJev({ tipo: 'notas', scores: [1, 1, 1, 1, 1, 1] })
    await comecarTurno($, { id: 't1' })
    await terminarTurno($, { id: 't1' })
    await comecarTurno($, { id: 't2' })
    await terminarTurno($, { id: 't2' })

    await esperarAte(motor, () => motor.conversa.length > 0 && motor.requisicoes.length > 1)

    // O t1 terminou e avisou, mas o t2 ainda espera o Jev: é ele que a linha acima do prompt mostra.
    expect(motor.conversa).toEqual(['Boletim: nota 6,0 · melhorar: Resumo final (ok), Como conferir (ok)'])
    expect(await linhasDaFaixa($)).toEqual(['Boletim: Jev avaliando o turno…'])

    motor.responderJev({ tipo: 'notas', scores: [2, 2, 2, 2, 2, 2] })
    liberarSegundo()
    await esperarAte(motor, () => motor.conversa.length > 1)

    expect(motor.conversa).toHaveLength(2)
    expect(motor.conversa.at(1)).toBe('Boletim: nota 10,0 · nenhum ponto de melhoria')
    expect((await linhasDaFaixa($)).at(0)).toContain('nota 10,0')
  })
})
