# Plugins

Plugins do Claude Code deste repositório. A skill pede com educação; o plugin entra no caminho e faz. Cada pasta aqui é um plugin, listado no marketplace [`.claude-plugin/marketplace.json`](../.claude-plugin/marketplace.json).

Isto não é skill. `npx skills add . --list` continua listando só o que está em [`skills/`](../skills/).

O catálogo geral do repositório está no [README da raiz](../README.md).

## Instalação

```text
# Dentro do Claude Code
/plugin install boletim-do-claude --marketplace maiquealmeida/skills
```

De um clone local, para testar ou editar (vale só para aquela sessão):

```bash
claude --plugin-dir plugins/boletim-do-claude
```

## Plugins

| Plugin | Descrição |
| ------ | --------- |
| [`boletim-do-claude`](boletim-do-claude/README.md) | Dá nota a cada resposta do Claude com o [Jev](https://docs.typesafe.ai) da TypeSafe (resumo, como conferir, prova, suposições, tamanho da mudança e próximo passo), mostra o boletim num painel e, com `/melhorar`, grava no `CLAUDE.md` as regras que faltaram. Para você descobrir que o Claude esqueceu de testar antes de o deploy te contar. |

## Adicionando um plugin

O formato, as convenções e o checklist estão no [AGENTS.md](../AGENTS.md). Em resumo: uma pasta em `kebab-case`, um `plugin.json`, um módulo de hooks, testes, uma entrada no marketplace e uma linha na tabela acima e nos READMEs da raiz.
