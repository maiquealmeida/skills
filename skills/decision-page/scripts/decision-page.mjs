#!/usr/bin/env node
// decision-page: serves an interactive decision page, opens it (Orca browser tab or the
// default browser), waits for the user's submission, closes what it opened, stops itself
// and prints the answer. Also manages the per-project "active by default" config.
// Pure Node 18+, no dependencies.

import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { execFile, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CONFIG_KEY = 'decisionPage';
export const CONFIG_FILE = join('.agents', 'project.local.json');
export const BLOCK_START = '<!-- decision-page:start -->';
export const BLOCK_END = '<!-- decision-page:end -->';
export const DEFAULTS = Object.freeze({ enabled: false, dir: 'temp/decision-pages', open: 'auto' });
const MAX_BODY = 64 * 1024;
const OPEN_MODES = ['auto', 'orca', 'browser', 'none'];

export const AGENTS_BLOCK = `${BLOCK_START}
## Decision page

When \`${CONFIG_FILE.split(sep).join('/')}\` has \`"${CONFIG_KEY}": { "enabled": true }\`, do not ask the user questions in chat or through question tools (\`AskUserQuestion\`, \`ask_user\`, \`request_user_input\` or any equivalent). Load the \`decision-page\` skill instead and present every pending decision, confirmation or clarification as an interactive page, then wait for the submitted answer before continuing. Inside Orca the page opens as an Orca browser tab; elsewhere, in the default browser. Fall back to asking in chat only when the skill or its script fails, and say why. When the flag is absent or \`false\`, ask normally.
${BLOCK_END}`;

// ---------- pure helpers (exported for tests) ----------

export function insideOrca(env = process.env) {
  return Boolean(env.ORCA_WORKTREE_ID || env.ORCA_TERMINAL_HANDLE || env.TERM_PROGRAM === 'Orca');
}

export function orcaCommand(env = process.env) {
  return env.ORCA_CLI_COMMAND || 'orca';
}

export function resolveOpenMode(requested, env = process.env) {
  if (!OPEN_MODES.includes(requested)) throw new Error(`--open must be one of ${OPEN_MODES.join(', ')}`);
  if (requested !== 'auto') return requested;
  return insideOrca(env) ? 'orca' : 'browser';
}

export function readConfig(text) {
  if (!text || !text.trim()) return {};
  const data = JSON.parse(text);
  if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new Error(`${CONFIG_FILE} must hold a JSON object`);
  return data;
}

export function effectiveConfig(data) {
  const own = data && typeof data[CONFIG_KEY] === 'object' && data[CONFIG_KEY] !== null ? data[CONFIG_KEY] : {};
  return { ...DEFAULTS, ...own };
}

export function patchConfig(data, patch) {
  const current = data[CONFIG_KEY] && typeof data[CONFIG_KEY] === 'object' ? data[CONFIG_KEY] : {};
  return { ...data, [CONFIG_KEY]: { ...current, ...patch } };
}

export function upsertBlock(text, block = AGENTS_BLOCK) {
  const start = text.indexOf(BLOCK_START);
  const end = text.indexOf(BLOCK_END);
  if (start !== -1 && end > start) return text.slice(0, start) + block + text.slice(end + BLOCK_END.length);
  const sepText = text.length === 0 ? '' : text.endsWith('\n\n') ? '' : text.endsWith('\n') ? '\n' : '\n\n';
  return `${text}${sepText}${block}\n`;
}

export function removeBlock(text) {
  const start = text.indexOf(BLOCK_START);
  const end = text.indexOf(BLOCK_END);
  if (start === -1 || end < start) return text;
  const before = text.slice(0, start).replace(/\n+$/, '\n');
  const after = text.slice(end + BLOCK_END.length).replace(/^\n+/, '');
  return (before + (after ? `\n${after}` : '')).replace(/^\n$/, '');
}

// AGENTS.md wins; CLAUDE.md only when it is the sole instructions file.
export function instructionsFile(root, exists = existsSync) {
  const agents = join(root, 'AGENTS.md');
  const claude = join(root, 'CLAUDE.md');
  if (exists(agents) || !exists(claude)) return agents;
  return claude;
}

export function validatePayload(data) {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new Error('body must be a JSON object');
  const { choices } = data;
  if (typeof choices !== 'object' || choices === null || Array.isArray(choices)) throw new Error('expected { "choices": { ... } }');
  if (Object.keys(choices).length === 0) throw new Error('choices is empty');
  for (const [k, v] of Object.entries(choices)) {
    const ok = ['string', 'number', 'boolean'].includes(typeof v) || (Array.isArray(v) && v.every(x => typeof x === 'string'));
    if (!ok) throw new Error(`choice "${k}" must be a string, number, boolean or list of strings`);
  }
  if (data.notes !== undefined && typeof data.notes !== 'string') throw new Error('notes must be a string');
  return { choices, notes: data.notes ?? '' };
}

export function findRoot(start) {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, '.git'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(start);
    dir = parent;
  }
}

