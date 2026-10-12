# Sentry Project

> 🇧🇷 Versão em português: [README.md](README.md)

Plan, integrate and inspect Sentry in any Git workspace with dependency-free Node API scripts. Compare shared, balanced and isolated project mappings, reuse existing projects and confirm event receipts without exposing credentials in agent conversations.

## Install

```bash
npx skills add maiquealmeida/skills --skill sentry-project
npx skills add maiquealmeida/skills --skill sentry-project -g -a claude-code
# From a local clone, before publishing:
npx skills add . --list
npx skills add . --skill sentry-project
```

Requires Git and Node.js 22+. Run scripts from the target repository or a subdirectory. `<skill-dir>` means the actual installed directory, quoted when it contains spaces; replace the placeholder before executing commands.

## Configure

Sources merge in this order, with later sources winning:

1. Workspace root `.env`.
2. Workspace root `.env.local`.
3. One agent JSON file's `env` object; defaults to `.claude/settings.local.json` when present.
4. Process environment, including empty strings to disable inherited credentials.

Set `SENTRY_AGENT_CONFIG_FILE` in the process or dotenv files to select a different JSON file. `sentry.mjs --config /path/settings.json` overrides that selector. Relative paths resolve from the Git root. Explicit missing/invalid files fail; global agent files are not searched automatically. Other agents can inject variables into the process, including from non-JSON configuration formats. The script itself only parses dotenv and JSON `env` objects.

| Variable | Purpose |
| --- | --- |
| `SENTRY_ORG_SLUG` | Required organization slug. |
| `SENTRY_ORG_TOKEN` | Organization token; preferred in auto mode. |
| `SENTRY_USER_TOKEN` | Alternative token; read fallback after 401/403. At least one token is needed for API access. |
| `SENTRY_ORG_ID` | Optional organization ID verification. |
| `SENTRY_AGENT_CONFIG_FILE` | Optional agent JSON path. |
| `SENTRY_PROJECT_SLUG` | Default project, overridden by `--project`. |
| `SENTRY_ENVIRONMENT` | Default environment, overridden by `--environment`; project-defined names are supported. |
| `SENTRY_SERVICE` | Default service for `env`, overridden by `--service`. |
| `SENTRY_RELEASE` | Default release, overridden by `--release`; no required prefix/SHA. |
| `SENTRY_SPAN_OP` | Operation selected by the optional span receipt helper. |
| `SENTRY_SPAN_NAMES` | Comma-separated span names selected by that helper. |

Example `.env.local` with placeholders:

```dotenv
SENTRY_ORG_SLUG=my-organization
SENTRY_ORG_TOKEN=replace-with-your-token
SENTRY_PROJECT_SLUG=my-app
SENTRY_ENVIRONMENT=development
SENTRY_SERVICE=api
SENTRY_RELEASE=my-app@1.2.0
```

Alternatively, merge an `env` object into `.claude/settings.local.json` while preserving other keys:

```json
{
  "env": {
    "SENTRY_ORG_SLUG": "my-organization",
    "SENTRY_ORG_TOKEN": "replace-with-your-token"
  }
}
```

The JSON shape supports [Claude Code environment settings](https://code.claude.com/docs/en/settings); the loader order above is this skill's own precedence, rather than a full implementation of Claude Code settings resolution. Files are reread on each invocation; inherited process values still win.

Keep credential files out of Git and restrict permissions (for example `0600` on macOS/Linux). The loader does not edit permissions or ignore rules. Never display secret file contents or copy administrative tokens into frontend code, application containers, plans or reports. API host is fixed to `https://sentry.io`, with redirects rejected; self-hosted requires a reviewed extension.

Environment, release and receipt tags accept identifiers up to 200 characters, starting with a letter/number and using letters, digits and `_.@+:/-`. Project slugs and services written by `env` use lowercase letters, digits, `_` and `-`.

## Use

Ask your agent:

```text
Use sentry-project to inventory this workspace and existing Sentry projects.
Compare economy, balanced and isolated mappings and prepare a reviewable plan.
```

```bash
node "<skill-dir>/scripts/sentry.mjs" inventory
node "<skill-dir>/scripts/sentry.mjs" inventory --config .agent/settings.local.json
node "<skill-dir>/scripts/sentry.mjs" project --project my-app
node "<skill-dir>/scripts/sentry.mjs" keys --project my-app
node "<skill-dir>/scripts/sentry.mjs" events --project my-app
node "<skill-dir>/scripts/sentry.mjs" event --project my-app --event-id 0123456789abcdef0123456789abcdef
node "<skill-dir>/scripts/sentry.mjs" apply --plan /path/plan.json
# Only after authorization:
node "<skill-dir>/scripts/sentry.mjs" apply --plan /path/plan.json --execute
node "<skill-dir>/scripts/sentry.mjs" env --project my-app \
  --file apps/web/.env.local --environment development --service api
```

`apply` preflights through GET requests in preview; POST/PUT require `--execute`. `env` previews unless `--execute` is supplied, preserves unrelated variables, rejects tracked/unsafe destinations and atomically saves DSN/environment/service/release with restricted permissions, adding a specific Git ignore rule when needed. Use `--prefix NEXT_PUBLIC_` or `WORKER_` only when the application reads those names. It never writes administrative credentials.

`--token auto|org|user` chooses credentials. Auto fallback only applies to reads after 401/403; mutations are not retried automatically. Receipts omit raw payloads, tokens and DSNs. Window queries with `events --start ISO --end ISO --environment NAME --release VERSION` are capped at one hour/two pages and deduplicate event IDs. Report pagination, ingestion, retention and quota limits even when the query returns no events.

The optional `incident-receipt.mjs START END [RELEASE] [PROJECT]` helper reads the span settings above and resolves project IDs by API. It queries existing spans/profile counts only and never enables profiling or tracing. See [command details](references/comandos.md#recibos-de-spans-e-perfis) (Portuguese).

The skill preserves original SDK error messages, types, stacks, causes and context, without custom transport filters. Sampling and activation follow operator authorization; telemetry failures must not interrupt processing. Installing the skill does not authorize remote changes, event ingestion, GPU processing, push or deployment.

## Validate

```bash
node --test "<skill-dir>/scripts/sentry.test.mjs" "<skill-dir>/scripts/incident-receipt.test.mjs"
```

Tests use fake credentials, mock APIs and disposable Git repositories. They do not send events or prove production delivery. See [SKILL.md](SKILL.md), [mapping scenarios](references/cenarios.md) and [integration guidance](references/implantacao.md).
