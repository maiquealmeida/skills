// /melhorar: grava no AGENTS.md da raiz, quando existe, ou no CLAUDE.md as
// regras dos pontos de melhoria do último turno.
import { describe, expect, test } from 'claude-code/testing'

import { iniciarSessao, rodarComando, rodarTurno } from './fluxo'
import { ARQUIVO_AGENTS, ARQUIVO_CLAUDE, criarMotor, REGRAS } from './motor'

const NOTAS_7_3 = [2, 1, 0, 2, 1, 2]
// Os dois pontos de melhoria de NOTAS_7_3, do mais baixo para o mais alto.
const PROVA = REGRAS.prova
const CONFERIR = REGRAS.conferir

const melhorar = ($: Parameters<typeof iniciarSessao>[0]): Promise<string | undefined> => rodarComando($, 'melhorar')

describe('/melhorar grava as regras', () => {
  test('com apenas CLAUDE.md, usa o arquivo existente e não cria AGENTS.md', async ($, on) => {
    const motor = criarMotor(on, { claude: '# Projeto\n' })
    motor.responderJev({ tipo: 'notas', scores: NOTAS_7_3 })
    await iniciarSessao($)
    await rodarTurno($, motor, { id: 't1' })

    expect(await melhorar($)).toBe(`Gravei no CLAUDE.md estas 2 regras:\n- ${PROVA}\n- ${CONFERIR}`)
    expect(motor.arquivos.get(ARQUIVO_CLAUDE)).toBe(`# Projeto\n\n## Regras do boletim\n\n- ${PROVA}\n- ${CONFERIR}\n`)
    expect(motor.arquivos.has(ARQUIVO_AGENTS)).toBe(false)
  })

  test('sem ambos os arquivos, cria AGENTS.md com a seção Regras do boletim', async ($, on) => {
    const motor = criarMotor(on)
    motor.responderJev({ tipo: 'notas', scores: NOTAS_7_3 })
    await iniciarSessao($)
    await rodarTurno($, motor, { id: 't1' })
    expect(motor.arquivos.has(ARQUIVO_AGENTS)).toBe(false)

    const resposta = await melhorar($)

    expect(resposta).toBe(`Gravei no AGENTS.md estas 2 regras:\n- ${PROVA}\n- ${CONFERIR}`)
    expect(motor.arquivos.get(ARQUIVO_AGENTS)).toBe(`## Regras do boletim\n\n- ${PROVA}\n- ${CONFERIR}\n`)
    expect(motor.arquivos.has(ARQUIVO_CLAUDE)).toBe(false)
  })

  test('com um ponto de melhoria só, diz "esta regra"', async ($, on) => {
    const motor = criarMotor(on)
    motor.responderJev({ tipo: 'notas', scores: [2, 2, 0, 2, 2, 2] })
    await iniciarSessao($)
    await rodarTurno($, motor, { id: 't1' })

    const resposta = await melhorar($)

    expect(resposta).toBe(`Gravei no AGENTS.md esta regra: ${PROVA}`)
  })

  test('não duplica: rodar duas vezes não muda o arquivo', async ($, on) => {
    const motor = criarMotor(on)
    motor.responderJev({ tipo: 'notas', scores: NOTAS_7_3 })
    await iniciarSessao($)
    await rodarTurno($, motor, { id: 't1' })
    await melhorar($)
    const depoisDaPrimeira = motor.arquivos.get(ARQUIVO_AGENTS)

    const segunda = await melhorar($)

    expect(segunda).toBe(`As regras "${PROVA}", "${CONFERIR}" já estão no AGENTS.md. Nada mudou.`)
    expect(motor.arquivos.get(ARQUIVO_AGENTS)).toBe(depoisDaPrimeira)
  })

  test('só acrescenta as que faltam, comparando sem ligar para espaços e maiúsculas', async ($, on) => {
    const existente = `# Projeto\n\nRegra antiga: ANTES DE DIZER   QUE TERMINOU, rode os testes\ne diga o resultado.\n`
    const motor = criarMotor(on, { claude: existente })
    motor.responderJev({ tipo: 'notas', scores: NOTAS_7_3 })
    await iniciarSessao($)
    await rodarTurno($, motor, { id: 't1' })

    const resposta = await melhorar($)

    expect(resposta).toBe(`Gravei no CLAUDE.md esta regra: ${CONFERIR}\nA outra já estava no CLAUDE.md.`)
    expect(motor.arquivos.get(ARQUIVO_CLAUDE)).toBe(`${existente}\n## Regras do boletim\n\n- ${CONFERIR}\n`)
  })

  test('numa seção que já existe, insere no fim dela, antes do próximo ## ', async ($, on) => {
    const existente = `# Projeto\n\n## Regras do boletim\n\n- Uma regra antiga.\n\n## Outra seção\n\ntexto\n`
    const motor = criarMotor(on, { claude: existente })
    motor.responderJev({ tipo: 'notas', scores: NOTAS_7_3 })
    await iniciarSessao($)
    await rodarTurno($, motor, { id: 't1' })

    await melhorar($)

    expect(motor.arquivos.get(ARQUIVO_CLAUDE)).toBe(
      `# Projeto\n\n## Regras do boletim\n\n- Uma regra antiga.\n- ${PROVA}\n- ${CONFERIR}\n\n## Outra seção\n\ntexto\n`,
    )
  })

  test('preserva CRLF quando o arquivo usa CRLF', async ($, on) => {
    const existente = `# Projeto\r\n\r\n## Regras do boletim\r\n\r\n- Uma regra antiga.\r\n\r\n## Outra seção\r\n\r\ntexto\r\n`
    const motor = criarMotor(on, { claude: existente })
    motor.responderJev({ tipo: 'notas', scores: NOTAS_7_3 })
    await iniciarSessao($)
    await rodarTurno($, motor, { id: 't1' })

    await melhorar($)

    const gravado = motor.arquivos.get(ARQUIVO_CLAUDE) ?? ''
    expect(gravado).toBe(
      `# Projeto\r\n\r\n## Regras do boletim\r\n\r\n- Uma regra antiga.\r\n- ${PROVA}\r\n- ${CONFERIR}\r\n\r\n## Outra seção\r\n\r\ntexto\r\n`,
    )
    expect(gravado.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/)
  })

  test('usa o AGENTS.md da raiz do projeto, mesmo com a raiz escrita com barra invertida', async ($, on) => {
    const motor = criarMotor(on)
    motor.responderJev({ tipo: 'notas', scores: NOTAS_7_3 })
    await iniciarSessao($)
    await rodarTurno($, motor, { id: 't1' })

    await melhorar($)

    expect([...motor.arquivos.keys()].filter(caminho => caminho.endsWith('AGENTS.md'))).toEqual(['C:/repo/AGENTS.md'])
  })
})

