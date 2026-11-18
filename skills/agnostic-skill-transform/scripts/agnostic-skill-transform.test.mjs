import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listCandidates, migrate } from './agnostic-skill-transform.mjs';

function project() {
  const root = mkdtempSync(join(tmpdir(), 'agnostic-skill-transform-'));
  const add = (name, body) => {
    mkdirSync(join(root, '.claude/skills', name, 'references'), { recursive: true });
    writeFileSync(join(root, '.claude/skills', name, 'SKILL.md'), body);
    writeFileSync(join(root, '.claude/skills', name, 'references/x.md'), 'ref');
  };
  add('alpha', '---\nname: alpha\ndescription: A.\ndisable-model-invocation: true\n---\n\nBody [x](references/x.md)\n');
  add('beta', '---\nname: beta\ndescription: B.\n---\n\nRead `.agents/skills/beta/SKILL.md`.\n');
  mkdirSync(join(root, '.claude/skills/no-skill'), { recursive: true });
  return root;
}

test('lists only real skills that are not adapters', () => {
  assert.deepEqual(listCandidates(project()), ['alpha']);
});

test('moves the skill with its files and leaves an adapter with the original frontmatter', () => {
  const root = project();
  assert.deepEqual(migrate(root, ['alpha']).map((r) => r.status), ['moved']);
  assert.equal(readFileSync(join(root, '.agents/skills/alpha/references/x.md'), 'utf8'), 'ref');
  assert.match(readFileSync(join(root, '.agents/skills/alpha/SKILL.md'), 'utf8'), /Body/);
  const adapter = readFileSync(join(root, '.claude/skills/alpha/SKILL.md'), 'utf8');
  assert.match(adapter, /^---\nname: alpha\ndescription: A\.\ndisable-model-invocation: true\n---\n/);
  assert.match(adapter, /\.agents\/skills\/alpha\/SKILL\.md/);
  assert.equal(existsSync(join(root, '.claude/skills/alpha/references')), false);
  assert.deepEqual(listCandidates(root), []);
});

test('never overwrites an existing .agents/skills entry', () => {
  const root = project();
  mkdirSync(join(root, '.agents/skills/alpha'), { recursive: true });
  assert.equal(migrate(root, ['alpha'])[0].status, 'skipped');
  assert.match(readFileSync(join(root, '.claude/skills/alpha/SKILL.md'), 'utf8'), /Body/);
});
