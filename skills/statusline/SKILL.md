---
name: statusline
description: Install a custom Claude Code status line (directory, git branch, model, context bar, cost, 5h/7d quota bars). Use when the user asks to "install the status line", "set up statusline", "configure statusLine", or wants the status line from this repo in Claude Code.
---

# Status Line

Installs a dependency-free Node status line for Claude Code. Works on macOS, Linux and Windows; it does not use `jq`, `git` or POSIX shell syntax, and it spawns no processes (the branch is read from `.git/HEAD`, worktrees included).

Output (stdin is the session JSON Claude Code provides):

- Line 1: directory · branch · model · context bar · cost
- Line 2: 5h and 7d quota bars with time to reset (only when the API reports them; Pro/Max only)

Requires Node.js on the user's `PATH`.

## Install

1. Ask whether to install **globally** (`~/.claude/`) or in the **current project** (`.claude/`) if the user did not say.
2. Copy `scripts/statusline.mjs` from this skill to the target as `statusline.mjs`.
3. Merge a `statusLine` entry into the target `settings.json` (`~/.claude/settings.json` or `.claude/settings.json`). Preserve every other key, and show the diff before writing if a `statusLine` already exists.

   Global (use the absolute path, since the command does not expand `~` portably):

   ```json
   "statusLine": {
     "type": "command",
     "command": "node /absolute/path/to/.claude/statusline.mjs",
     "refreshInterval": 60
   }
   ```

   Project (Claude Code runs the command from the project root, so a relative path works on every shell):

   ```json
   "statusLine": {
     "type": "command",
     "command": "node .claude/statusline.mjs",
     "refreshInterval": 60
   }
   ```

4. Verify without restarting:

   ```bash
   echo '{"model":{"display_name":"Test"},"context_window":{"used_percentage":42}}' | node <path>/statusline.mjs
   ```

   It should print a colored line containing the model name and a context bar at 42%.

## Notes

- Context thresholds (used): green up to 50%, yellow above, red from 70%.
- Quota thresholds (remaining): green from 50%, yellow 26-49%, red below 26%.
- Set `CLAUDE_STATUSLINE_DEBUG=1` to print rendering errors to stderr; the script otherwise degrades to the model name and never breaks the session.
