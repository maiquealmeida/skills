import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { calculate } from '../gut.mjs';

const context = { project: 'Projeto sintético', rubricVersion: 'v1', assessedAt: '2026-10-08T10:00:00-04:00' };
const issue = (id, g = 3, u = 3, t = 3) => ({
  id, title: `Problema ${id}`, g, u, t,
  justification: { g: 'Dano sustentado no cenário.', u: 'Janela sustentada no cenário.', t: 'Mecanismo sustentado no cenário.' },
  evidence: ['Cenário sintético de teste'],
});
const input = (...issues) => ({ context: { ...context }, issues });
const cli = fileURLToPath(new URL('../gut.mjs', import.meta.url));
const run = (args, stdin) => spawnSync(process.execPath, [cli, ...args], { input: stdin, encoding: 'utf8' });

test('all 125 vectors produce the correct product and monotonic scores', () => {
  const items = [];
  for (let g = 1; g <= 5; g++) for (let u = 1; u <= 5; u++) for (let t = 1; t <= 5; t++) {
    items.push(issue(`${g}-${u}-${t}`, g, u, t));
  }
  const output = calculate(input(...items));
  assert.equal(output.ranked.length, 125);
  assert.equal(output.ranked[0].score, 125);
  assert.equal(output.ranked.at(-1).score, 1);
  for (const item of output.ranked) {
    assert.equal(item.score, item.g * item.u * item.t);
    assert.deepEqual(item.scoreRange, { min: item.score, max: item.score });
    for (const axis of ['g', 'u', 't']) if (item[axis] < 5) {
      const increased = { ...item };
      delete increased.status; delete increased.score; delete increased.scoreRange; delete increased.rank;
      increased[axis]++;
      assert.ok(calculate(input(increased)).ranked[0].score > item.score);
    }
  }
  assert.ok(output.ranked.every((item, i, list) => i === 0 || item.score <= list[i - 1].score));
});

test('intervals and unknowns remain provisional without a fabricated score or rank', () => {
  const output = calculate(input(issue('interval', 4, 3, { min: 2, max: 4 }), issue('unknown', 5, 5, null)));
  assert.deepEqual(output.provisional.map(item => item.scoreRange), [{ min: 24, max: 48 }, { min: 25, max: 125 }]);
  assert.equal(output.ranked.length, 0);
  for (const item of output.provisional) { assert.equal(item.score, null); assert.ok(!Object.hasOwn(item, 'rank')); }
});

test('ties are genuine competition ranks and preserve display order', () => {
  const output = calculate(input(issue('first', 4, 4, 5), issue('second', 5, 4, 4), issue('third', 3, 4, 5)));
  assert.deepEqual(output.ranked.map(item => [item.id, item.rank]), [['first', 1], ['second', 1], ['third', 3]]);
});

test('explicit emergency overrides do not change score or get lost among higher products', () => {
  const emergency = { ...issue('critical-stable', 5, 5, 1), override: { reason: 'Dano ativo.', source: 'Política sintética.' } };
  const uncertain = { ...issue('uncertain', 5, null, 1), override: emergency.override };
  const output = calculate(input(issue('other', 3, 3, 3), emergency, uncertain));
  assert.equal(output.escalations[0].score, 25);
  assert.equal(output.escalations[1].score, null);
  assert.deepEqual(output.ranked.map(item => item.id), ['other']);
});

test('reject invalid scores, missing rationale/evidence, duplicates and misspelled fields', () => {
  for (const bad of [0, 6, 2.5, '3', true, undefined, { min: 4, max: 2 }, { min: 2, max: 2 }, { min: 1, max: 6 }, { min: 1, max: 3, typo: 1 }]) {
    assert.throws(() => calculate(input({ ...issue('bad'), g: bad })));
  }
  assert.throws(() => calculate(input(issue('same'), issue(' same '))));
  assert.throws(() => calculate(input({ ...issue('bad'), justification: { g: 'x', u: 'x', t: '' } })));
  assert.throws(() => calculate(input({ ...issue('bad'), evidence: [] })));
  assert.throws(() => calculate(input({ ...issue('bad'), override: { reason: 'x' } })));
  assert.throws(() => calculate(input({ ...issue('bad'), urgency: 4 })));
  assert.throws(() => calculate({ context, issues: [] }));
  assert.throws(() => calculate({ context: { ...context, assessedAt: '2026-10-08T10:00:00' }, issues: [issue('a')] }));
  assert.throws(() => calculate({ context: { ...context, project: '' }, issues: [issue('a')] }));
});

test('calculator does not mutate input', () => {
  const value = input(issue('a'), issue('b', 5, 5, 5));
  const original = structuredClone(value);
  calculate(value);
  assert.deepEqual(value, original);
});

test('CLI reads both stdin and file, emits JSON, and fails atomically', () => {
  const data = JSON.stringify(input(issue('a', 4, 4, 5)));
  const stdin = run(['-'], data);
  assert.equal(stdin.status, 0, stdin.stderr);
  assert.equal(JSON.parse(stdin.stdout).ranked[0].score, 80);
  const temporary = mkdtempSync(join(tmpdir(), 'gut-test-'));
  try {
    const path = join(temporary, 'entrada.json');
    writeFileSync(path, data);
    const file = run([path]);
    assert.equal(file.status, 0, file.stderr);
    assert.deepEqual(JSON.parse(file.stdout), JSON.parse(stdin.stdout));
  } finally { rmSync(temporary, { recursive: true, force: true }); }
  for (const [args, body] of [[['-'], '{broken'], [['-'], JSON.stringify(input(issue('valid'), issue('bad', 0)))], [[], ''], [['--typo'], '']]) {
    const output = run(args, body);
    assert.equal(output.status, 1);
    assert.equal(output.stdout, '');
    assert.match(output.stderr, /^GUT:/);
  }
  assert.equal(run(['--help']).status, 0);
});