describe('/melhorar num projeto que usa AGENTS.md', () => {
  test('sem CLAUDE.md, grava no AGENTS.md e não cria o CLAUDE.md', async ($, on) => {
    const existente = `# Projeto\n\n## Regras do boletim\n\n- Uma regra antiga.\n`
    const motor = criarMotor(on, { agents: existente })
    motor.responderJev({ tipo: 'notas', scores: NOTAS_7_3 })
    await iniciarSessao($)
    await rodarTurno($, motor, { id: 't1' })

    const resposta = await melhorar($)

    expect(resposta).toBe(`Gravei no AGENTS.md estas 2 regras:\n- ${PROVA}\n- ${CONFERIR}`)
    expect(motor.arquivos.get(ARQUIVO_AGENTS)).toBe(`${existente}- ${PROVA}\n- ${CONFERIR}\n`)
    expect(motor.arquivos.has(ARQUIVO_CLAUDE)).toBe(false)
  })

  test('com CLAUDE.md e AGENTS.md, prioriza AGENTS.md e preserva CLAUDE.md', async ($, on) => {
    const motor = criarMotor(on, { claude: '# Projeto\n', agents: '# Agentes\n' })
    motor.responderJev({ tipo: 'notas', scores: NOTAS_7_3 })
    await iniciarSessao($)
    await rodarTurno($, motor, { id: 't1' })

    const resposta = await melhorar($)

    expect(resposta).toBe(`Gravei no AGENTS.md estas 2 regras:\n- ${PROVA}\n- ${CONFERIR}`)
    expect(motor.arquivos.get(ARQUIVO_AGENTS)).toBe(`# Agentes\n\n## Regras do boletim\n\n- ${PROVA}\n- ${CONFERIR}\n`)
    expect(motor.arquivos.get(ARQUIVO_CLAUDE)).toBe('# Projeto\n')
  })

  test('AGENTS.md vazio também tem prioridade e a segunda execução não duplica regras', async ($, on) => {
    const motor = criarMotor(on, { claude: '# Projeto\n', agents: '' })
    motor.responderJev({ tipo: 'notas', scores: NOTAS_7_3 })
    await iniciarSessao($)
    await rodarTurno($, motor, { id: 't1' })

    await melhorar($)
    const gravado = motor.arquivos.get(ARQUIVO_AGENTS)
    expect(gravado).toBe(`## Regras do boletim\n\n- ${PROVA}\n- ${CONFERIR}\n`)
    expect(await melhorar($)).toBe(`As regras "${PROVA}", "${CONFERIR}" já estão no AGENTS.md. Nada mudou.`)
    expect(motor.arquivos.get(ARQUIVO_AGENTS)).toBe(gravado)
    expect(motor.arquivos.get(ARQUIVO_CLAUDE)).toBe('# Projeto\n')
  })

  test('regras que já estão no AGENTS.md: avisa citando o AGENTS.md', async ($, on) => {
    const existente = `## Regras do boletim\n\n- ${PROVA}\n- ${CONFERIR}\n`
    const motor = criarMotor(on, { agents: existente })
    motor.responderJev({ tipo: 'notas', scores: NOTAS_7_3 })
    await iniciarSessao($)
    await rodarTurno($, motor, { id: 't1' })

    expect(await melhorar($)).toBe(`As regras "${PROVA}", "${CONFERIR}" já estão no AGENTS.md. Nada mudou.`)
    expect(motor.arquivos.get(ARQUIVO_AGENTS)).toBe(existente)
    expect(motor.arquivos.has(ARQUIVO_CLAUDE)).toBe(false)
  })

  test('turno sem ponto de melhoria: o aviso cita o AGENTS.md', async ($, on) => {
    const motor = criarMotor(on, { agents: '# Agentes\n' })
    await iniciarSessao($)
    await rodarTurno($, motor, { id: 't1' })

    expect(await melhorar($)).toBe(
      'Nenhum ponto de melhoria no último turno (nota 10,0). O AGENTS.md ficou como estava.',
    )
  })

  test('se não conseguir gravar no AGENTS.md, o aviso cita o AGENTS.md', async ($, on) => {
    const motor = criarMotor(on, { agents: '# Agentes\n', claude: '# Projeto\n' })
    motor.responderJev({ tipo: 'notas', scores: NOTAS_7_3 })
    await iniciarSessao($)
    await rodarTurno($, motor, { id: 't1' })
    motor.falharEscrita(true)

    expect(await melhorar($)).toBe('Não consegui gravar no AGENTS.md (detalhe no log de debug).')
    expect(motor.arquivos.get(ARQUIVO_AGENTS)).toBe('# Agentes\n')
    expect(motor.arquivos.get(ARQUIVO_CLAUDE)).toBe('# Projeto\n')
  })
})