export function safeJoin(base, urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const full = resolve(base, clean);
  if (full !== base && !full.startsWith(base + sep)) return null;
  return full;
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

// ---------- side effects ----------

function writeAtomic(file, text) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
}

function out(line) { process.stdout.write(line + '\n'); }

// Async on purpose: `orca tab create` waits for the page to load, and the page is served by
// this same process. A synchronous spawn blocks the event loop and deadlocks until timeout
// (observed: ETIMEDOUT after 20 s, tab left open).
function orcaJson(args, env) {
  return new Promise((res, rej) => {
    execFile(orcaCommand(env), [...args, '--json'], { encoding: 'utf8', timeout: 30000 }, (err, stdout, stderr) => {
      if (err) return rej(new Error((stderr || err.message).trim()));
      try { res(JSON.parse(stdout)); } catch { rej(new Error('orca returned invalid JSON')); }
    });
  });
}

async function openOrcaTab(url, env) {
  const data = await orcaJson(['tab', 'create', '--url', url], env);
  const id = data?.result?.browserPageId;
  if (!data.ok || !id) throw new Error('orca tab create returned no browserPageId');
  return id;
}

async function closeOrcaTab(id, env) {
  try { return (await orcaJson(['tab', 'close', '--page', id], env)).ok === true; } catch { return false; }
}

function openBrowser(url) {
  const [cmd, args] = process.platform === 'darwin' ? ['open', [url]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]]
    : ['xdg-open', [url]];
  const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
  child.on('error', () => {});
  child.unref();
}

export function serve({ dir, port = 0, open = 'auto', timeout = 3600, env = process.env, log = out }) {
  const base = resolve(dir);
  if (!existsSync(join(base, 'index.html'))) throw new Error(`${join(base, 'index.html')} not found`);
  const token = randomBytes(16).toString('hex');
  const mode = resolveOpenMode(open, env);
  let opened = null; // { kind: 'orca', id } | { kind: 'browser' }
  let done = false;
  let opening = Promise.resolve(); // a fast answer may arrive before the tab id is known

  return new Promise((resolvePromise) => {
    const finish = async (code, line) => {
      if (done) return; done = true;
      clearTimeout(timer);
      server.close();
      await opening;
      if (opened?.kind === 'orca') log(await closeOrcaTab(opened.id, env) ? `CLOSED orca ${opened.id}` : `WARN could not close orca tab ${opened.id}`);
      server.closeAllConnections?.();
      if (line) log(line);
      resolvePromise(code);
    };

    const server = http.createServer((req, res) => {
      const json = (status, body) => { const b = JSON.stringify(body); res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b), 'Cache-Control': 'no-store' }); res.end(b); };
      if (req.method === 'GET' && req.url === '/api/health') return json(200, { ok: true });
      if (req.method === 'POST' && req.url === '/api/choice') {
        if (req.headers['x-decision-token'] !== token) return json(403, { error: 'invalid token' });
        let size = 0; const chunks = [];
        req.on('data', c => { size += c.length; if (size > MAX_BODY) { json(413, { error: 'body too large' }); req.destroy(); } else chunks.push(c); });
        req.on('end', () => {
          if (size > MAX_BODY || done) return;
          let payload;
          try { payload = validatePayload(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
          catch (e) { return json(400, { error: e.message }); }
          const record = { at: new Date().toISOString(), ...payload };
          writeAtomic(join(base, 'decision.json'), JSON.stringify(record, null, 2) + '\n');
          appendFileSync(join(base, 'decisions.jsonl'), JSON.stringify(record) + '\n');
          res.on('finish', () => setTimeout(() => finish(0, `DECISION ${JSON.stringify(record)}`), 150));
          json(200, { ok: true, received: record.at, closeWindow: opened?.kind !== 'orca' });
        });
        return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(405, { error: 'method not allowed' });
      const file = safeJoin(base, req.url);
      if (!file || !existsSync(file) || !statSync(file).isFile()) return json(404, { error: 'not found' });
      res.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : readFileSync(file));
    });

    const timer = setTimeout(() => finish(4, `TIMEOUT no decision after ${timeout}s`), timeout * 1000);
    for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, () => finish(130, 'INTERRUPTED'));

    server.on('error', e => { log(`ERROR ${e.message}`); finish(1); });
    server.listen(port, '127.0.0.1', async () => {
      const url = `http://127.0.0.1:${server.address().port}/?token=${token}`;
      log(`READY ${url}`);
      if (mode === 'orca') {
        let release; opening = new Promise(r => { release = r; });
        try { opened = { kind: 'orca', id: await openOrcaTab(url, env) }; log(`OPENED orca ${opened.id}`); }
        catch (e) { log(`WARN orca tab failed (${String(e.message).trim()}); falling back to the default browser`); openBrowser(url); opened = { kind: 'browser' }; log('OPENED browser'); }
        finally { release(); }
      } else if (mode === 'browser') { openBrowser(url); opened = { kind: 'browser' }; log('OPENED browser'); }
      else log('OPENED none');
    });
  });
}

