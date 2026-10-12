---
name: sentry-project
description: Plan, integrate and inspect Sentry in a Git workspace using credential-safe Node API scripts and economy, balanced or isolated project mappings. Use when asked to "configure Sentry", "integrate Sentry", "confirm an event was received", "configurar Sentry" or "implantar Sentry no projeto".
metadata:
  version: '1.0.0'
---

# Sentry Project

Run from the target Git workspace, independently of where this skill is installed. Requires Git and Node.js 22+. `<skill-dir>` means the installed directory containing this file; replace it with the actual path, quoted when it contains spaces.

Use the bundled scripts for API access: they load credentials without printing them. Do not read secret file contents into agent context or put administrative tokens in code, browsers, application containers, plans or reports. API receipts omit raw event payloads; this does not filter events sent by application SDKs.

## Configuration

Read [README.md](README.md#configuração) for configuration options. The loader reads the workspace root `.env`, then `.env.local`, then one agent JSON file's `env` object, then process variables (highest priority, including empty strings).

The JSON default is `.claude/settings.local.json` when present. Select another agent's JSON file with `SENTRY_AGENT_CONFIG_FILE` or `--config /path/settings.json`. Explicit paths must exist; relative paths resolve from the workspace root. Other agents can also inject environment variables directly; no particular agent is required.

Required: `SENTRY_ORG_SLUG` and at least one of `SENTRY_ORG_TOKEN` / `SENTRY_USER_TOKEN`. Optional organization ID, project, environment, service and release are documented in the README. Host is fixed to Sentry SaaS (`https://sentry.io`); self-hosted requires a reviewed script extension.

```bash
node "<skill-dir>/scripts/sentry.mjs" inventory
node "<skill-dir>/scripts/sentry.mjs" apply --plan /path/plan.json
node "<skill-dir>/scripts/sentry.mjs" apply --plan /path/plan.json --execute
node --test "<skill-dir>/scripts/sentry.test.mjs" "<skill-dir>/scripts/incident-receipt.test.mjs"
```

## Workflow

1. Inventory manifests, runtimes, entrypoints, environment loaders, packaging and existing instrumentation. Read [integration](references/implantacao.md). When delegation is supported, use read-only inventory and disjoint integration agents, plus an independent reviewer. The principal owns API mutations and credentials. Otherwise work sequentially and disclose the lack of independent review.
2. Run `inventory`, which paginates projects and teams. Compare remote candidates with local purpose and ownership; similar names alone do not prove a match.
3. Present economy, balanced and isolated mappings based on the actual workspace. Read [scenarios](references/cenarios.md). Explain approved volume/features separately from project count; fewer DSNs do not guarantee lower cost.
4. Prepare a concrete secret-free plan following [commands](references/comandos.md). Run `apply` without `--execute` to preflight and preview. Once the operator has authorized that mapping and scope, execute it; do not request the same authorization again. Creating or installing this skill does not authorize remote changes.
5. Integrate the appropriate SDK per runtime, preserving existing instrumentation, manifests and locks. Keep one writer per manifest/lock when delegating. Preserve original error messages, types, stacks, causes and context; do not add custom sanitization, reconstruction, redaction or discard hooks (`beforeSend`, `before_send`, `beforeSendSpan`) or transport filters. Control consumption through authorized activation and sampling. Keep telemetry failures isolated from application processing.
6. Use `env` to preview/write DSN, environment, service and release to the file each component actually loads. Administrative credentials stay separate. Validate project-defined environment names explicitly; never infer production from `NODE_ENV`. Public frontend variables may require rebuilding.
7. Run relevant local checks, including packaging and handled-error capture. A benign unique marker and live receipt query require authorization for live ingestion. Never trigger GPU inference or application jobs merely to validate telemetry. Distinguish local mocks, markers, real errors, API-confirmed receipts and deployment.
8. Report changes, checks and evidence limits. Empty queries do not establish absence of failures; receipts do not establish root cause or resolution. Commit, push, deploy and external communication retain their own authorization boundaries.

## Read-only inspection

`project`, `keys`, `events` and `event` return bounded summaries without raw requests, users, messages, stacks, tokens or DSNs. Event tags include generic `environment`, `service` and `release` identifiers. `events --start ... --end ...` limits queries to one hour and two pages, filters the requested environment/release and deduplicates IDs; report pagination and ingestion limits.

For optional span/profile receipts, use `incident-receipt.mjs` with project-configured operation and span names. It resolves the project ID through the API instead of storing IDs in the skill. Read [commands](references/comandos.md#recibos-de-spans-e-perfis) before using it. Do not enable tracing/profiling merely because a receipt command exists.
