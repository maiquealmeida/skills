# No Patience Dev Guidelines

> 🇺🇸 English version: [README_EN-us.md](README_EN-us.md)

Diretrizes para agentes de código que reduzem o trabalho de supervisão, correção e revisão imposto ao desenvolvedor. Para quando você quer resolver um problema e o agente entrega uma abstração nova, três remendos e um “está tudo funcionando” sem explicar o que verificou.

## Quando usar

Use em implementação, depuração, revisão e refatoração, incluindo os planos, atualizações e relatórios dessas tarefas. A skill orienta o agente a entender o contexto do projeto, respeitar o escopo e comprovar o comportamento solicitado.

A profundidade da investigação e das verificações deve acompanhar a complexidade da mudança. Uma edição trivial não precisa virar um processo elaborado.

## Instalação

```bash
# Instalar no projeto
npx skills add maiquealmeida/skills --skill no-patience-dev-guidelines

# Instalar globalmente para o Claude Code
npx skills add maiquealmeida/skills --skill no-patience-dev-guidelines -g -a claude-code
```

Para listar as skills a partir da raiz de um clone local:

```bash
npx skills add . --list
```

## Como pedir

Exemplo de solicitação ao agente:

```text
Use a skill no-patience-dev-guidelines para corrigir este bug.
Investigue a causa, preserve as alterações existentes e verifique
o comportamento afetado. Ao concluir, explique o que mudou,
por que mudou, quais verificações executou e o que permanece pendente.
```

## Os sete princípios

| Princípio | Comportamento esperado |
| --- | --- |
| Pensar antes de codar | Ler a implementação, seus consumidores e as convenções; investigar antes de perguntar; confirmar APIs e versões. |
| Simplicidade primeiro | Reutilizar mecanismos existentes e evitar funcionalidades, dependências e abstrações especulativas. |
| Mudanças cirúrgicas | Respeitar o escopo, preservar trabalho alheio e revisar o próprio diff antes da entrega. |
| Execução orientada a objetivos | Definir sucesso, verificar o comportamento solicitado e preservar os critérios de teste. |
| Nunca fazer afirmações vagas | Identificar assunto, escopo, origem, evidências e motivos; para ações, também responsáveis, responsabilidades e resultados. |
| Diagnosticar antes de corrigir | Testar hipóteses, aprender com tentativas malsucedidas e evitar remendos ou repetições sem nova evidência. |
| Preservar decisões e continuidade | Retomar do estado real do projeto, mantendo objetivo, correções do usuário, decisões e autorizações. |

## Comunicação que dá para conferir

A regra contra afirmações vagas vale para qualquer assunto do projeto: código, arquitetura, configuração, decisões, defeitos, testes, dados e entregas.

**Vago:** “Os testes passaram e o problema foi resolvido.”

**Exemplo ilustrativo, válido somente se houver evidência:** “Executei `npm test -- tests/cart.test.ts`. Os oito testes passaram, incluindo o caso que reproduzia a cobrança duplicada. A mudança em `src/cart.ts` impede adicionar o mesmo item duas vezes. O fluxo de checkout no navegador ainda não foi verificado.”

Se uma informação não puder ser confirmada, o agente deve dizer exatamente o que sabe e o que falta verificar. Não pode inventar detalhes, tratar hipótese como causa comprovada ou chamar trabalho parcial de concluído.

## Definição e fundamentação

- [SKILL.md](SKILL.md): instruções que o agente deve seguir; fonte principal das regras e da versão atual.
- [Pesquisa e referências](references/research.md): estudos, relatos de engenharia, artigos e vídeos que fundamentam as extensões, com seus limites de interpretação. O documento está em inglês.

As diretrizes partem das Karpathy Guidelines e incluem extensões informadas pela pesquisa. Elas orientam o comportamento do agente; sua eficácia depende também do contexto, das ferramentas e das verificações disponíveis no projeto.
