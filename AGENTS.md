# AGENTS.md

Guidance for AI coding agents working in this repository.

## Repository Overview

A collection of agent skills, distributed with the [skills CLI](https://github.com/vercel-labs/skills) (`npx skills add`), and of Claude Code plugins, distributed through the marketplace in `.claude-plugin/marketplace.json` (`/plugin install {plugin-name} --marketplace maiquealmeida/skills`).

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

## Creating a New Plugin

Claude Code plugins live beside the skills, one folder each, and are listed in the root `.claude-plugin/marketplace.json`. They are not skills: `npx skills add . --list` must keep listing only the skills.

```
plugins/
  {plugin-name}/              # kebab-case directory name, same as `name` in plugin.json
    .claude-plugin/
      plugin.json             # Required: name, version, description, author, license, repository; "types" when it keeps $.state
    hooks/
      hooks.json              # Required: { "modules": ["./register.tsx"] }
      register.tsx            # Everything that touches the engine
      *.ts                    # Pure logic imported by register.tsx
    types/index.d.ts          # $.state contract (PluginState), when the plugin keeps state
    tests/                    # *.test.ts, run by `claude plugin test`; helpers are plain *.ts
    tsconfig.json             # { "extends": "./.claude-plugin/types/tsconfig.json" }
    README.md                 # pt-BR; README_EN-us.md is the English version
```

### Conventions

- Plugin directory: `kebab-case`, and it must match the `name` in `plugin.json` and in the marketplace entry.
- `.claude-plugin/types/` is written by Claude Code when it loads the plugin from a folder (`claude --plugin-dir plugins/{plugin-name}`). It is generated and git-ignored; never commit it.
- Keep user-editable data (for example `criterios.json`) in the plugin root, and say in the README that a marketplace install runs from a copy.
- Never commit secrets. Tests use fake keys.
- The plugin API is early access and moves between Claude Code releases; the README states the version it was tested on.

### Checklist

1. Create `plugins/{plugin-name}/` with the layout above.
2. Add an entry to `.claude-plugin/marketplace.json` with `"source": "./plugins/{plugin-name}"`.
3. Add the plugin to the table in both `README.md` (pt-BR) and `README_EN-us.md`, and write the plugin's own README.
4. Verify: `claude plugin validate .` (marketplace), `claude plugin validate plugins/{plugin-name}` and `claude plugin test plugins/{plugin-name}`.
5. Verify discovery of the skills is unchanged: `npx skills add . --list`.
