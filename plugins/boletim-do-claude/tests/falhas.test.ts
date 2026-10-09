// Jev fora do ar, chave ausente, critérios quebrados: o turno fica sem nota e nada mais quebra.
// A chave nunca aparece na tela.
import { describe, expect, test } from 'claude-code/testing'

import { iniciarSessao, rodarTurno } from './fluxo'
import { ARQUIVO_ENV, ARQUIVO_ENV_DO_PROJETO, CHAVE, corpoDoJev, criarMotor, ENV_COM_CHAVE } from './motor'
import type { Motor, OpcoesDoMotor, RespostaDoJev } from './motor'
import { elementos, linhasDe, montarFaixa, montarPainel, textosEstilizados } from './tela'
import type { No } from './tela'

type Falha = {
  nome: string
  opcoes?: OpcoesDoMotor
  jev?: RespostaDoJev
  preparar?: (motor: Motor) => void
}

const FALHAS: readonly Falha[] = [
  { nome: 'sem o ~/.env.local', opcoes: { env: null } },
  { nome: 'sem a chave no ~/.env.local', opcoes: { env: 'OUTRA_COISA=1\n' } },
  { nome: 'sem HOME nem USERPROFILE', opcoes: { variaveis: {} } },
  { nome: 'HOME e USERPROFILE vazios', opcoes: { variaveis: { HOME: '', USERPROFILE: '' } } },
  { nome: 'a rede caiu', jev: { tipo: 'rede', erro: 'connect ECONNREFUSED 10.0.0.1:443' } },
  { nome: 'HTTP 500', jev: { tipo: 'http', status: 500, corpo: '{"error":"boom"}' } },
  { nome: 'HTTP 401', jev: { tipo: 'http', status: 401, corpo: '{"error":"Missing or invalid API key"}' } },
  { nome: 'HTTP 429', jev: { tipo: 'http', status: 429, corpo: '{"error":"rate limit"}' } },
  { nome: 'corpo que não é JSON', jev: { tipo: 'corpo', corpo: '<html>502 Bad Gateway</html>' } },
  { nome: 'resposta sem o critério c3', jev: { tipo: 'corpo', corpo: corpoDoJev([2, 2, 2, 2, 2, 2], { sem: [3] }) } },
  { nome: 'resposta sem answers', jev: { tipo: 'corpo', corpo: '{"model":"jev-1"}' } },
  {
    nome: 'score que não é número',
    jev: { tipo: 'corpo', corpo: JSON.stringify({ answers: { c0: { score: 'alto' } } }) },
  },
  { nome: 'criterios.json sem nenhum critério', preparar: motor => motor.definirCriterios('{"criterios":[]}') },
  { nome: 'criterios.json quebrado', preparar: motor => motor.definirCriterios('{ quebrado') },
]

describe('Jev fora do ar', () => {
  for (const falha of FALHAS) {
    test(`${falha.nome}: aviso na conversa e na linha, painel abre e nada quebra`, async ($, on) => {
      const motor = criarMotor(on, falha.opcoes)
      if (falha.jev !== undefined) motor.responderJev(falha.jev)
      falha.preparar?.(motor)
      await iniciarSessao($)

      await rodarTurno($, motor, { id: 't1' })

      expect(motor.conversa).toEqual(['Boletim: Jev fora do ar, turno sem nota'])
      const faixa = await montarFaixa($)
      const arvore = (await faixa.drawn()) as unknown as No
      await faixa.unmount()
      expect(linhasDe(arvore)).toEqual(['Boletim: Jev fora do ar'])
      expect(textosEstilizados(arvore, 'Boletim: Jev fora do ar').map(texto => texto.props)).toEqual([
        { color: 'yellow' },
      ])
      const painel = await montarPainel($)
      expect(linhasDe((await painel.drawn()) as unknown as No)).toEqual([
        'Jev fora do ar: o último turno ficou sem nota.',
      ])
      await painel.unmount()
      expect(motor.aberturas.length).toBeGreaterThan(0)
      expect(motor.fechamentos).toEqual([])
      expect(motor.store.has('historico')).toBe(false)
      // O detalhe do erro vai para o log de debug.
      expect(motor.depuracao.length).toBeGreaterThan(0)
    })
  }

  test('quando o Jev volta, o turno seguinte tem nota normalmente', async ($, on) => {
    const motor = criarMotor(on)
    motor.responderJev({ tipo: 'http', status: 503, corpo: 'fora' })
    await iniciarSessao($)
    await rodarTurno($, motor, { id: 't1' })

    motor.responderJev({ tipo: 'notas', scores: [2, 2, 2, 2, 2, 2] })
    await rodarTurno($, motor, { id: 't2' })

    expect(motor.conversa).toEqual([
      'Boletim: Jev fora do ar, turno sem nota',
      'Boletim: nota 10,0 · nenhum ponto de melhoria',
    ])
    expect(motor.store.get('historico')).toEqual([10])
  })

  test('a chave é lida do ~/.env.local a cada avaliação: pôr a chave com o mod rodando funciona', async ($, on) => {
    const motor = criarMotor(on, { env: null })
    await iniciarSessao($)
    await rodarTurno($, motor, { id: 't1' })
    expect(motor.requisicoes).toHaveLength(0)

    motor.arquivos.set(ARQUIVO_ENV, `TYPESAFE_API_KEY=${CHAVE}\n`)
    await rodarTurno($, motor, { id: 't2' })

    expect(motor.requisicoes).toHaveLength(1)
    expect(motor.requisicoes.at(0)?.headers.Authorization).toBe(`Bearer ${CHAVE}`)
    expect(motor.conversa.at(1)).toBe('Boletim: nota 10,0 · nenhum ponto de melhoria')
  })
})

