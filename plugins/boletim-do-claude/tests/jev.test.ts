// O miolo puro: notas, degraus, requisição, critérios, chave, gráfico e CLAUDE.md.
import { describe, expect, test } from 'claude-code/testing'

import type { Degrau, Resultado, Turno } from '../types'
import {
  acrescentarNota,
  aplicarRegistro,
  avaliacaoPronta,
  barraDeConfianca,
  degrauDoScore,
  esconder,
  formatarNota,
  incluirRegras,
  iniciarTurno,
  lerChave,
  lerRespostas,
  linhaAcimaDoPrompt,
  linhaDeConversa,
  miniGrafico,
  montarBoletim,
  montarRequisicao,
  notaDoTurno,
  notasValidas,
  parseCriterios,
  planejarMelhorar,
  pontosDeMelhoria,
  registroDaFerramenta,
  textoRegrasGravadas,
  textoRegrasJaExistem,
  TURNO_VAZIO,
  ultimasNotas,
} from '../hooks/jev'
import type { Criterio } from '../hooks/jev'
import { corpoDoJev, REGRAS } from './motor'

const resultado = (nome: string, degrau: Degrau, confianca = 0.9): Resultado => ({
  nome,
  degrau,
  confianca,
  regra: `regra de ${nome}`,
})

const SEIS: readonly Degrau[] = ['ótimo', 'ok', 'fraco', 'ótimo', 'ok', 'ótimo']
const seis = (degraus: readonly Degrau[] = SEIS): Resultado[] =>
  degraus.map((degrau, posicao) => resultado(`C${posicao}`, degrau))

const criterio = (posicao: number): Criterio => ({
  nome: `C${posicao}`,
  pergunta: `P${posicao}?`,
  regra: `R${posicao}`,
  degraus: { fraco: 'f', ok: 'o', ótimo: 't' },
})
const criterios = (quantos: number): Criterio[] => Array.from({ length: quantos }, (_, posicao) => criterio(posicao))

describe('nota do turno', () => {
  test('é a média de ótimo 10, ok 6 e fraco 2, com uma casa decimal', () => {
    expect(notaDoTurno(seis())).toBe(7.3)
    expect(notaDoTurno(seis(['ótimo', 'ótimo']))).toBe(10)
    expect(notaDoTurno(seis(['fraco', 'fraco', 'fraco']))).toBe(2)
    expect(notaDoTurno(seis(['ok', 'ok', 'ok', 'ok']))).toBe(6)
    expect(notaDoTurno([])).toBe(0)
  })

  test('arredonda a média só na primeira casa, sem erro de ponto flutuante', () => {
    const quarenta: Degrau[] = [...Array<Degrau>(1).fill('fraco'), ...Array<Degrau>(39).fill('ótimo')]
    expect(notaDoTurno(seis(quarenta))).toBe(9.8)
    expect(notaDoTurno(seis(['ótimo', 'ótimo', 'ok']))).toBe(8.7)
  })

  test('é escrita com vírgula: 7,3 · 10,0 · 6,0', () => {
    expect(formatarNota(7.3)).toBe('7,3')
    expect(formatarNota(10)).toBe('10,0')
    expect(formatarNota(6)).toBe('6,0')
  })
})

describe('degrau pela posição arredondada', () => {
  test('score de 0 a 2 vira fraco, ok ou ótimo pelo arredondamento', () => {
    const casos: [number, Degrau][] = [
      [0, 'fraco'],
      [0.49, 'fraco'],
      [0.5, 'ok'],
      [0.98, 'ok'],
      [1, 'ok'],
      [1.49, 'ok'],
      [1.5, 'ótimo'],
      [2, 'ótimo'],
      [2.7, 'ótimo'],
      [-0.3, 'fraco'],
    ]
    for (const [score, esperado] of casos) {
      expect(degrauDoScore(score)).toBe(esperado)
    }
  })

  test('Jev dividido entre fraco e ótimo dá ok, e não o degrau que ficou na frente', () => {
    const corpo = corpoDoJev([0.98], { probabilidades: [{ '0': 0.51, '1': 0, '2': 0.49 }] })

    const [lido] = lerRespostas(corpo, criterios(1))

    expect(lido?.degrau).toBe('ok')
  })
})

