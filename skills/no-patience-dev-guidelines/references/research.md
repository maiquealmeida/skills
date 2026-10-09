# Research behind the guideline extensions

Research reviewed on 2026-10-08. This reference documents the rationale for the extensions to the original Karpathy-derived guidelines. The instructions are an engineering synthesis: the sources do not individually demonstrate that these exact rules improve every coding agent.

## Evidence and application

| Source and evidence type | Relevant finding | Application in this skill |
| --- | --- | --- |
| [Stack Overflow Developer Survey 2025 — AI](https://survey.stackoverflow.co/2025/ai), developer self-reports | Among respondents to the frustrations question, 66% cited nearly correct solutions and 45% cited more time-consuming debugging of generated code. | Verify requested behavior and reduce the correction burden, rather than treating generated code as a completed delivery. These percentages describe reported frustrations, not measured agent failure rates. |
| [Liang, Yang, and Myers — A Large-Scale Survey on the Usability of AI Programming Assistants](https://arxiv.org/abs/2303.17125), ICSE 2024, survey of 410 developers | Important barriers include failure to satisfy functional or nonfunctional requirements and difficulty controlling the desired output. The authors call for interactions requiring less cognitive effort. | Inspect requirements, ask only consequential questions, and make the resulting behavior reviewable. The study concerns earlier assistants; it does not isolate the effect of clarification policies in modern agents. |
| [Usage, Effects and Requirements for AI Coding Assistants in the Enterprise](https://arxiv.org/html/2601.20112v1), empirical survey of 57 participants in one company | Participants request deeper repository context, current SDK and library knowledge, customization to local conventions, reliability, and explicit uncertainty. Reported limitations include omitted features and failure to follow codebase practices. | Inspect implementation and consumers, confirm version-specific APIs, reuse local mechanisms, and state uncertainty accurately. Productivity claims in this survey are perceptions, not controlled measurements. |
| [Engineering Pitfalls in AI Coding Tools](https://arxiv.org/html/2603.20847v1), preprint analyzing 3,864 public bug reports across Claude Code, Codex, and Gemini CLI | Reported problems include incorrect file operations, misleading or simulated execution, unauthorized changes, and loss of session state or context. | Inspect actual state, preserve unrelated edits and authorization boundaries, distinguish execution from claims, and reconcile context when resuming. Reports cover tool infrastructure as well as model behavior; their frequencies are not probabilities that an agent will fail. |
| [SlopCodeBench](https://arxiv.org/abs/2603.24755), preprint evaluating iterative extensions across 20 problems and 93 checkpoints | Redundancy and structural complexity grow during repeated extensions; improving the initial prompt does not halt degradation. | Examine accumulating exceptions and duplicated logic while preserving contracts and scope. Benchmark results do not establish that every small change requires refactoring, nor that instructions alone prevent deterioration. |

## Practitioner and engineering sources

- [Anthropic — Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents): describes premature completion, incomplete end-to-end verification, incremental work, and recovery using progress records and Git history. Supports behavior-level verification, protection of test criteria, and continuity. This is a provider's engineering account, not an independent controlled evaluation. Adapt the principles to existing project mechanisms; it does not authorize automatic commits or require new tracking files.
- [Simon Willison — Anti-patterns: things to avoid](https://simonwillison.net/guides/agentic-engineering-patterns/anti-patterns/): identifies handing collaborators unreviewed generated code as an antipattern. Supports reviewing the diff before delivery and explaining what a reviewer needs to assess.
- [Simon Willison — First run the tests](https://simonwillison.net/guides/agentic-engineering-patterns/first-run-the-tests/) and [Red/green TDD](https://simonwillison.net/guides/agentic-engineering-patterns/red-green-tdd/): describe baseline testing and confirming a failing test before a fix. Apply proportionally to behavior changes; this skill does not require test scaffolding for trivial edits.
- [Addy Osmani — The 80% Problem in Agentic Coding](https://addyosmani.com/blog/the-80-problem-in-agentic-coding/): discusses overcomplication, review, constraints, verification, and architectural hygiene. Provides practitioner context rather than a universal numerical estimate of completion.

## Videos with accompanying written material

- [AI's 70% Problem — Addy Osmani, Zed session](https://www.youtube.com/watch?v=kvZGJVAZwr0), aired 2025-11-06. The [organizer's written excerpts](https://zed.dev/blog/ai-70-problem-addy-osmani) discuss convincing but incomplete solutions, fixes causing further problems, and review responsibility. Motivates diagnosis before speculative patches. The “70%” framing is a practitioner heuristic, not a measured completion rate for all agents.
- [Simon Willison on Lenny's Podcast](https://www.youtube.com/watch?v=wc8FBhQtdsA), accompanied by [Willison's highlights and chapter list](https://simonwillison.net/2026/Apr/2/lennys-podcast/). Relevant chapters: 20:41, shifted bottlenecks; 1:08:21, red/green TDD. This research used the written material and chapter list, not an independent viewing or transcription of the entire video.

## Productivity evidence and limits

[METR's early-2025 randomized trial](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/) studied 16 experienced open-source developers completing 246 tasks in familiar repositories. Tasks took 19% longer with the studied AI tools, despite participants perceiving a speedup. It motivates judging success by verified delivery and developer effort, rather than apparent output speed.

Do not generalize this result to every developer or current agent. In its [2026-02-24 update](https://metr.org/blog/2026-02-24-uplift-update/), METR describes selection effects and measurement problems that make its later productivity estimates unreliable. Tool capabilities and workflows change rapidly.

## Maintaining these guidelines

Keep essential behavioral rules in `SKILL.md`; keep this bibliography and its qualifications here. Do not turn every reported problem into another mandatory process. Evaluate future revisions against observable outcomes: satisfied requirements, regressions, unsupported claims, repeated failed attempts, and review effort. Prompts support good engineering but do not replace execution tools, meaningful tests, or project-specific checks.
