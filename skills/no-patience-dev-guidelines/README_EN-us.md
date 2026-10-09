# No Patience Dev Guidelines

> 🇧🇷 Versão em português: [README.md](README.md)

Guidelines for coding agents that reduce the supervision, correction, and review burden placed on developers. For those times when you need a problem solved and the agent delivers a new abstraction, three speculative patches, and an unexplained “everything works.”

## When to use

Use for implementation, debugging, review, and refactoring, including the plans, progress updates, and reports for those tasks. The skill guides the agent to understand project context, respect scope, and verify the requested behavior.

Investigation and verification should scale with the complexity of the change. A trivial edit does not need an elaborate process.

## Installation

```bash
# Install in the project
npx skills add maiquealmeida/skills --skill no-patience-dev-guidelines

# Install globally for Claude Code
npx skills add maiquealmeida/skills --skill no-patience-dev-guidelines -g -a claude-code
```

To list skills from the root of a local clone:

```bash
npx skills add . --list
```

## Example request

```text
Use the no-patience-dev-guidelines skill to fix this bug.
Investigate the cause, preserve existing changes, and verify
the affected behavior. When finished, explain what changed,
why it changed, which checks you ran, and what remains pending.
```

## The seven principles

| Principle | Expected behavior |
| --- | --- |
| Think before coding | Read the implementation, its consumers, and local conventions; investigate before asking; confirm APIs and versions. |
| Simplicity first | Reuse existing mechanisms and avoid speculative features, dependencies, and abstractions. |
| Surgical changes | Respect scope, preserve others' work, and review your own diff before delivery. |
| Goal-driven execution | Define success, verify requested behavior, and preserve test criteria. |
| Never make vague claims | Identify the subject, scope, sources, evidence, and reasons; for actions, also identify responsible actors, responsibilities, and outcomes. |
| Diagnose before patching | Test hypotheses, learn from failed attempts, and avoid speculative patches or retries without new evidence. |
| Preserve decisions and continuity | Resume from the actual project state, retaining the objective, user corrections, decisions, and authorizations. |

## Reporting that can be checked

The rule against vague claims applies to every project topic: code, architecture, configuration, decisions, defects, tests, data, and deliveries.

**Vague:** “The tests passed and the problem is fixed.”

**Illustrative example, valid only with supporting evidence:** “I ran `npm test -- tests/cart.test.ts`. All eight tests passed, including the case reproducing the duplicate charge. The change in `src/cart.ts` prevents adding the same item twice. The checkout flow in the browser has not yet been verified.”

If information cannot be confirmed, the agent must state exactly what it knows and what still needs verification. It must not invent details, present a hypothesis as a proven cause, or call partial work complete.

## Definition and rationale

- [SKILL.md](SKILL.md): the instructions the agent follows; the primary source for the rules and current version.
- [Research and references](references/research.md): studies, engineering accounts, articles, and videos informing the extensions, with their interpretation limits. This document is in English.

The guidelines build on the Karpathy Guidelines with research-informed extensions. They guide agent behavior; their effectiveness also depends on the context, tools, and checks available in the project.