describe('pontos de melhoria', () => {
  test('são os critérios abaixo de ótimo, do mais baixo para o mais alto', () => {
    const melhorias = pontosDeMelhoria(seis(['ótimo', 'ok', 'fraco', 'ótimo', 'ok', 'ótimo']))

    expect(melhorias.map(item => `${item.nome}:${item.degrau}`)).toEqual(['C2:fraco', 'C1:ok'])
  })

  test('no empate o critério que vem primeiro na lista fica na frente, e são no máximo 2', () => {
    const melhorias = pontosDeMelhoria(seis(['ok', 'fraco', 'ok', 'fraco', 'fraco', 'ok']))

    expect(melhorias.map(item => item.nome)).toEqual(['C1', 'C3'])
    expect(pontosDeMelhoria(seis(['ok', 'ok', 'ok', 'ótimo', 'ótimo', 'ótimo'])).map(item => item.nome)).toEqual([
      'C0',
      'C1',
    ])
  })

  test('tudo em ótimo não deixa ponto nenhum', () => {
    expect(pontosDeMelhoria(seis(['ótimo', 'ótimo', 'ótimo']))).toEqual([])
  })

  test('a avaliação pronta traz a nota, o tempo e os pontos de melhoria', () => {
    const pronta = avaliacaoPronta('t1', seis(), 412)

    expect(pronta.estado).toBe('ok')
    expect(pronta.id).toBe('t1')
    expect(pronta.nota).toBe(7.3)
    expect(pronta.ms).toBe(412)
    expect(pronta.melhorias.map(item => item.nome)).toEqual(['C2', 'C1'])
  })
})

describe('resposta do Jev', () => {
  test('lê um score e uma confiança por critério', () => {
    const corpo = corpoDoJev([2, 1, 0], { confianca: 0.75 })

    const lidos = lerRespostas(corpo, criterios(3))

    expect(lidos.map(item => item.degrau)).toEqual(['ótimo', 'ok', 'fraco'])
    expect(lidos.map(item => item.confianca)).toEqual([0.75, 0.75, 0.75])
    expect(lidos.map(item => item.regra)).toEqual(['R0', 'R1', 'R2'])
  })

  test('falta de qualquer critério é erro', () => {
    const semOTerceiro = corpoDoJev([2, 1, 0], { sem: [2] })

    expect(() => lerRespostas(semOTerceiro, criterios(3))).toThrow('c2')
  })

  test('score que não é número é erro; confiança fora de 0 a 1 é cortada', () => {
    const textoNoScore = JSON.stringify({ answers: { c0: { score: '2', confidence: 1 } } })
    const confiancaAlta = JSON.stringify({ answers: { c0: { score: 2, confidence: 7 } } })
    const semConfianca = JSON.stringify({ answers: { c0: { score: 2 } } })

    expect(() => lerRespostas(textoNoScore, criterios(1))).toThrow('c0')
    expect(lerRespostas(confiancaAlta, criterios(1)).at(0)?.confianca).toBe(1)
    expect(lerRespostas(semConfianca, criterios(1)).at(0)?.confianca).toBe(0)
  })

  test('corpo que não é JSON, ou sem answers, é erro', () => {
    expect(() => lerRespostas('<html>502</html>', criterios(1))).toThrow('JSON')
    expect(() => lerRespostas('{"model":"jev"}', criterios(1))).toThrow('answers')
    expect(() => lerRespostas('[]', criterios(1))).toThrow('answers')
  })
})

