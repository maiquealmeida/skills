# boletim-do-claude

> 🇧🇷 Versão em português: [README.md](README.md)

Claude Code plugin that grades every Claude answer and suggests rules for your `CLAUDE.md`. The grader is [Jev](https://docs.typesafe.ai), TypeSafe's model. So you find out Claude skipped the tests before the deploy tells you.

## What it does

When a Claude turn ends, the plugin sends Jev the request, the files touched, the commands run and the final answer. Jev scores each criterion in [`criterios.json`](criterios.json) on three levels (fraco, ok, ótimo: weak, ok, great). The six criteria that ship with it:

| Criterion | Question |
| --- | --- |
| Resumo final | Did it say what changed and in which files? |
| Como conferir | Did it say which page to open and what to click? |
| Prova | Did it run tests or open the page and report the result? |
| Suposições | Did it flag what it decided on its own? |
| Tamanho da mudança | Did it touch only what the request required? |
| Próximo passo | Did it suggest a concrete next step? |

The turn grade is the average (great 10, ok 6, weak 2). The two weakest criteria become improvement points, each with a suggested rule. The plugin only observes: it never holds or changes a tool call.

Where the report shows up:

- a line in the conversation, like `Boletim: nota 7,3 · melhorar: Prova (fraco), Como conferir (ok)`;
- a line above the prompt;
- the **Boletim do Claude** panel next to the conversation, with one row per criterion and a chart of recent turns;
- when there is no room for the panel, the whole report in a cyan-bordered box above the prompt.

| Command | What it does |
| --- | --- |
| `/boletim` | Opens the panel with the last turn's report. |
| `/melhorar` | Writes the improvement points' rules to the root `CLAUDE.md`, under `## Regras do boletim`, without duplicates. |

All the plugin's text is in Brazilian Portuguese.

## Requirements

- **Claude Code** with the mods API. Tested on 2.1.295; that API is early access and can change between releases.
- **TypeSafe API key** in `~/.env.local` (in your home folder), read on every evaluation:

  ```bash
  TYPESAFE_API_KEY=your-key
  ```

  `export`, quotes and a trailing comment are accepted. The key never shows on screen, not even in error messages.

## Installation

```text
/plugin install boletim-do-claude --marketplace maiquealmeida/skills
```

From a local clone, to test or edit (that session only):

```bash
claude --plugin-dir plugins/boletim-do-claude
```

## Editing the criteria

[`criterios.json`](criterios.json) sits at the plugin root and is read again every turn. Each criterion has `nome` (name), `pergunta` (question), `regra` (rule) and, optionally, `degraus` describing weak, ok and great. A criterion missing a name, question or rule is ignored, and an empty list leaves the turn ungraded. The `_como_editar` field explains each field inside the file itself.

Installed from the marketplace, the plugin runs from a copy, and an update may overwrite that copy's `criterios.json`. For criteria that are just yours, use the clone with `--plugin-dir`.

## Privacy and failures

On every main turn the plugin sends `api.typesafe.ai` the request (up to 2000 characters), the files touched (up to 50), the last 30 commands (each cut to 300 characters) and the end of the answer (up to 8000 characters). If a project's contents must not leave the machine, do not load the plugin there.

With no key, no network, a malformed response or a broken `criterios.json`, the turn goes ungraded (`Boletim: Jev fora do ar, turno sem nota`). The reason goes only to the debug log (`claude --debug`).

## Development

```bash
claude plugin validate plugins/boletim-do-claude
claude plugin test plugins/boletim-do-claude
```

With the plugin loaded from a folder (`--plugin-dir`), Claude Code writes `.claude-plugin/types/` and `tsc -p plugins/boletim-do-claude` starts working. That folder is generated and git-ignored. `validate` warns that the name "reads as one of Anthropic's own" (because of "claude"); the name is kept on purpose.

| Path | Role |
| --- | --- |
| `hooks/register.tsx` | Everything that touches the engine: events, state, files, network, screen and commands. |
| `hooks/jev.ts` | Pure logic: Jev request, grades, chart, report text and `CLAUDE.md` editing. |
| `types/index.d.ts` | The `$.state` contract (turn, evaluation, history and where the report shows). |
| `criterios.json` | Editable criteria, with each one's levels. |
| `tests/` | Fake engine (Jev, files, store, clock, panel) and the plugin's tests. |
