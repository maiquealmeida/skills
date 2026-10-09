// Só o que toca no motor: eventos, estado, arquivos, rede, tela e comandos.
// Cálculo, texto e CLAUDE.md ficam em ./jev, puros.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, ResolveInput } from 'claude-code'

import type { Avaliacao } from '../types'
import {
  acrescentarNota,
  aplicarRegistro,
  avaliacaoPronta,
  esconder,
  incluirRegras,
  iniciarTurno,
  lerChave,
  lerRespostas,
  linhaAcimaDoPrompt,
  linhaDeConversa,
  montarBoletim,
  montarRequisicao,
  NOME_DA_CHAVE,
  notasValidas,
  parseCriterios,
  planejarMelhorar,
  registroDaFerramenta,
  textoRegrasGravadas,
  textoRegrasJaExistem,
  TURNO_VAZIO,
  URL_DO_JEV,
} from './jev'
import type { Linha, Retrato, TomDaLinha, Trecho } from './jev'

const ID_DO_PAINEL = 'boletim-do-claude'
const TITULO_DO_PAINEL = 'Boletim do Claude'
const ARQUIVO_DE_CHAVES = '.env.local'
const ARQUIVO_DE_REGRAS = 'CLAUDE.md'
const ARQUIVO_DE_CRITERIOS = 'criterios.json'
const CHAVE_DO_HISTORICO = 'historico'
const MAX_CORPO_NO_LOG = 300

const turno = atom({ plugin: 'boletim-do-claude', key: 'turno' } as const, TURNO_VAZIO)
const avaliacao = atom({ plugin: 'boletim-do-claude', key: 'avaliacao' } as const, null)
const historico = atom({ plugin: 'boletim-do-claude', key: 'historico' } as const, [])
const onde = atom({ plugin: 'boletim-do-claude', key: 'onde' } as const, null)

const barras = (caminho: string): string => caminho.replace(/\\/g, '/')

const mensagemDe = (erro: unknown): string => (erro instanceof Error ? erro.message : String(erro))

/** Detalhe de erro: só vai para o log de debug, e sem a chave. */
function depurar($: EngineInterface, texto: string, chave?: string): void {
  $.ui.log(esconder(texto, chave), { to: 'debug' })
}

/** Roda a tarefa e engole o erro (com registro no debug): o boletim só observa, nunca atrapalha. */
async function protegido($: EngineInterface, contexto: string, tarefa: () => Promise<unknown>): Promise<void> {
  try {
    await tarefa()
  } catch (erro) {
    depurar($, `${contexto}: ${mensagemDe(erro)}`)
  }
}

/** Abre o painel e anota onde o boletim vai aparecer. Sem espaço, ele espera aberto e a faixa assume. */
async function abrirPainel($: EngineInterface): Promise<boolean> {
  const { isPlaced } = await $.ui.open({ id: ID_DO_PAINEL, title: TITULO_DO_PAINEL })
  await update($, onde, () => (isPlaced ? 'painel' : 'faixa'))
  return isPlaced
}

// ── Avaliação ───────────────────────────────────────────────────────────────

/** A pasta home de quem roda o Claude: HOME, ou USERPROFILE onde não há HOME (Windows). Vazio conta como ausente. */
async function pastaHome($: EngineInterface): Promise<string> {
  const home = (await $.env.get('HOME')) || (await $.env.get('USERPROFILE'))
  if (!home) throw new Error('HOME e USERPROFILE não estão definidos')
  return barras(home)
}

/** A chave fica no ~/.env.local, para valer em qualquer projeto; é lida de novo a cada avaliação. */
async function lerChaveDaHome($: EngineInterface): Promise<string | undefined> {
  try {
    const caminho = `${await pastaHome($)}/${ARQUIVO_DE_CHAVES}`
    const chave = lerChave(await $.fs.read(caminho))
    if (chave === undefined) throw new Error(`${NOME_DA_CHAVE} não está em ${caminho}`)
    return chave
  } catch (erro) {
    depurar($, `Jev sem chave: ${mensagemDe(erro)}`)
    return undefined
  }
}