describe('criterios.json', () => {
  test('lê nome, pergunta, regra e degraus, e ignora o _como_editar', () => {
    const texto = JSON.stringify({
      _como_editar: { qualquer: 'coisa' },
      criterios: [
        { nome: 'A', pergunta: 'a?', regra: 'ra', degraus: { fraco: 'f', ok: 'o', ótimo: 't' } },
      ],
    })

    expect(parseCriterios(texto)).toEqual([
      { nome: 'A', pergunta: 'a?', regra: 'ra', degraus: { fraco: 'f', ok: 'o', ótimo: 't' } },
    ])
  })

  test('critério sem nome, pergunta ou regra é ignorado', () => {
    const texto = JSON.stringify({
      criterios: [
        { pergunta: 'a?', regra: 'ra' },
        { nome: 'B', regra: 'rb' },
        { nome: 'C', pergunta: 'c?' },
        { nome: '  ', pergunta: 'd?', regra: 'rd' },
        'texto solto',
        { nome: 'E', pergunta: 'e?', regra: 're' },
      ],
    })

    expect(parseCriterios(texto).map(item => item.nome)).toEqual(['E'])
  })

  test('sem degraus, ou com só alguns, usa textos genéricos', () => {
    const texto = JSON.stringify({
      criterios: [
        { nome: 'A', pergunta: 'a?', regra: 'ra' },
        { nome: 'B', pergunta: 'b?', regra: 'rb', degraus: { ok: 'só o ok' } },
      ],
    })

    const [semDegraus, comUm] = parseCriterios(texto)

    expect(semDegraus?.degraus).toEqual({
      fraco: 'não atende ao critério',
      ok: 'atende em parte',
      ótimo: 'atende bem',
    })
    expect(comUm?.degraus.ok).toBe('só o ok')
    expect(comUm?.degraus.fraco).toBe('não atende ao critério')
  })

  test('lista vazia, JSON quebrado ou sem lista é erro', () => {
    expect(() => parseCriterios('{"criterios":[]}')).toThrow('nenhum critério')
    expect(() => parseCriterios('{"criterios":[{"nome":"x"}]}')).toThrow('nenhum critério')
    expect(() => parseCriterios('{ quebrado')).toThrow('JSON')
    expect(() => parseCriterios('{"outra":1}')).toThrow('lista')
    expect(() => parseCriterios('[]')).toThrow('lista')
  })
})

describe('chave do .env.local', () => {
  test('aceita export, aspas e comentário no fim', () => {
    const casos: [string, string | undefined][] = [
      ['TYPESAFE_API_KEY=abc', 'abc'],
      ['export TYPESAFE_API_KEY=abc', 'abc'],
      ['TYPESAFE_API_KEY="abc def"', 'abc def'],
      ["TYPESAFE_API_KEY='abc'", 'abc'],
      ['export TYPESAFE_API_KEY="abc" # chave do Jev', 'abc'],
      ['TYPESAFE_API_KEY=abc # chave do Jev', 'abc'],
      ['TYPESAFE_API_KEY = "abc"', 'abc'],
      ['TYPESAFE_API_KEY=abc#sem-espaco', 'abc#sem-espaco'],
      ['  TYPESAFE_API_KEY=abc  ', 'abc'],
    ]
    for (const [linha, esperada] of casos) {
      expect(lerChave(linha)).toBe(esperada)
    }
  })

  test('ignora comentário, nome parecido e valor vazio', () => {
    expect(lerChave('# TYPESAFE_API_KEY=abc')).toBeUndefined()
    expect(lerChave('NEXT_PUBLIC_TYPESAFE_API_KEY=abc')).toBeUndefined()
    expect(lerChave('TYPESAFE_API_KEY_OLD=abc')).toBeUndefined()
    expect(lerChave('TYPESAFE_API_KEY=')).toBeUndefined()
    expect(lerChave('TYPESAFE_API_KEY=""')).toBeUndefined()
    expect(lerChave('')).toBeUndefined()
  })

  test('acha a chave no meio do arquivo, com CRLF, e a última definição vale', () => {
    const arquivo = 'A=1\r\nTYPESAFE_API_KEY=velha\r\nB=2\r\nexport TYPESAFE_API_KEY="nova"\r\n'

    expect(lerChave(arquivo)).toBe('nova')
  })

  test('esconder troca a chave por *** e não faz nada sem chave', () => {
    expect(esconder('Bearer sk-1 e de novo sk-1', 'sk-1')).toBe('Bearer *** e de novo ***')
    expect(esconder('texto', undefined)).toBe('texto')
    expect(esconder('texto', '')).toBe('texto')
    expect(esconder('a.b', '.')).toBe('a***b')
  })
})

