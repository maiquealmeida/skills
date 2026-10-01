# AGENTS.md

Guidance for AI coding agents working in this repository.

## Repository Overview

A collection of agent skills, distributed with the [skills CLI](https://github.com/vercel-labs/skills) (`npx skills add`).

## Creating a New Skill

```
skills/
  {skill-name}/           # kebab-case directory name
    SKILL.md              # Required: skill definition
    scripts/              # Optional: executable scripts
    references/           # Optional: supporting docs loaded on demand
```

### Conventions

- Skill directory: `kebab-case`, and it must match the `name` in the frontmatter.
- `SKILL.md`: always uppercase, exact filename.
- Required frontmatter: `name` and `description`. The description says what the skill does and when to use it, including trigger phrases.
- Optional `metadata.internal: true` hides a skill from discovery (visible only with `INSTALL_INTERNAL_SKILLS=1`).
- Keep `SKILL.md` concise; move detail into `references/` and load it on demand.

### Checklist

1. Create `skills/{skill-name}/SKILL.md`.
2. Add the skill to the table in both `README.md` (pt-BR) and `README_EN-us.md`.
3. Verify discovery: `npx skills add . --list`.