async function consultarJev($: EngineInterface, retrato: Retrato, id: string, chave: string): Promise<Avaliacao> {
  try {
    const criterios = parseCriterios(await $.fs.read(`${barras($.plugin.root)}/${ARQUIVO_DE_CRITERIOS}`))
    const inicio = await $.clock.now()
    const resposta = await $.http.fetch(URL_DO_JEV, {
      method: 'POST',
      headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(montarRequisicao(retrato, criterios)),
    })
    const ms = (await $.clock.now()) - inicio
    // Esconde a chave antes de qualquer corte: cortado no meio dela, o pedaço que sobra não casaria.
    const corpo = esconder(resposta.text, chave)
    if (!resposta.ok) {
      throw new Error(`HTTP ${resposta.status}: ${corpo.slice(0, MAX_CORPO_NO_LOG)}`)
    }
    return avaliacaoPronta(id, lerRespostas(corpo, criterios), ms)
  } catch (erro) {
    depurar($, `Jev fora do ar: ${mensagemDe(erro)}`, chave)
    return { estado: 'fora', id }
  }
}

async function guardarNota($: EngineInterface, nota: number): Promise<void> {
  const notas = await update($, historico, antes => acrescentarNota(antes, nota))
  await $.store.set(CHAVE_DO_HISTORICO, notas)
}

/** Grava o resultado, avisa na conversa e põe a nota no histórico. */
async function concluir($: EngineInterface, id: string, final: Avaliacao): Promise<void> {
  // Se um turno mais novo já começou a ser avaliado, o resultado deste não toma o lugar dele.
  await protegido($, 'avaliação', () =>
    update($, avaliacao, atual => (atual !== null && atual.id !== id ? atual : final)),
  )
  $.ui.log(linhaDeConversa(final))
  if (final.estado === 'ok') {
    await protegido($, 'histórico', () => guardarNota($, final.nota))
  }
}

async function avaliar($: EngineInterface, retrato: Retrato, id: string): Promise<void> {
  const chave = await lerChaveDaHome($)
  const final: Avaliacao =
    chave === undefined ? { estado: 'fora', id } : await consultarJev($, retrato, id, chave)
  await concluir($, id, final)
}

// ── Comandos ────────────────────────────────────────────────────────────────

async function recuperarHistorico($: EngineInterface): Promise<void> {
  if ((await read($, historico)).length > 0) return
  const notas = notasValidas(await $.store.get(CHAVE_DO_HISTORICO))
  if (notas.length > 0) await update($, historico, () => notas)
}

/** Recarregar o mod derruba a avaliação que estava em andamento: ela não vai mais terminar. */
async function limparAvaliacaoPerdida($: EngineInterface): Promise<void> {
  await update($, avaliacao, atual => (atual?.estado === 'avaliando' ? null : atual))
}

async function gravarRegras($: EngineInterface): Promise<string> {
  const plano = planejarMelhorar(await read($, avaliacao))
  if (plano.tipo === 'aviso') return plano.texto
  try {
    const caminho = `${barras(await $.session.root())}/${ARQUIVO_DE_REGRAS}`
    const conteudo = (await $.fs.exists(caminho)) ? await $.fs.read(caminho) : ''
    const incluidas = incluirRegras(conteudo, plano.regras)
    if (incluidas.adicionadas.length === 0) return textoRegrasJaExistem(plano.regras)
    await $.fs.write(caminho, incluidas.conteudo)
    return textoRegrasGravadas(incluidas.adicionadas, incluidas.jaExistiam)
  } catch (erro) {
    depurar($, `/melhorar: ${mensagemDe(erro)}`)
    return 'Não consegui gravar no CLAUDE.md (detalhe no log de debug).'
  }
}

async function abrirBoletim($: EngineInterface): Promise<string> {
  try {
    const isPlaced = await abrirPainel($)
    return isPlaced
      ? 'Boletim do Claude aberto ao lado da conversa.'
      : 'Sem espaço pro painel: o boletim aparece acima do prompt.'
  } catch (erro) {
    depurar($, `/boletim: ${mensagemDe(erro)}`)
    return 'Não consegui abrir o painel do boletim (detalhe no log de debug).'
  }
}

// ── Desenho ─────────────────────────────────────────────────────────────────

function estiloDoTrecho(trecho: Trecho) {
  return {
    ...(trecho.negrito ? { bold: true } : {}),
    ...(trecho.cor === undefined ? {} : { color: trecho.cor }),
    ...(trecho.discreto ? { dimColor: true } : {}),
  }
}

function estiloDaLinha(tom: TomDaLinha) {
  if (tom === 'discreto') return { dimColor: true }
  if (tom === 'aviso') return { color: 'yellow' }
  return {}
}