describe('/melhorar sem nada para gravar', () => {
  test('sem nenhum boletim ainda', async ($, on) => {
    const motor = criarMotor(on)
    await iniciarSessao($)

    expect(await melhorar($)).toBe('Ainda não tem boletim de um turno pra usar.')
    expect(motor.arquivos.has(ARQUIVO_AGENTS)).toBe(false)
  })

  test('com o último turno ainda sendo avaliado', async ($, on) => {
    const motor = criarMotor(on)
    motor.segurarJev(1)
    await iniciarSessao($)
    await $.turn.start({ text: 'x', turnId: 't1' })
    await $.turn.complete({ answer: 'y', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })

    await motor.relogio.settle()

    expect(await melhorar($)).toBe('Ainda não tem boletim de um turno pra usar.')
  })

  test('turno sem ponto de melhoria deixa o CLAUDE.md como estava', async ($, on) => {
    const existente = '# Projeto\n'
    const motor = criarMotor(on, { claude: existente })
    await iniciarSessao($)
    await rodarTurno($, motor, { id: 't1' })

    expect(await melhorar($)).toBe(
      'Nenhum ponto de melhoria no último turno (nota 10,0). O CLAUDE.md ficou como estava.',
    )
    expect(motor.arquivos.get(ARQUIVO_CLAUDE)).toBe(existente)
  })

  test('turno sem boletim por causa do Jev fora do ar', async ($, on) => {
    const motor = criarMotor(on)
    motor.responderJev({ tipo: 'rede', erro: 'caiu' })
    await iniciarSessao($)
    await rodarTurno($, motor, { id: 't1' })

    expect(await melhorar($)).toBe(
      'O último turno ficou sem boletim (Jev fora do ar). O AGENTS.md ficou como estava.',
    )
    expect(motor.arquivos.has(ARQUIVO_AGENTS)).toBe(false)
  })

  test('usa o último turno avaliado: um turno novo, ainda em andamento, não mistura as regras', async ($, on) => {
    const motor = criarMotor(on)
    motor.responderJev({ tipo: 'notas', scores: NOTAS_7_3 })
    await iniciarSessao($)
    await rodarTurno($, motor, { id: 't1' })
    motor.responderJev({ tipo: 'notas', scores: [2, 2, 2, 2, 2, 0] })
    await rodarTurno($, motor, { id: 't2' })

    expect(await melhorar($)).toBe(`Gravei no AGENTS.md esta regra: ${REGRAS.proximo}`)
  })
})

describe('/melhorar com problema no arquivo', () => {
  test('se não conseguir gravar, avisa e manda o detalhe só para o debug', async ($, on) => {
    const motor = criarMotor(on)
    motor.responderJev({ tipo: 'notas', scores: NOTAS_7_3 })
    await iniciarSessao($)
    await rodarTurno($, motor, { id: 't1' })
    motor.falharEscrita(true)

    const resposta = await melhorar($)

    expect(resposta).toBe('Não consegui gravar no AGENTS.md (detalhe no log de debug).')
    expect(motor.depuracao.some(linha => linha.includes('EACCES'))).toBe(true)
    expect(motor.arquivos.has(ARQUIVO_AGENTS)).toBe(false)
  })
})