describe('requisição ao Jev', () => {
  const retrato = {
    pedido: 'faça X',
    arquivos: ['a.ts'],
    comandos: [
      { comando: 'npm test', ok: true, teste: true },
      { comando: 'ls', ok: false, teste: false },
    ],
    resposta: 'feito',
  }

  test('leva o retrato no state e uma pergunta score por critério (c0, c1...)', () => {
    const requisicao = montarRequisicao(retrato, criterios(2))

    expect(requisicao.model).toBe('jev-latest')
    expect(requisicao.state).toEqual({
      pedido: 'faça X',
      arquivos: ['a.ts'],
      comandos: [
        { comando: 'npm test', resultado: 'deu certo', teste: true },
        { comando: 'ls', resultado: 'falhou', teste: false },
      ],
      resposta: 'feito',
    })
    expect(Object.keys(requisicao.questions)).toEqual(['c0', 'c1'])
    expect(requisicao.questions.c1).toMatchObject({
      type: 'score',
      instructions: { criterio: 'C1', pergunta: 'P1?' },
      criteria: ['fraco: f', 'ok: o', 'ótimo: t'],
    })
    expect(requisicao.questions.c0?.instructions.tarefa).toContain('pedido')
  })

  test('corta o pedido em 2000, os arquivos em 50, os comandos nos últimos 30 e a resposta em 8000', () => {
    const grande = {
      pedido: 'p'.repeat(2500),
      arquivos: Array.from({ length: 60 }, (_, i) => `f${i}.ts`),
      comandos: Array.from({ length: 40 }, (_, i) => ({ comando: `c${i}`, ok: true, teste: false })),
      resposta: `${'início '.repeat(2000)}FIM`,
    }

    const { state } = montarRequisicao(grande, criterios(1))

    expect(state.pedido).toHaveLength(2000)
    expect(state.arquivos).toHaveLength(50)
    expect(state.arquivos.at(-1)).toBe('f59.ts')
    expect(state.comandos).toHaveLength(30)
    expect(state.comandos.at(0)?.comando).toBe('c10')
    expect(state.comandos.at(-1)?.comando).toBe('c39')
    expect(state.resposta).toHaveLength(8000)
    expect(state.resposta.endsWith('FIM')).toBe(true)
  })
})

describe('gráfico e histórico', () => {
  test('mini gráfico: cada nota vira ▁..█ por nota/10*7', () => {
    expect(miniGrafico([0, 2, 6, 7.3, 10])).toBe('▁▂▅▆█')
    expect(miniGrafico([])).toBe('')
    expect(miniGrafico([-3, 14])).toBe('▁█')
  })

  test('as últimas 6 notas vêm ligadas por setas', () => {
    expect(ultimasNotas([6, 7.3, 10])).toBe('6,0 → 7,3 → 10,0')
    expect(ultimasNotas([1, 2, 3, 4, 5, 6, 7, 8])).toBe('3,0 → 4,0 → 5,0 → 6,0 → 7,0 → 8,0')
  })

  test('a barra da confiança tem 10 casas', () => {
    expect(barraDeConfianca(1)).toBe('██████████')
    expect(barraDeConfianca(0.6)).toBe('██████░░░░')
    expect(barraDeConfianca(0)).toBe('░░░░░░░░░░')
  })

  test('o histórico guarda as últimas 20 notas', () => {
    const vinte = Array.from({ length: 20 }, (_, i) => i / 2)

    const novo = acrescentarNota(vinte, 9.9)

    expect(novo).toHaveLength(20)
    expect(novo.at(0)).toBe(0.5)
    expect(novo.at(-1)).toBe(9.9)
    expect(vinte).toHaveLength(20)
    expect(vinte.at(-1)).toBe(9.5)
  })

  test('do store só volta lista de notas entre 0 e 10', () => {
    expect(notasValidas([6, 7.3, 10])).toEqual([6, 7.3, 10])
    expect(notasValidas([6, 'x', null, 11, -1, Number.NaN, 8])).toEqual([6, 8])
    expect(notasValidas('6,7')).toEqual([])
    expect(notasValidas(undefined)).toEqual([])
    expect(notasValidas(Array.from({ length: 30 }, () => 5))).toHaveLength(20)
  })
})

