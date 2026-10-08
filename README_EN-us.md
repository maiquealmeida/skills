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
| [`gut-bug-triage`](skills/gut-bug-triage/SKILL.md) | Classifies bugs and software problems using GUT, with criteria calibrated to project goals, requirements and domain, evidence, uncertainty handling and a dependency-free Node calculator. |
| [`statusline`](skills/statusline/SKILL.md) | Custom Claude Code status line in plain Node: directory, branch, model, context bar, cost and 5h/7d quotas. |
| [`no-patience-dev-guidelines`](skills/no-patience-dev-guidelines/SKILL.md) | Behavioral guidelines to reduce common LLM coding mistakes: think before coding, simplicity, surgical changes, goal-driven execution, and clear reporting with sources, responsible actors, reasons, and evidence. |
| [`orca-layout`](skills/orca-layout/SKILL.md) | Opens a grid of Orca terminal panes, one per project, from a per-repo `.orca/layouts/<name>.layout.json` and starts everything in dev mode (macOS, Linux and Windows, plain Node). No layout yet? It analyzes the repo and proposes one. |

## Adding a skill

See [AGENTS.md](AGENTS.md).

## License

MIT
