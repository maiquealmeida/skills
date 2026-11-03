import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  AGENTS_BLOCK, BLOCK_START, BLOCK_END, insideOrca, resolveOpenMode, readConfig, effectiveConfig,
  patchConfig, upsertBlock, removeBlock, instructionsFile, validatePayload, safeJoin, orcaCommand,
} from './decision-page.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'decision-page.mjs');
const tmp = () => mkdtempSync(join(tmpdir(), 'decision-page-'));

test('Orca is detected from its terminal environment only', () => {
  assert.equal(insideOrca({ ORCA_WORKTREE_ID: 'x' }), true);
  assert.equal(insideOrca({ ORCA_TERMINAL_HANDLE: 'term_1' }), true);
  assert.equal(insideOrca({ TERM_PROGRAM: 'Orca' }), true);
  assert.equal(insideOrca({ TERM_PROGRAM: 'iTerm.app' }), false);
  assert.equal(insideOrca({}), false);
});

test('open mode: auto picks orca inside Orca and browser elsewhere; invalid modes are refused', () => {
  assert.equal(resolveOpenMode('auto', { TERM_PROGRAM: 'Orca' }), 'orca');
  assert.equal(resolveOpenMode('auto', {}), 'browser');
  assert.equal(resolveOpenMode('none', { TERM_PROGRAM: 'Orca' }), 'none');
  assert.throws(() => resolveOpenMode('chrome', {}), /--open must be one of/);
  assert.equal(orcaCommand({ ORCA_CLI_COMMAND: 'orca-ide' }), 'orca-ide');
  assert.equal(orcaCommand({}), 'orca');
});

test('config: defaults, merge keeps foreign keys, invalid JSON shapes are refused', () => {
  assert.deepEqual(effectiveConfig({}), { enabled: false, dir: 'temp/decision-pages', open: 'auto' });
  const patched = patchConfig({ other: { a: 1 }, decisionPage: { dir: 'x' } }, { enabled: true });
  assert.deepEqual(patched, { other: { a: 1 }, decisionPage: { dir: 'x', enabled: true } });
  assert.equal(effectiveConfig(patched).open, 'auto');
  assert.deepEqual(readConfig(''), {});
  assert.throws(() => readConfig('[]'), /JSON object/);
});

test('instructions block: inserted once, replaced in place, removed cleanly', () => {
  const once = upsertBlock('# AGENTS\n\nRules.\n');
  assert.equal(once.split(BLOCK_START).length, 2);
  assert.ok(once.startsWith('# AGENTS\n\nRules.\n\n'));
  assert.equal(upsertBlock(once), once);
  const stale = once.replace('Decision page', 'Old title');
  assert.equal(upsertBlock(stale), once);
  assert.equal(removeBlock(once), '# AGENTS\n\nRules.\n');
  assert.equal(upsertBlock(''), AGENTS_BLOCK + '\n');
  assert.equal(removeBlock('no block\n'), 'no block\n');
  assert.ok(AGENTS_BLOCK.includes('AskUserQuestion') && AGENTS_BLOCK.endsWith(BLOCK_END));
});

test('instructions file: AGENTS.md wins, CLAUDE.md only when alone', () => {
  const has = set => p => set.some(n => p.endsWith(n));
  assert.match(instructionsFile('/r', has(['AGENTS.md', 'CLAUDE.md'])), /AGENTS\.md$/);
  assert.match(instructionsFile('/r', has(['CLAUDE.md'])), /CLAUDE\.md$/);
  assert.match(instructionsFile('/r', has([])), /AGENTS\.md$/);
});

test('payload validation', () => {
  assert.deepEqual(validatePayload({ choices: { a: 'x', b: ['1', '2'], c: true } }), { choices: { a: 'x', b: ['1', '2'], c: true }, notes: '' });
  assert.throws(() => validatePayload({}), /choices/);
  assert.throws(() => validatePayload({ choices: {} }), /empty/);
  assert.throws(() => validatePayload({ choices: { a: { nested: 1 } } }), /must be/);
  assert.throws(() => validatePayload({ choices: { a: 'x' }, notes: 3 }), /notes/);
});

test('static paths never escape the page directory', () => {
  assert.equal(safeJoin('/srv/p', '/'), '/srv/p/index.html');
  assert.equal(safeJoin('/srv/p', '/a/b.css?x=1'), '/srv/p/a/b.css');
  assert.equal(safeJoin('/srv/p', '/../etc/passwd'), null);
  assert.equal(safeJoin('/srv/p', '/%2e%2e/secret'), null);
});

test('config CLI: enable writes local config and AGENTS block, disable keeps block, remove-instructions drops it', () => {
  const root = tmp();
  execFileSync('git', ['init', '-q', root]);
  writeFileSync(join(root, 'AGENTS.md'), '# Rules\n');
  const run = (...a) => execFileSync('node', [SCRIPT, 'config', ...a, '--root', root], { encoding: 'utf8' });
  assert.match(run('enable', '--exclude'), /ENABLED[\s\S]*INSTRUCTIONS AGENTS\.md[\s\S]*EXCLUDED/);
  assert.equal(JSON.parse(readFileSync(join(root, '.agents/project.local.json'), 'utf8')).decisionPage.enabled, true);
  assert.ok(readFileSync(join(root, 'AGENTS.md'), 'utf8').includes(BLOCK_START));
  assert.equal(JSON.parse(run('status')).gitIgnored, true);
  run('disable');
  assert.equal(JSON.parse(readFileSync(join(root, '.agents/project.local.json'), 'utf8')).decisionPage.enabled, false);
  assert.ok(readFileSync(join(root, 'AGENTS.md'), 'utf8').includes(BLOCK_START));
  assert.match(run('remove-instructions'), /REMOVED/);
  assert.equal(readFileSync(join(root, 'AGENTS.md'), 'utf8'), '# Rules\n');
});

