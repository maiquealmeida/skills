#!/usr/bin/env node
// Moves project skills from .claude/skills/ to .agents/skills/ and leaves an adapter in place.
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, cpSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CLAUDE_DIR = join('.claude', 'skills');
export const AGENTS_DIR = join('.agents', 'skills');
const MARKER = '.agents/skills/';

// A skill is already an adapter when it is a link into .agents/skills or its SKILL.md points there.
export function isAdapter(root, name) {
  const dir = join(root, CLAUDE_DIR, name);
  const agents = resolve(root, AGENTS_DIR) + sep;
  if (lstatSync(dir).isSymbolicLink()) {
    try { return (realpathSync(dir) + sep).startsWith(agents); } catch { return false; }
  }
  return readFileSync(join(dir, 'SKILL.md'), 'utf8').includes(MARKER);
}

export function listCandidates(root) {
  const base = join(root, CLAUDE_DIR);
  if (!existsSync(base)) return [];
  return readdirSync(base, { withFileTypes: true })
    .filter((e) => (e.isDirectory() || e.isSymbolicLink()) && existsSync(join(base, e.name, 'SKILL.md')))
    .map((e) => e.name)
    .filter((name) => !isAdapter(root, name))
    .sort();
}

// Keeps the original frontmatter verbatim so name, description and agent-specific fields still apply.
export function frontmatter(text, name) {
  const m = text.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return m ? m[0].replace(/\r?\n?$/, '\n') : `---\nname: ${name}\n---\n`;
}

export function adapterText(original, name) {
  const target = `${MARKER}${name}`;
  return `${frontmatter(original, name)}
<!-- adapter: the real skill lives in ${target}/ -->

Read \`${target}/SKILL.md\` and follow it as this skill's instructions.

- Resolve every relative path in it (references/, scripts/, assets/) against \`${target}/\`.
- Where it mentions \`\${CLAUDE_SKILL_DIR}\` or "the skill directory", use \`${target}\`.
- Pass on any arguments this skill was invoked with.
`;
}

function move(from, to) {
  try { renameSync(from, to); } catch (err) {
    if (err.code !== 'EXDEV') throw err;
    cpSync(from, to, { recursive: true, verbatimSymlinks: true });
    rmSync(from, { recursive: true, force: true });
  }
}

export function migrate(root, names) {
  const candidates = new Set(listCandidates(root));
  const results = [];
  mkdirSync(join(root, AGENTS_DIR), { recursive: true });
  for (const name of names) {
    const src = join(root, CLAUDE_DIR, name);
    const dest = join(root, AGENTS_DIR, name);
    if (!candidates.has(name)) { results.push({ name, status: 'skipped', reason: 'not found or already an adapter' }); continue; }
    if (existsSync(dest)) { results.push({ name, status: 'skipped', reason: `${AGENTS_DIR}/${name} already exists` }); continue; }
    if (lstatSync(src).isSymbolicLink()) { results.push({ name, status: 'skipped', reason: 'is a symlink to another place; move it by hand' }); continue; }
    const original = readFileSync(join(src, 'SKILL.md'), 'utf8');
    move(src, dest);
    mkdirSync(src);
    writeFileSync(join(src, 'SKILL.md'), adapterText(original, name));
    results.push({ name, status: 'moved', to: `${AGENTS_DIR}/${name}` });
  }
  return results;
}

function main(argv) {
  const [cmd, ...rest] = argv;
  const root = process.cwd();
  if (cmd === 'list') return console.log(JSON.stringify(listCandidates(root)));
  if (cmd === 'migrate') {
    const names = rest.includes('--all') ? listCandidates(root) : rest;
    if (!names.length) { console.error('nothing to migrate'); process.exit(1); }
    const results = migrate(root, names);
    console.log(JSON.stringify(results, null, 2));
    process.exit(results.some((r) => r.status !== 'moved') ? 2 : 0);
  }
  console.error('usage: agnostic-skill-transform.mjs list | migrate --all | migrate <name>...');
  process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
