// Montar a faixa acima do prompt e o painel, e ler o que o mod desenhou neles.

import type { RenderSurface } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import { PLUGIN } from './motor'

const ROLAGEM = { offset: 0, bodyRows: 40 }

export type No = string | { type: string; props?: Record<string, unknown>; children?: readonly No[] }

export function montarFaixa(
  $: Engine,
  opcoes: { hasSurvey?: boolean } = {},
  superficie: Extract<RenderSurface, 'terminal' | 'desktop'> = 'terminal',
) {
  return $.ui.mount({
    plugin: PLUGIN,
    surface: superficie,
    component: 'AbovePrompt',
    props: {
      hasSurvey: opcoes.hasSurvey ?? false,
      isWorking: false,
      maxRows: 30,
      bodyColumns: 100,
      scroll: ROLAGEM,
      view: {},
    },
  })
}

export function montarPainel($: Engine, superficie: RenderSurface = 'terminal') {
  return $.ui.mount({
    plugin: PLUGIN,
    surface: superficie,
    component: 'Pane',
    requestId: PLUGIN,
    props: {
      title: 'Boletim do Claude',
      isFocused: false,
      bodyColumns: 80,
      placement: 'dock',
      scroll: ROLAGEM,
      view: {},
    },
  })
}

/** O texto que um nó mostra, com o dos filhos junto. */
export function textoCompleto(no: No): string {
  if (typeof no === 'string') return no
  return (no.children ?? []).map(textoCompleto).join('')
}

/** Uma entrada por Text de fora (os de dentro de outro Text já vêm no texto dele). */
export function linhasDe(no: No): string[] {
  if (typeof no === 'string') return [no]
  if (no.type === 'Text') return [textoCompleto(no)]
  return (no.children ?? []).flatMap(linhasDe)
}

/** Todos os elementos da árvore, de cima para baixo. */
export function elementos(no: No): Exclude<No, string>[] {
  if (typeof no === 'string') return []
  return [no, ...(no.children ?? []).flatMap(elementos)]
}

/** Os Text cujo único conteúdo é exatamente `texto`: é onde o estilo do degrau fica. */
export function textosEstilizados(no: No, texto: string): Exclude<No, string>[] {
  return elementos(no).filter(
    elemento => elemento.type === 'Text' && elemento.children?.length === 1 && elemento.children[0] === texto,
  )
}

export async function linhasDaFaixa($: Engine): Promise<string[]> {
  const faixa = await montarFaixa($)
  const linhas = linhasDe((await faixa.drawn()) as unknown as No)
  await faixa.unmount()
  return linhas
}

export async function linhasDoPainel($: Engine): Promise<string[]> {
  const painel = await montarPainel($)
  const linhas = linhasDe((await painel.drawn()) as unknown as No)
  await painel.unmount()
  return linhas
}
