# skills

> 🇧🇷 Versão em português: [README.md](README.md)

Personal collection of agent skills, installable with the [skills CLI](https://github.com/vercel-labs/skills). It also holds Claude Code plugins, installable through this repository's marketplace.

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
| [`no-patience-dev-guidelines`](skills/no-patience-dev-guidelines/SKILL.md) | Guidelines for coding agents: respect project context, simplify, make surgical changes, diagnose before patching, verify requested behavior, review your own work, preserve decisions, and report with sources, responsible actors, reasons, and evidence. |
| [`orca-layout`](skills/orca-layout/SKILL.md) | Opens a grid of Orca terminal panes, one per project, from a per-repo `.orca/layouts/<name>.layout.json` and starts everything in dev mode (macOS, Linux and Windows, plain Node). No layout yet? It analyzes the repo and proposes one. |

## Plugins

Claude Code plugins, installable through this repository's marketplace.

```text
# Inside Claude Code
/plugin install boletim-do-claude --marketplace maiquealmeida/skills
```

Local testing from a clone: `claude --plugin-dir plugins/boletim-do-claude`.

| Plugin | Description |
| ------ | ----------- |
| [`boletim-do-claude`](plugins/boletim-do-claude/README_EN-us.md) | Grades every Claude answer with TypeSafe's [Jev](https://docs.typesafe.ai) (summary, how to check, proof, assumptions, change size and next step), shows the report in a panel and, with `/melhorar`, writes the missing rules to your `CLAUDE.md`. |

## Adding a skill

See [AGENTS.md](AGENTS.md).

## Adding a plugin

See [AGENTS.md](AGENTS.md).

## License

MIT
