# Designing a decision page

The page replaces a question. It succeeds when the user understands what changes with each
option faster than they would by reading a chat message, and answers with one click per
decision. Read `frontend-design/GUIDE.md` (and the references it points to) before writing
the first line; this file adds what is specific to decision pages.

## Content, before any styling

1. **List the decisions.** Only genuine decisions that belong to the user: scope, trade-offs,
   product behavior, approvals. Facts you can read from the code, docs or environment are
   never asked; state them as context.
2. **Per decision:** a title phrased as the question, one sentence of context, 2–4 concrete
   options (never "Option A" without a name), each with what it **gains** and what it
   **costs**. Mark the recommended one and say why in one line. Add an "Other" option with a
   free-text input only when the space is genuinely open.
3. **Required vs optional.** `data-required` only on what blocks the work. Optional
   decisions (execution preferences, notes) must not block the send button.
4. **Context-only sections** (no choice) are allowed: a roadmap, a constraint, a measured
   number the decisions depend on. Keep them short and put them first.
5. **Language:** write in the user's language. Keep the field `name`/`value` stable and
   machine-friendly (`kebab-case`), since they come back to you as the answer.

## One figure per decision, and it must react

Each decision gets a figure that changes when an option is selected. Pick the form from what
the decision is about:

| The decision is about | Figure |
| --- | --- |
| Architecture, who calls whom, where code runs | Node-and-arrow diagram; dashed animated paths for the active flow; dim the nodes the option removes |
| A threshold or limit (size, time, quota) | Slider simulator: the user drags a value and sees pass/fail per option |
| Exposure, permissions, blast radius | Reach diagram: what each credential/component can touch; red edge for the extra reach |
| Scheduling, timing | 24 h dial or timeline with the chosen point |
| Cost, capacity, budget | Stacked bar against the hard limit, with the limit drawn as a line |
| Multi-criteria trade-off | Horizontal bars per criterion (0–5), labelled as *your assessment*, never as measurement |
| Sequencing, phases | Timeline with brackets showing what runs together |

Use inline SVG and plain JS; no chart library is needed for these. Listen to the template's
`decisions:change` event (or the form's `change`) to update figures.

## Honesty rules

- Numbers on the page are either measured (say where and when) or estimates (say so).
- Do not invent options to fill space, and do not hide the cost of the recommended one.
- If something is uncertain, the page says it is uncertain.

## Mechanics

- Start from `assets/template.html`; keep its contract (see the comment at its top).
- Self-contained page: inline CSS and JS; Google Fonts is fine; no build step.
- Accessibility: real `<input>` elements inside `<label>`, visible focus, `aria-live` on the
  progress and status, `prefers-reduced-motion` respected.
- Works at 390 px wide: figures stack under the options.
- Verify before handing over: open it, check the console has no errors, take a screenshot
  (Orca: `orca screenshot --page <id> --json`) and fix clipping or broken numbering.
