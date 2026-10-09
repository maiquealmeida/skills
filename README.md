# skills

> 🇺🇸 English version: [README_EN-us.md](README_EN-us.md)

## Por que o README.md padrão está em Português Brasileiro, e não em Inglês, que é o "Padrão de Mercado"?

Porque o mercado que se acostume. 😎

Fala sério: o "padrão de mercado" é um acordo de cavalheiros que ninguém assinou, e eu moro no Brasil, penso em português e xingo o compilador em português. Se uma skill de IA entende `"não use para tarefas triviais"` tão bem quanto `"do not use for trivial tasks"`, o seu navegador também dá conta de traduzir esta página. Quem quiser inglês tem o link logo acima, com todo o carinho do mundo.

Dito isso, vamos ao que interessa.

## O que é isso aqui?

Minha coleção pessoal de skills para Claude Code e outros agentes de código, instaláveis com o [skills CLI](https://github.com/vercel-labs/skills). É basicamente uma gaveta de instruções para convencer a IA a se comportar. Funciona na maior parte do tempo. Tem também uma gaveta de plugins do Claude Code, para quando convencer não basta e é preciso pôr código no meio do caminho.

## Instalação

```bash
# Ver as skills disponíveis (olhar não custa nada)
npx skills add maiquealmeida/skills --list

# Instalar uma skill
npx skills add maiquealmeida/skills --skill no-patience-dev-guidelines

# Instalar globalmente para o Claude Code
npx skills add maiquealmeida/skills --skill no-patience-dev-guidelines -g -a claude-code
```

Testando a partir de um clone local: `npx skills add . --list`.

## Skills

| Skill | Descrição |
| ----- | --------- |
| [`gut-bug-triage`](skills/gut-bug-triage/SKILL.md) | Classifica bugs e problemas pela matriz GUT, com critérios adaptados aos objetivos, requisitos e domínio do projeto, evidências, tratamento de incertezas e calculadora em Node puro. |
| [`statusline`](skills/statusline/SKILL.md) | Status line do Claude Code em Node puro: diretório, branch, modelo, barra de contexto, custo e cotas de 5h/7d. Para você descobrir o quanto gastou antes que a fatura te conte. |
| [`no-patience-dev-guidelines`](skills/no-patience-dev-guidelines/SKILL.md) | Diretrizes para agentes de código: respeitar o contexto do projeto, simplificar, fazer mudanças cirúrgicas, diagnosticar antes de corrigir, verificar o comportamento solicitado, revisar o próprio trabalho, preservar decisões e comunicar com origem, responsáveis, motivos e evidências. Ou: "para de inventar moda". |
| [`orca-layout`](skills/orca-layout/SKILL.md) | Abre no Orca um grid de terminais, um por projeto, a partir de um `.orca/layouts/<nome>.layout.json` e sobe tudo em modo dev (macOS, Linux e Windows, em Node puro). Repo sem layout? Ela analisa o código e sugere um. Para você parar de abrir quatro terminais na mão toda manhã. |

## Plugins

Plugins do Claude Code, instaláveis pelo marketplace deste repositório. A skill pede com educação; o plugin entra no caminho e faz.

```text
# Dentro do Claude Code
/plugin install boletim-do-claude --marketplace maiquealmeida/skills
```

Testando a partir de um clone local: `claude --plugin-dir plugins/boletim-do-claude`.

| Plugin | Descrição |
| ------ | --------- |
| [`boletim-do-claude`](plugins/boletim-do-claude/README.md) | Dá nota a cada resposta do Claude com o [Jev](https://docs.typesafe.ai) da TypeSafe (resumo, como conferir, prova, suposições, tamanho da mudança e próximo passo), mostra o boletim num painel e, com `/melhorar`, grava no `CLAUDE.md` as regras que faltaram. Para você descobrir que o Claude esqueceu de testar antes de o deploy te contar. |

## Adicionando uma skill

Veja o [AGENTS.md](AGENTS.md). Spoiler: é uma pasta com um `SKILL.md`. Não tem mágica, só YAML.

## Adicionando um plugin

Também no [AGENTS.md](AGENTS.md). Aqui tem um pouco mais de mágica: uma pasta com um `plugin.json`, um módulo de hooks e testes.

## Licença

MIT. Use, copie, quebre, conserte. Só não me culpe.
