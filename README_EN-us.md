# skills

> 🇧🇷 Versão em português: [README.md](README.md)

Personal collection of agent skills, installable with the [skills CLI](https://github.com/vercel-labs/skills).

## Install

```bash
# List available skills
npx skills add maiquealmeida/skills --list

# Install one skill
npx skills add maiquealmeida/skills --skill no-patience-dev-guidelines

# Install globally for Claude Code
npx skills add maiquealmeida/skills --skill no-patience-dev-guidelines -g -a claude-code
```

Local testing from a clone: `npx skills add . --list`.

## Skills

| Skill | Description |
| ----- | ----------- |
| [`statusline`](skills/statusline/SKILL.md) | Custom Claude Code status line in plain Node: directory, branch, model, context bar, cost and 5h/7d quotas. |
| [`no-patience-dev-guidelines`](skills/no-patience-dev-guidelines/SKILL.md) | Behavioral guidelines to reduce common LLM coding mistakes: think before coding, simplicity, surgical changes, goal-driven execution. |

## Adding a skill

See [AGENTS.md](AGENTS.md).

## License

MIT
