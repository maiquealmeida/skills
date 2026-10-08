# Layout format

A layout is `<repo-root>/.orca/layouts/<name>.layout.json`. The name is the file name without `.layout.json`: letters, digits, `-` or `_`; not `up`, `down`, `plan`, `list`, `doctor`, `run-pane` or `help`.

```json
{
  "title": "Dev Confia",
  "columns": 2,
  "panes": [
    {
      "name": "ConfiaAPI",
      "dir": "microservices/Api/src/ConfiaAPI",
      "cmd": "dotnet run --launch-profile https",
      "env": { "PROMETHEUS_PORT": "5101" }
    },
    {
      "name": "AuthorizationAPI",
      "dir": "microservices/Authorizations/src/AuthorizationAPI",
      "cmd": "dotnet run --launch-profile https",
      "env": { "PROMETHEUS_PORT": "5102" }
    },
    {
      "name": "ConfiaBff",
      "dir": "microservices/BFF/src/ConfiaBff",
      "cmd": "dotnet run --launch-profile https"
    },
    {
      "name": "AuthorizationWorkerService",
      "dir": "microservices/Authorizations/src/AuthorizationWorkerService",
      "cmd": "dotnet run",
      "env": { "PROMETHEUS_PORT": "5103" }
    }
  ]
}
```

Those four panes in two columns open as:

```
ConfiaAPI         | AuthorizationAPI
ConfiaBff         | AuthorizationWorkerService
```

## Fields

| Field | Required | Meaning |
| --- | --- | --- |
| `title` | no | Tab title, up to 80 characters, without `"`, `%` or `\`, not starting with `-`. Default `Layout`. The tab is shown as `<title> [<name>]`; the ` [<name>]` mark is how `down` finds the tab. |
| `columns` | no | Panes per row. Default 2. |
| `panes` | yes | From 1 to 16. Order is reading order: left to right, top to bottom. The last row may be shorter and then spans the full width. |
| `panes[].name` | yes | Unique label shown in the plan and in the pane header. |
| `panes[].dir` | no | Working directory, relative to the repo root, with `/` separators and no `:`. Default `.`. It must be a folder inside the repo: absolute paths, `..` and symlinks that lead outside are refused. |
| `panes[].cmd` | yes | One-line command that starts the project. |
| `panes[].env` | no | Extra environment variables. Values may be text, numbers or booleans. |
| `$schema`, `description` | no | Ignored; allowed for editors and notes. |

Any other key is an error, so typos such as `colums` are caught. Text fields reject control characters (escape sequences, line breaks, bidi marks) and are limited in size; the file itself is limited to 64 KiB and cannot be a symlink. The layout is untrusted input and is shown on screen for review, which is why these checks exist.

Orca splits panes in halves, so with 3 or more columns (or rows) the sizes come out uneven; drag the dividers if you care.

## How a pane runs

Every pane types only `node <skill>/scripts/orca-layout.mjs run-pane <layout> <index>`. That line is identical in zsh, PowerShell and cmd. The runner first checks that the layout is a confirmed one (see Trust in `SKILL.md`), then does the `chdir`, merges `env` over the pane's own environment and runs `cmd` through the system shell (`/bin/sh -c` on macOS and Linux, `cmd.exe` on Windows) with the terminal attached, so colors and interactive keys keep working. It prints `[orca-layout] start …` and `[orca-layout] exit … code=N` markers, which `down` uses to know when a project has finished stopping.

Write `cmd` as a plain command that works in both `sh` and `cmd.exe`: avoid `cd`, `&&`, `;`, pipes and `VAR=value cmd` prefixes. This is for portability, it is not enforced. Directory goes in `dir`, variables in `env`. If a project needs more than one step, put the steps in a script or package task and call that.

The confirmation covers the command line you see, not the code it runs. `env` that changes what executes without appearing in the command (`NODE_OPTIONS`, `LD_PRELOAD`, `PATH`...) is flagged with ⚠ in the plan.

## More examples

JavaScript monorepo, API and web side by side:

```json
{
  "title": "Dev",
  "panes": [
    { "name": "api", "dir": "packages/api", "cmd": "yarn dev" },
    { "name": "web", "dir": "packages/web", "cmd": "yarn dev", "env": { "PORT": "3000" } }
  ]
}
```

Root-level tasks stacked in one column:

```json
{
  "title": "Docs",
  "columns": 1,
  "panes": [
    { "name": "site", "cmd": "npm run docs:serve" },
    { "name": "tests", "cmd": "npm run test:watch" }
  ]
}
```