describe('retrato do turno', () => {
  const vazio: Turno = TURNO_VAZIO

  test('guarda Write, Edit, MultiEdit e NotebookEdit pelo file_path ou notebook_path, sem repetir', () => {
    const entradas: [string, Record<string, unknown>][] = [
      ['Write', { file_path: 'a.ts' }],
      ['Edit', { file_path: 'b.ts' }],
      ['MultiEdit', { file_path: 'c.ts' }],
      ['NotebookEdit', { notebook_path: 'n.ipynb' }],
      ['Edit', { file_path: 'a.ts' }],
    ]

    const turno = entradas.reduce((atual, [ferramenta, entrada]) => {
      const registro = registroDaFerramenta(ferramenta, entrada, true)
      return registro === null ? atual : aplicarRegistro(atual, registro)
    }, vazio)

    expect(turno.arquivos).toEqual(['a.ts', 'b.ts', 'c.ts', 'n.ipynb'])
  })

  test('edição negada ou com erro não entra nos arquivos', () => {
    expect(registroDaFerramenta('Edit', { file_path: 'a.ts' }, false)).toBeNull()
  })

  test('ignora as outras ferramentas e entradas sem caminho ou comando', () => {
    expect(registroDaFerramenta('Read', { file_path: 'a.ts' }, true)).toBeNull()
    expect(registroDaFerramenta('Grep', { pattern: 'x' }, true)).toBeNull()
    expect(registroDaFerramenta('Edit', {}, true)).toBeNull()
    expect(registroDaFerramenta('Bash', {}, true)).toBeNull()
    expect(registroDaFerramenta('Bash', { command: 7 }, true)).toBeNull()
  })

  test('Bash e PowerShell viram comando, cortado em 300 caracteres, com ok e teste', () => {
    const longo = `echo ${'x'.repeat(400)}`

    const bash = registroDaFerramenta('Bash', { command: longo }, true)
    const powershell = registroDaFerramenta('PowerShell', { command: 'npm run build' }, false)

    expect(bash).toMatchObject({ comando: { ok: true, teste: false } })
    expect(bash && 'comando' in bash ? bash.comando.comando : '').toHaveLength(300)
    expect(powershell).toEqual({ comando: { comando: 'npm run build', ok: false, teste: true } })
  })

  test('teste é o que casa com test, vitest, jest, pytest, mocha, playwright, cypress, tsc, lint, eslint ou build', () => {
    const testes = ['npm test', 'npx vitest run', 'jest', 'pytest -q', 'mocha', 'npx playwright test', 'cypress run']
    const verificacoes = ['tsc --noEmit', 'npm run lint', 'npx eslint .', 'pnpm build']
    const outros = ['ls -la', 'git status', 'cat package.json', 'node server.js']
    const ehTeste = (comando: string): boolean => {
      const registro = registroDaFerramenta('Bash', { command: comando }, true)
      return registro !== null && 'comando' in registro && registro.comando.teste
    }

    expect([...testes, ...verificacoes].every(ehTeste)).toBe(true)
    expect(outros.some(ehTeste)).toBe(false)
  })

  test('guarda só os últimos 50 arquivos e os últimos 50 comandos', () => {
    const cheio = Array.from({ length: 55 }, (_, i) => i).reduce((atual, i) => {
      const comAquivo = aplicarRegistro(atual, { arquivo: `f${i}.ts` })
      return aplicarRegistro(comAquivo, { comando: { comando: `c${i}`, ok: true, teste: false } })
    }, vazio)

    expect(cheio.arquivos).toHaveLength(50)
    expect(cheio.arquivos.at(0)).toBe('f5.ts')
    expect(cheio.comandos).toHaveLength(50)
    expect(cheio.comandos.at(-1)?.comando).toBe('c54')
  })

  test('aplicar um registro não altera o turno de antes', () => {
    const antes: Turno = { pedido: 'p', arquivos: ['a.ts'], comandos: [] }

    const depois = aplicarRegistro(antes, { arquivo: 'b.ts' })

    expect(antes.arquivos).toEqual(['a.ts'])
    expect(depois.arquivos).toEqual(['a.ts', 'b.ts'])
  })

  test('turno novo zera arquivos e comandos e fica com o pedido de antes se o texto vier vazio', () => {
    const antes: Turno = { pedido: 'pedido antigo', arquivos: ['a.ts'], comandos: [{ comando: 'ls', ok: true, teste: false }] }

    expect(iniciarTurno(antes, 'pedido novo')).toEqual({ pedido: 'pedido novo', arquivos: [], comandos: [] })
    expect(iniciarTurno(antes, '')).toEqual({ pedido: 'pedido antigo', arquivos: [], comandos: [] })
    expect(iniciarTurno(antes, '   ').pedido).toBe('pedido antigo')
  })
})