describe('onde fica a chave', () => {
  test('o .env.local da raiz do projeto não vale mais: só o da home', async ($, on) => {
    const motor = criarMotor(on, { env: null })
    motor.arquivos.set(ARQUIVO_ENV_DO_PROJETO, ENV_COM_CHAVE)
    await iniciarSessao($)

    await rodarTurno($, motor, { id: 't1' })

    expect(motor.requisicoes).toHaveLength(0)
    expect(motor.conversa).toEqual(['Boletim: Jev fora do ar, turno sem nota'])
    expect(motor.leituras).not.toContain(ARQUIVO_ENV_DO_PROJETO)
  })

  test('trocar a chave no arquivo vale já no turno seguinte', async ($, on) => {
    const motor = criarMotor(on)
    await iniciarSessao($)
    await rodarTurno($, motor, { id: 't1' })

    motor.arquivos.set(ARQUIVO_ENV, 'TYPESAFE_API_KEY=chave-nova\n')
    await rodarTurno($, motor, { id: 't2' })

    expect(motor.requisicoes.map(chamada => chamada.headers.Authorization)).toEqual([
      `Bearer ${CHAVE}`,
      'Bearer chave-nova',
    ])
  })

  test('no Windows a home vem de USERPROFILE, com barra invertida trocada por /', async ($, on) => {
    const motor = criarMotor(on, { env: null, variaveis: { USERPROFILE: 'C:\\Users\\maique' } })
    motor.arquivos.set('C:/Users/maique/.env.local', ENV_COM_CHAVE)
    await iniciarSessao($)

    await rodarTurno($, motor, { id: 't1' })

    expect(motor.leituras).toContain('C:/Users/maique/.env.local')
    expect(motor.requisicoes).toHaveLength(1)
    expect(motor.conversa).toEqual(['Boletim: nota 10,0 · nenhum ponto de melhoria'])
  })

  test('com HOME vazio, a home vem de USERPROFILE', async ($, on) => {
    const motor = criarMotor(on, { env: null, variaveis: { HOME: '', USERPROFILE: 'C:\\Users\\maique' } })
    motor.arquivos.set('C:/Users/maique/.env.local', ENV_COM_CHAVE)
    await iniciarSessao($)

    await rodarTurno($, motor, { id: 't1' })

    expect(motor.requisicoes).toHaveLength(1)
  })

  test('com HOME e USERPROFILE, o HOME tem prioridade', async ($, on) => {
    const motor = criarMotor(on, { env: null, variaveis: { HOME: '/home/maique', USERPROFILE: 'C:\\Users\\outro' } })
    motor.arquivos.set(ARQUIVO_ENV, ENV_COM_CHAVE)
    await iniciarSessao($)

    await rodarTurno($, motor, { id: 't1' })

    expect(motor.requisicoes).toHaveLength(1)
    expect(motor.leituras.some(caminho => caminho.includes('outro'))).toBe(false)
  })

  test('a chave usada é a do ~/.env.local: export, aspas e comentário no fim da linha', async ($, on) => {
    const motor = criarMotor(on, { env: `A=1\nexport TYPESAFE_API_KEY='${CHAVE}'   # só aqui\nB=2\n` })
    await iniciarSessao($)

    await rodarTurno($, motor, { id: 't1' })

    expect(motor.requisicoes.at(0)?.headers.Authorization).toBe(`Bearer ${CHAVE}`)
  })
})