/** Uma linha do boletim vira um Text; os trechos com estilo viram Texts dentro dele. */
function desenharLinhas($: EngineInterface, e: ResolveInput, linhas: readonly Linha[]) {
  const { Text } = $.ui.resolve(e)
  return linhas.map(linha => (
    <Text>
      {linha.length === 0
        ? ' '
        : linha.map(trecho => {
            const estilo = estiloDoTrecho(trecho)
            return Object.keys(estilo).length === 0 ? trecho.texto : <Text {...estilo}>{trecho.texto}</Text>
          })}
    </Text>
  ))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await protegido($, 'comando /boletim', () =>
      $.command.register({ name: 'boletim', description: 'Abre o boletim do Claude: a nota do último turno' }),
    )
    await protegido($, 'comando /melhorar', () =>
      $.command.register({
        name: 'melhorar',
        description: 'Grava no CLAUDE.md as regras sugeridas pelo último boletim',
      }),
    )
    await protegido($, 'histórico', () => recuperarHistorico($))
    await protegido($, 'avaliação perdida', () => limparAvaliacaoPerdida($))
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const entrou = await next(e)
    if (entrou.drop === undefined) {
      await protegido($, 'painel', () => abrirPainel($))
    }
    return entrou
  })

  on('turn.start', async ($, e, next) => {
    const comecou = await next(e)
    await protegido($, 'turno', () => update($, turno, antes => iniciarTurno(antes, e.text)))
    return comecou
  })

  // Só observa: a ferramenta roda do jeito que o modelo pediu e o resultado volta intacto.
  on('tool.call', async ($, e, next) => {
    const rodou = await next(e)
    const ok = rodou.deny === undefined && rodou.isError !== true
    await protegido($, 'ferramenta', async () => {
      const registro = registroDaFerramenta(String(e.tool), e, ok)
      if (registro !== null) await update($, turno, atual => aplicarRegistro(atual, registro))
    })
    return rodou
  })

  on('turn.complete', async ($, e, next) => {
    const completou = await next(e)
    if (e.agentId !== undefined || e.reason !== 'answer') return completou
    await protegido($, 'boletim', async () => {
      const atual = await read($, turno)
      const retrato: Retrato = {
        pedido: atual.pedido,
        arquivos: atual.arquivos,
        comandos: atual.comandos,
        resposta: e.answer,
      }
      await update($, avaliacao, () => ({ estado: 'avaliando', id: e.turnId }))
      await protegido($, 'painel', () => abrirPainel($))
      // Fora do fim do turno: a avaliação corre sozinha e não segura nada.
      $.clock.after(0, () => {
        avaliar($, retrato, e.turnId).catch(erro => depurar($, `avaliação: ${mensagemDe(erro)}`))
      })
    })
    return completou
  })

  // O mod nunca fecha o painel, então um fechamento é sempre da pessoa: sem painel e sem faixa
  // até o próximo turno, que abre de novo.
  on('ui.close', { id: ID_DO_PAINEL }, async ($, e, next) => {
    const fechou = await next(e)
    await protegido($, 'painel fechado', () => update($, onde, () => null))
    return fechou
  })

  on('ui.render', { component: 'Pane', requestId: ID_DO_PAINEL }, async ($, e) => {
    const { Box } = $.ui.resolve(e)
    const linhas = montarBoletim(await read($, avaliacao), await read($, historico))
    return <Box flexDirection="column">{desenharLinhas($, e, linhas)}</Box>
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const base = await next(e)
    const atual = await read($, avaliacao)
    if (e.props.hasSurvey || atual === null) return base

    const { Box, Text } = $.ui.resolve(e)
    const linha = linhaAcimaDoPrompt(atual)
    const isFaixa = atual.estado === 'ok' && (await read($, onde)) === 'faixa'
    const notas = await read($, historico)
    return (
      <Box flexDirection="column">
        {base}
        {isFaixa && (
          <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
            {desenharLinhas($, e, montarBoletim(atual, notas))}
          </Box>
        )}
        <Text {...estiloDaLinha(linha.tom)}>{linha.texto}</Text>
      </Box>
    )
  })

  on('command.run', { command: 'boletim' }, async $ => ({ text: await abrirBoletim($) }))

  on('command.run', { command: 'melhorar' }, async $ => ({ text: await gravarRegras($) }))
}