describe('textos do boletim', () => {
  const pronta = avaliacaoPronta('t', seis(), 412)
  const perfeita = avaliacaoPronta('t', seis(['ótimo', 'ótimo']), 5)

  test('linha da conversa: nota e pontos de melhoria, ou nenhum, ou Jev fora', () => {
    expect(linhaDeConversa(pronta)).toBe('Boletim: nota 7,3 · melhorar: C2 (fraco), C1 (ok)')
    expect(linhaDeConversa(perfeita)).toBe('Boletim: nota 10,0 · nenhum ponto de melhoria')
    expect(linhaDeConversa({ estado: 'fora', id: 't' })).toBe('Boletim: Jev fora do ar, turno sem nota')
  })

  test('linha acima do prompt: normal com melhorias, discreta sem, amarela com o Jev fora', () => {
    expect(linhaAcimaDoPrompt(pronta)).toEqual({
      texto: 'Boletim: nota 7,3 · 2 pontos de melhoria · /boletim pra ver, /melhorar pra gravar no CLAUDE.md',
      tom: 'normal',
    })
    expect(linhaAcimaDoPrompt(avaliacaoPronta('t', seis(['ótimo', 'ok']), 5)).texto).toContain('1 ponto de melhoria')
    expect(linhaAcimaDoPrompt(perfeita).tom).toBe('discreto')
    expect(linhaAcimaDoPrompt({ estado: 'avaliando', id: 't' })).toEqual({
      texto: 'Boletim: Jev avaliando o turno…',
      tom: 'discreto',
    })
    expect(linhaAcimaDoPrompt({ estado: 'fora', id: 't' })).toEqual({ texto: 'Boletim: Jev fora do ar', tom: 'aviso' })
  })

  test('o boletim mostra um estado vazio, a avaliação em andamento e o Jev fora', () => {
    const texto = (linhas: ReturnType<typeof montarBoletim>): string[] =>
      linhas.map(linha => linha.map(trecho => trecho.texto).join(''))

    expect(texto(montarBoletim(null, []))).toEqual(['Ainda não tem boletim. Ele aparece quando o turno terminar.'])
    expect(texto(montarBoletim({ estado: 'avaliando', id: 't' }, []))).toEqual(['Jev avaliando o turno…'])
    expect(texto(montarBoletim({ estado: 'fora', id: 't' }, [6]))).toEqual([
      'Jev fora do ar: o último turno ficou sem nota.',
      '',
      'Últimos turnos',
      '▅',
      '6,0',
    ])
  })
})

