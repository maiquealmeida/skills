# boletim-do-claude

> 🇺🇸 English version: [README_EN-us.md](README_EN-us.md)

Plugin do Claude Code que dá nota a cada resposta do Claude e sugere regras para o `CLAUDE.md`. Quem corrige a prova é o [Jev](https://docs.typesafe.ai), o modelo da TypeSafe. Para você descobrir que o Claude esqueceu de rodar os testes antes de o deploy te contar.

## O que ele faz

Quando um turno do Claude termina, o plugin manda para o Jev o pedido, os arquivos mexidos, os comandos rodados e a resposta final. O Jev avalia cada critério do [`criterios.json`](criterios.json) em três degraus (fraco, ok, ótimo). Os seis critérios que vêm de fábrica:

| Critério | Pergunta |
| --- | --- |
| Resumo final | Disse o que mudou e em quais arquivos? |
| Como conferir | Disse qual página abrir e o que clicar? |
| Prova | Rodou testes ou abriu a página e disse o resultado? |
| Suposições | Avisou o que decidiu sozinho? |
| Tamanho da mudança | Mexeu só no que o pedido exigia? |
| Próximo passo | Sugeriu um próximo passo concreto? |

A nota do turno é a média (ótimo 10, ok 6, fraco 2). Os dois critérios mais fracos viram pontos de melhoria, cada um com uma regra sugerida. O plugin só observa: nunca segura nem altera uma ferramenta.

Onde o boletim aparece:

- uma linha na conversa, como `Boletim: nota 7,3 · melhorar: Prova (fraco), Como conferir (ok)`;
- uma linha acima do prompt;
- o painel **Boletim do Claude** ao lado da conversa, com um quadro por critério e o gráfico dos últimos turnos;
- quando não há espaço para o painel, o boletim inteiro numa caixa de borda ciano acima do prompt.

| Comando | O que faz |
| --- | --- |
| `/boletim` | Abre o painel com o boletim do último turno. |
| `/melhorar` | Grava no `CLAUDE.md` da raiz as regras dos pontos de melhoria, na seção `## Regras do boletim`, sem duplicar. |

## Requisitos

- **Claude Code** com a API de mods. Testado na 2.1.295; essa API é de acesso antecipado e pode mudar entre versões.
- **Chave da TypeSafe** em `~/.env.local` (na sua home), lida a cada avaliação:

  ```bash
  TYPESAFE_API_KEY=sua-chave
  ```

  Aceita `export`, aspas e comentário no fim da linha. A chave nunca aparece na tela, nem em mensagem de erro.

## Instalação

```text
/plugin install boletim-do-claude --marketplace maiquealmeida/skills
```

De um clone local, para testar ou editar (vale só para aquela sessão):

```bash
claude --plugin-dir plugins/boletim-do-claude
```

## Editando os critérios

O [`criterios.json`](criterios.json) fica na raiz do plugin e é lido de novo a cada turno. Cada critério tem `nome`, `pergunta`, `regra` e, se quiser, `degraus` com o que é fraco, ok e ótimo. Um critério sem nome, pergunta ou regra é ignorado, e uma lista vazia deixa o turno sem nota. O campo `_como_editar` explica cada campo dentro do próprio arquivo.

Instalado pelo marketplace, o plugin roda de uma cópia. Uma atualização pode sobrescrever o `criterios.json` dessa cópia. Para critérios só seus, use o clone com `--plugin-dir`.

## Privacidade e falhas

A cada turno principal, o plugin envia para `api.typesafe.ai` o pedido (até 2000 caracteres), os arquivos mexidos (até 50), os últimos 30 comandos (cada um cortado em 300 caracteres) e o fim da resposta (até 8000 caracteres). Se algum projeto não pode sair da máquina, não carregue o plugin nele.

Sem chave, sem rede, resposta fora do formato ou `criterios.json` quebrado, o turno fica sem nota (`Boletim: Jev fora do ar, turno sem nota`). O motivo vai só para o log de debug (`claude --debug`).

## Desenvolvimento

```bash
claude plugin validate plugins/boletim-do-claude
claude plugin test plugins/boletim-do-claude
```

Com o plugin carregado de uma pasta (`--plugin-dir`), o Claude Code grava `.claude-plugin/types/` e o `tsc -p plugins/boletim-do-claude` passa a funcionar. Essa pasta é gerada e fica fora do git. O `validate` avisa que o nome "parece um nome da Anthropic" (por causa do "claude"); o nome foi mantido de propósito.

| Caminho | Papel |
| --- | --- |
| `hooks/register.tsx` | Tudo o que toca no motor: eventos, estado, arquivos, rede, tela e comandos. |
| `hooks/jev.ts` | Lógica pura: requisição ao Jev, notas, gráfico, textos do boletim e edição do `CLAUDE.md`. |
| `types/index.d.ts` | Contrato do `$.state` (turno, avaliação, histórico e onde o boletim aparece). |
| `criterios.json` | Critérios editáveis, com os degraus de cada um. |
| `tests/` | Motor falso (Jev, arquivos, store, relógio, painel) e os testes do plugin. |