describe('a chave nunca aparece na tela', () => {
  const ECOS: readonly { nome: string; jev: RespostaDoJev }[] = [
    {
      nome: 'o Jev responde 401 repetindo a chave no corpo',
      jev: { tipo: 'http', status: 401, corpo: `{"error":"Invalid API key ${CHAVE}"}` },
    },
    {
      nome: 'o Jev responde 500 com o cabeçalho de volta',
      jev: { tipo: 'http', status: 500, corpo: `echo: Authorization: Bearer ${CHAVE}` },
    },
    {
      nome: 'a rede falha com a chave na mensagem de erro',
      jev: { tipo: 'rede', erro: `request failed: Authorization: Bearer ${CHAVE}` },
    },
    { nome: 'o corpo da resposta tem a chave e não é JSON', jev: { tipo: 'corpo', corpo: `oops ${CHAVE}` } },
  ]

  for (const eco of ECOS) {
    test(`${eco.nome}`, async ($, on) => {
      const motor = criarMotor(on, { temEspaco: false })
      motor.responderJev(eco.jev)
      await iniciarSessao($)

      await rodarTurno($, motor, { id: 't1' })

      const faixa = await montarFaixa($)
      const painel = await montarPainel($)
      const naTela = [
        ...motor.conversa,
        JSON.stringify(await faixa.drawn()),
        JSON.stringify(await painel.drawn()),
      ]
      await faixa.unmount()
      await painel.unmount()
      expect(naTela.some(texto => texto.includes(CHAVE))).toBe(false)
      // Nem o log de debug guarda a chave, mas o detalhe do erro está lá, com ***.
      expect(motor.depuracao.some(linha => linha.includes(CHAVE))).toBe(false)
      expect(motor.depuracao.some(linha => linha.includes('***'))).toBe(true)
    })
  }

  test('com tudo certo a chave também não aparece em lugar nenhum da tela', async ($, on) => {
    const motor = criarMotor(on, { temEspaco: false })
    await iniciarSessao($)
    await rodarTurno($, motor, { id: 't1' })

    const faixa = await montarFaixa($)
    const arvore = JSON.stringify(await faixa.drawn())
    await faixa.unmount()

    expect(arvore).not.toContain(CHAVE)
    expect(motor.conversa.join('\n')).not.toContain(CHAVE)
    expect(motor.depuracao.join('\n')).not.toContain(CHAVE)
    expect(elementos((JSON.parse(arvore) as No)).length).toBeGreaterThan(0)
  })
})

describe('a chave não sobra pela metade no log de debug', () => {
  const PEDACO_DA_CHAVE = CHAVE.slice(0, 8)

  test('HTTP com a chave onde o corpo seria cortado (300 caracteres)', async ($, on) => {
    const motor = criarMotor(on)
    motor.responderJev({ tipo: 'http', status: 500, corpo: `${'x'.repeat(285)}${CHAVE}` })
    await iniciarSessao($)

    await rodarTurno($, motor, { id: 't1' })

    expect(motor.depuracao.join('\n')).not.toContain(PEDACO_DA_CHAVE)
    expect(motor.depuracao.some(linha => linha.includes('***'))).toBe(true)
  })

  test('200 que não é JSON, com a chave onde o trecho seria cortado (200 caracteres)', async ($, on) => {
    const motor = criarMotor(on)
    motor.responderJev({ tipo: 'corpo', corpo: `${'x'.repeat(190)}${CHAVE}` })
    await iniciarSessao($)

    await rodarTurno($, motor, { id: 't1' })

    expect(motor.depuracao.join('\n')).not.toContain(PEDACO_DA_CHAVE)
    expect(motor.depuracao.some(linha => linha.includes('***'))).toBe(true)
  })
})