describe('/melhorar: regras no CLAUDE.md', () => {
  const A = REGRAS.prova
  const B = REGRAS.conferir

  test('cria a seção, e o arquivo, quando não existem', () => {
    const { conteudo, adicionadas } = incluirRegras('', [A, B])

    expect(conteudo).toBe(`## Regras do boletim\n\n- ${A}\n- ${B}\n`)
    expect(adicionadas).toEqual([A, B])
  })

  test('numa seção que já existe, entra no fim dela, antes do próximo ## ', () => {
    const antes = `# Projeto\n\n## Regras do boletim\n\n- ${A}\n\n### Detalhe\n\n- nota solta\n\n## Outra seção\n\ntexto\n`

    const { conteudo } = incluirRegras(antes, [B])

    expect(conteudo).toBe(
      `# Projeto\n\n## Regras do boletim\n\n- ${A}\n\n### Detalhe\n\n- nota solta\n- ${B}\n\n## Outra seção\n\ntexto\n`,
    )
  })

  test('sem a seção, acrescenta uma no fim do arquivo, com uma linha em branco antes', () => {
    const { conteudo } = incluirRegras('# Projeto\n\nTexto.\n\n\n', [A])

    expect(conteudo).toBe(`# Projeto\n\nTexto.\n\n## Regras do boletim\n\n- ${A}\n`)
  })

  test('não duplica: compara sem ligar para espaços e maiúsculas, em qualquer lugar do arquivo', () => {
    const arquivo = `# Projeto\n\nsempre:   ANTES DE DIZER QUE\nTERMINOU, rode os testes e diga o resultado.\n`

    const resultado = incluirRegras(arquivo, [A])

    expect(resultado.adicionadas).toEqual([])
    expect(resultado.jaExistiam).toEqual([A])
    expect(resultado.conteudo).toBe(arquivo)
  })

  test('só acrescenta as que faltam', () => {
    const arquivo = `## Regras do boletim\n\n- ${A}\n`

    const resultado = incluirRegras(arquivo, [A, B])

    expect(resultado.adicionadas).toEqual([B])
    expect(resultado.jaExistiam).toEqual([A])
    expect(resultado.conteudo).toBe(`## Regras do boletim\n\n- ${A}\n- ${B}\n`)
  })

  test('mantém CRLF quando o arquivo usa CRLF, sem deixar nenhuma quebra solta', () => {
    const arquivo = `# Projeto\r\n\r\n## Regras do boletim\r\n\r\n- ${A}\r\n\r\n## Outra\r\n\r\nx\r\n`

    const { conteudo } = incluirRegras(arquivo, [B])

    expect(conteudo).toBe(
      `# Projeto\r\n\r\n## Regras do boletim\r\n\r\n- ${A}\r\n- ${B}\r\n\r\n## Outra\r\n\r\nx\r\n`,
    )
    expect(conteudo.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/)
  })

  test('mantém CRLF também quando cria a seção e quando a seção é a última e o arquivo não termina em quebra', () => {
    expect(incluirRegras('# T\r\n\r\nx\r\n', [A]).conteudo).toBe(`# T\r\n\r\nx\r\n\r\n## Regras do boletim\r\n\r\n- ${A}\r\n`)
    expect(incluirRegras(`# T\r\n\r\n## Regras do boletim\r\n\r\n- ${A}`, [B]).conteudo).toBe(
      `# T\r\n\r\n## Regras do boletim\r\n\r\n- ${A}\r\n- ${B}\r\n`,
    )
  })

  test('seção vazia, ou colada no próximo título, também recebe as regras', () => {
    expect(incluirRegras('## Regras do boletim\n## Outra\n', [A]).conteudo).toBe(
      `## Regras do boletim\n\n- ${A}\n\n## Outra\n`,
    )
    expect(incluirRegras('## Regras do boletim\n\n\n## Outra\nx\n', [A]).conteudo).toBe(
      `## Regras do boletim\n\n- ${A}\n\n\n## Outra\nx\n`,
    )
  })

  test('reconhece o título da seção sem ligar para maiúsculas', () => {
    expect(incluirRegras(`## regras do BOLETIM\n\n- x\n`, [A]).conteudo).toBe(`## regras do BOLETIM\n\n- x\n- ${A}\n`)
  })

  test('a mesma regra duas vezes entra uma só', () => {
    expect(incluirRegras('', [A, ` ${A.toUpperCase()} `]).adicionadas).toEqual([A])
  })

  test('o texto de cada resposta do /melhorar', () => {
    expect(textoRegrasGravadas([A], [])).toBe(`Gravei no CLAUDE.md esta regra: ${A}`)
    expect(textoRegrasGravadas([A, B], [])).toBe(`Gravei no CLAUDE.md estas 2 regras:\n- ${A}\n- ${B}`)
    expect(textoRegrasGravadas([B], [A])).toBe(`Gravei no CLAUDE.md esta regra: ${B}\nA outra já estava no CLAUDE.md.`)
    expect(textoRegrasJaExistem([A, B])).toBe(`As regras "${A}", "${B}" já estão no CLAUDE.md. Nada mudou.`)
    expect(textoRegrasJaExistem([A])).toBe(`A regra "${A}" já está no CLAUDE.md. Nada mudou.`)
  })

  test('o plano depende do estado do último boletim', () => {
    expect(planejarMelhorar(null)).toEqual({ tipo: 'aviso', texto: 'Ainda não tem boletim de um turno pra usar.' })
    expect(planejarMelhorar({ estado: 'avaliando', id: 't' }).tipo).toBe('aviso')
    expect(planejarMelhorar({ estado: 'fora', id: 't' })).toEqual({
      tipo: 'aviso',
      texto: 'O último turno ficou sem boletim (Jev fora do ar). O CLAUDE.md ficou como estava.',
    })
    expect(planejarMelhorar(avaliacaoPronta('t', seis(['ótimo']), 1))).toEqual({
      tipo: 'aviso',
      texto: 'Nenhum ponto de melhoria no último turno (nota 10,0). O CLAUDE.md ficou como estava.',
    })
    expect(planejarMelhorar(avaliacaoPronta('t', seis(), 1))).toEqual({ tipo: 'regras', regras: ['regra de C2', 'regra de C1'] })
  })
})