function configCommand(action, root, flags) {
  const file = join(root, CONFIG_FILE);
  const data = readConfig(existsSync(file) ? readFileSync(file, 'utf8') : '');
  const ignored = () => spawnSync('git', ['-C', root, 'check-ignore', '-q', CONFIG_FILE]).status === 0;
  if (action === 'status') {
    const cfg = effectiveConfig(data);
    const instr = instructionsFile(root);
    const hasBlock = existsSync(instr) && readFileSync(instr, 'utf8').includes(BLOCK_START);
    out(JSON.stringify({ root, file: CONFIG_FILE, ...cfg, instructions: hasBlock ? instr.slice(root.length + 1) : null, gitIgnored: ignored(), insideOrca: insideOrca() }, null, 2));
    return 0;
  }
  if (action === 'enable' || action === 'disable') {
    const patch = { enabled: action === 'enable' };
    if (flags.dir) patch.dir = flags.dir;
    if (flags.open) { resolveOpenMode(flags.open); patch.open = flags.open; }
    writeAtomic(file, JSON.stringify(patchConfig(data, patch), null, 2) + '\n');
    out(`${action === 'enable' ? 'ENABLED' : 'DISABLED'} ${CONFIG_FILE}`);
    if (action === 'enable') {
      const instr = instructionsFile(root);
      const before = existsSync(instr) ? readFileSync(instr, 'utf8') : '';
      const after = upsertBlock(before);
      if (after !== before) { writeAtomic(instr, after); out(`INSTRUCTIONS ${instr.slice(root.length + 1)}`); }
      else out(`INSTRUCTIONS ${instr.slice(root.length + 1)} (already present)`);
    }
    if (flags.exclude && !ignored()) {
      const exclude = join(root, '.git', 'info', 'exclude');
      if (existsSync(join(root, '.git'))) { mkdirSync(dirname(exclude), { recursive: true }); appendFileSync(exclude, `\n${CONFIG_FILE.split(sep).join('/')}\n`); out('EXCLUDED .git/info/exclude'); }
    }
    if (!ignored()) out(`NOTE ${CONFIG_FILE} is not git-ignored; it is meant to stay local (rerun with --exclude to add it to .git/info/exclude)`);
    return 0;
  }
  if (action === 'remove-instructions') {
    const instr = instructionsFile(root);
    if (!existsSync(instr)) { out('INSTRUCTIONS none'); return 0; }
    const before = readFileSync(instr, 'utf8');
    const after = removeBlock(before);
    if (after !== before) { writeAtomic(instr, after); out(`REMOVED block from ${instr.slice(root.length + 1)}`); }
    else out('INSTRUCTIONS none');
    return 0;
  }
  throw new Error(`unknown config action "${action}" (status | enable | disable | remove-instructions)`);
}

function parseArgs(argv) {
  const pos = []; const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) flags[k] = v;
      else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) flags[k] = argv[++i];
      else flags[k] = true;
    } else pos.push(a);
  }
  return { pos, flags };
}

const USAGE = `usage:
  decision-page.mjs serve <dir> [--open auto|orca|browser|none] [--port 0] [--timeout 3600]
  decision-page.mjs config status|enable|disable|remove-instructions [--root <dir>] [--dir <path>] [--open <mode>] [--exclude]
  decision-page.mjs detect`;

async function main(argv) {
  const { pos, flags } = parseArgs(argv);
  const [cmd, arg] = pos;
  const root = findRoot(flags.root || process.cwd());
  if (cmd === 'serve') {
    if (!arg) throw new Error('serve needs the page directory');
    const cfg = effectiveConfig(readConfig(existsSync(join(root, CONFIG_FILE)) ? readFileSync(join(root, CONFIG_FILE), 'utf8') : ''));
    return serve({ dir: arg, port: Number(flags.port ?? 0), open: flags.open || cfg.open, timeout: Number(flags.timeout ?? 3600) });
  }
  if (cmd === 'config') return configCommand(arg || 'status', root, flags);
  if (cmd === 'detect') { out(resolveOpenMode('auto')); return 0; }
  process.stderr.write(USAGE + '\n');
  return 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(code => process.exit(code ?? 0), e => { process.stderr.write(`ERROR ${e.message}\n`); process.exit(1); });
}