function startServer(dir, extra = []) {
  const child = spawn('node', [SCRIPT, 'serve', dir, '--open', 'none', '--port', '0', ...extra], { env: { ...process.env, TERM_PROGRAM: 'test' } });
  let buf = '';
  const lines = [];
  const waiters = [];
  child.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); lines.push(l); waiters.forEach(w => w()); } });
  const waitFor = re => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error(`timeout waiting ${re}: ${lines.join(' | ')}`)), 5000); const check = () => { const l = lines.find(x => re.test(x)); if (l) { clearTimeout(t); res(l); } }; waiters.push(check); check(); });
  const exited = new Promise(res => child.on('exit', code => res(code)));
  return { child, waitFor, exited, lines };
}

test('serve: rejects bad token and bad body, then stops itself after the first valid decision', async () => {
  const dir = tmp();
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>t</title>');
  const s = startServer(dir);
  const url = new URL((await s.waitFor(/^READY /)).slice(6));
  const token = url.searchParams.get('token');
  const base = `http://127.0.0.1:${url.port}`;
  assert.equal((await fetch(base + '/')).status, 200);
  assert.equal((await fetch(base + '/../../etc/passwd')).status, 404);
  const post = (body, t = token) => fetch(base + '/api/choice', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Decision-Token': t }, body });
  assert.equal((await post('{"choices":{"a":"1"}}', 'wrong')).status, 403);
  assert.equal((await post('{"nope":1}')).status, 400);
  const ok = await post(JSON.stringify({ choices: { a: '1' }, notes: 'n' }));
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).closeWindow, true);
  const line = await s.waitFor(/^DECISION /);
  assert.deepEqual(JSON.parse(line.slice(9)).choices, { a: '1' });
  assert.equal(await s.exited, 0);
  assert.equal(JSON.parse(readFileSync(join(dir, 'decision.json'), 'utf8')).notes, 'n');
});

test('serve: times out with exit 4 and refuses a directory without index.html', async () => {
  const dir = tmp();
  writeFileSync(join(dir, 'index.html'), 'x');
  const s = startServer(dir, ['--timeout', '1']);
  await s.waitFor(/^TIMEOUT /);
  assert.equal(await s.exited, 4);
  const empty = tmp();
  mkdirSync(join(empty, 'x'));
  const e = startServer(empty);
  assert.equal(await e.exited, 1);
  assert.ok(!existsSync(join(empty, 'decision.json')));
});

test('serve (orca): tab create that waits for the page does not deadlock, and the tab is closed after the answer', async () => {
  const dir = tmp();
  writeFileSync(join(dir, 'index.html'), 'page');
  const calls = join(dir, 'calls.log');
  // Fake Orca CLI: like the real one, `tab create` only returns after loading the URL.
  const fake = join(dir, 'fake-orca.mjs');
  writeFileSync(fake, `#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
const a = process.argv.slice(2);
appendFileSync(${JSON.stringify(calls)}, a.join(' ') + '\\n');
if (a[0] === 'tab' && a[1] === 'create') {
  const r = await fetch(a[a.indexOf('--url') + 1]);
  if (!r.ok) process.exit(9);
  console.log(JSON.stringify({ ok: true, result: { browserPageId: 'page-123' } }));
} else console.log(JSON.stringify({ ok: true }));
`);
  execFileSync('chmod', ['+x', fake]);
  const child = spawn('node', [SCRIPT, 'serve', dir, '--open', 'auto', '--port', '0'], { env: { ...process.env, TERM_PROGRAM: 'Orca', ORCA_CLI_COMMAND: fake } });
  let outText = '';
  child.stdout.on('data', d => { outText += d; });
  const until = re => new Promise((res, rej) => { const t0 = Date.now(); const iv = setInterval(() => { const m = outText.match(re); if (m) { clearInterval(iv); res(m); } else if (Date.now() - t0 > 8000) { clearInterval(iv); rej(new Error(outText)); } }, 50); });
  await until(/OPENED orca page-123/);
  const url = new URL(outText.match(/READY (\S+)/)[1]);
  const r = await fetch(`http://127.0.0.1:${url.port}/api/choice`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Decision-Token': url.searchParams.get('token') }, body: '{"choices":{"x":"y"}}' });
  assert.equal((await r.json()).closeWindow, false);
  const code = await new Promise(res => child.on('exit', res));
  assert.equal(code, 0);
  assert.match(outText, /CLOSED orca page-123[\s\S]*DECISION /);
  assert.match(readFileSync(calls, 'utf8'), /tab close --page page-123 --json/);
});
