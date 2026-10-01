# skills

> 🇺🇸 English version: [README_EN-us.md](README_EN-us.md)

## Por que o README.md padrão está em Português Brasileiro, e não em Inglês, que é o "Padrão de Mercado"?

Porque o mercado que se acostume. 😎

Fala sério: o "padrão de mercado" é um acordo de cavalheiros que ninguém assinou, e eu moro no Brasil, penso em português e xingo o compilador em português. Se uma skill de IA entende `"não use para tarefas triviais"` tão bem quanto `"do not use for trivial tasks"`, o seu navegador também dá conta de traduzir esta página. Quem quiser inglês tem o link logo acima, com todo o carinho do mundo.

Dito isso, vamos ao que interessa.

## O que é isso aqui?

Minha coleção pessoal de skills para Claude Code e outros agentes de código, instaláveis com o [skills CLI](https://github.com/vercel-labs/skills). É basicamente uma gaveta de instruções para convencer a IA a se comportar. Funciona na maior parte do tempo.

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
| [`statusline`](skills/statusline/SKILL.md) | Status line do Claude Code em Node puro: diretório, branch, modelo, barra de contexto, custo e cotas de 5h/7d. Para você descobrir o quanto gastou antes que a fatura te conte. |
| [`no-patience-dev-guidelines`](skills/no-patience-dev-guidelines/SKILL.md) | Diretrizes de comportamento para reduzir os erros clássicos de LLM em código: pensar antes de codar, simplicidade, mudanças cirúrgicas e execução orientada a objetivos. Ou: "para de inventar moda". |

## Adicionando uma skill

Veja o [AGENTS.md](AGENTS.md). Spoiler: é uma pasta com um `SKILL.md`. Não tem mágica, só YAML.

## Licença

MIT. Use, copie, quebre, conserte. Só não me culpe.
