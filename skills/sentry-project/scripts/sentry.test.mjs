import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Client, applyPlan, environment, validatePlan, writeEnv, projectSummary, eventSummary, windowEvents, config } from './sentry.mjs';

test('window reads cap pagination, filter identity/time, deduplicate and never follow provider URLs', async () => {
  const release = `example-app@${'a'.repeat(40)}`, paths = [];
  const event = (id, env = 'staging', timestamp = '2026-10-11T21:30:00Z') => ({ eventID: ({ one: '1', local: '2', outside: '3' }[id]).repeat(32), timestamp, message: 'secret', tags: [{ key: 'environment', value: env }, { key: 'release', value: release }, { key: 'service', value: 'worker' }, { key: 'phase', value: 'secret' }, { key: 'transport_code', value: 'secret' }] });
  const client = { org: 'test-org', request: async path => {
    paths.push(path);
    return { data: [event('one'), event('local', 'develop'), event('outside', 'staging', '2026-10-11T22:00:00Z')], link: `<https://evil.invalid/?token=secret>; rel="next"; results="true"; cursor="page${paths.length}"` };
  } };
  const result = await windowEvents(client, 'example-workers', { start: '2026-10-11T21:00:00Z', end: '2026-10-11T22:00:00Z', environment: 'staging', release });
  assert.equal(paths.length, 2);
  assert(paths.every(p => p.startsWith('/projects/test-org/example-workers/events/?')));
  assert.match(paths[1], /cursor=page1/);
  assert.equal(result.events.length, 1);
  assert.equal(result.excluded, 4);
  assert.equal(result.countsPartial, true);
  assert(!JSON.stringify(result).includes('secret'));
  await assert.rejects(windowEvents(client, 'example-workers', { start: '2026-10-11T20:00:00Z', end: '2026-10-11T22:00:00Z', environment: 'staging', release }), /uma hora/);
  assert.equal(paths.length, 2);
});

test('event inspection excludes request/user/message/stack and arbitrary context', () => {
  const safe = eventSummary({ eventID: 'abc', timestamp: 'now', message: 'secret', request: 'secret',
    tags: [{key:'phase',value:'fetch'},{key:'token',value:'secret'}],
    contexts: {internal_query: {elapsedMs:42,timeoutAborted:false,httpStatus:null,token:'secret',timeoutMs:'secret'}} });
  assert.equal(safe.internalQuery, undefined);
  assert.deepEqual(safe.tags, []);
  assert.ok(!JSON.stringify(safe).includes('secret'));
  assert.equal(safe.integrationSmoke, false);
  assert.equal(eventSummary({title:'sentry_integration_smoke'}).integrationSmoke, true);
  assert.equal(eventSummary({message:{formatted:'sentry_integration_smoke'}}).integrationSmoke, true);
  assert.equal(eventSummary({entries:[{type:'message',data:{formatted:'sentry_integration_smoke',token:'secret'}}]}).integrationSmoke, true);
});
test('detail receipt confirms original exceptions and cause stacks without exposing their contents', () => {
  const event=eventSummary({entries:[{type:'exception',data:{values:[{value:'fixture private detail',stacktrace:{frames:[{filename:'private'}]}},{value:'cause fixture detail',mechanism:{parent_id:0},stacktrace:{frames:[{}]}}]}}]});
  assert.deepEqual(event.errorDetails,{exceptionCount:2,stackFrameCount:2,messagePresent:true,linkedCausePresent:true});
  assert(!JSON.stringify(event).includes('private'));
});

test('project inspection excludes tokens, DSNs and arbitrary provider fields', () => {
  const result = projectSummary({ id: '1', slug: 'app', securityToken: 'private', dsn: 'private',
    options: { highlightTags: ['service'], dataScrubber: true, dataScrubberDefaults: true,
      scrubIPAddresses: true, secret: 'private' } });
  assert.deepEqual(result, { id: '1', slug: 'app', highlightTags: ['service'],
    dataScrubber: true, dataScrubberDefaults: true, scrubIPAddresses: true });
  assert.ok(!JSON.stringify(result).includes('private'));
});

const credentials = { SENTRY_ORG_SLUG: 'test-org', SENTRY_ORG_TOKEN: 'fake-org', SENTRY_USER_TOKEN: 'fake-user' };
const response = (data, status = 200, link) => new Response(JSON.stringify(data), { status, headers: link ? { link } : {} });
const plan = () => ({ org: 'test-org', scenario: 'economy', projects: [{ slug: 'app', action: 'create', team: 'team', name: 'Application', platform: 'python', services: ['worker'], settings: { defaultEnvironment: 'develop' } }] });

test('accepts project-defined environment identifiers', () => {
  for (const value of ['develop', 'development', 'test', 'preview-42', 'production']) assert.equal(environment(value), value);
  for (const value of [undefined, '', 'bad environment', 'bad\nvalue', 'x'.repeat(201)]) assert.throws(() => environment(value));
});
test('read fallback only on permission failure; never on mutations', async () => {
  const calls = [];
  const client = new Client(credentials, 'auto', async (_, options) => { calls.push(options.headers.Authorization); return response([], calls.length === 1 ? 403 : 200); });
  await client.request('/organizations/test-org/projects/');
  assert.deepEqual(calls, ['Bearer fake-org', 'Bearer fake-user']);
  calls.length = 0;
  await assert.rejects(client.request('/teams/test-org/team/projects/', 'POST', {}), /HTTP 403/);
  assert.equal(calls.length, 1);
});
test('paginates without following URLs from the provider', async () => {
  const urls = [];
  const client = new Client(credentials, 'org', async url => { urls.push(url); return urls.length === 1 ? response([{ slug: 'one' }], 200, '<https://evil.invalid/>; rel="next"; results="true"; cursor="abc:1"') : response([{ slug: 'two' }]); });
  assert.equal((await client.list('/organizations/test-org/projects/')).length, 2);
  assert.equal(urls[1], 'https://sentry.io/api/0/organizations/test-org/projects/?cursor=abc%3A1');
});
test('preview makes no mutations; approved apply creates then configures', async () => {
  const methods = [];
  const client = new Client(credentials, 'org', async (url, options) => {
    methods.push(options.method);
    if (options.method !== 'GET') return response({ slug: 'app' });
    return response(url.includes('/teams/') ? [{ slug: 'team' }] : []);
  });
  await applyPlan(client, plan(), false, () => {});
  assert.deepEqual(methods, ['GET', 'GET']);
  methods.length = 0;
  await applyPlan(client, plan(), true, () => {});
  assert.deepEqual(methods, ['GET', 'GET', 'POST', 'PUT']);
});
test('preflight prevents partial mutation for missing reuse, org mismatch or existing create', async () => {
  const p = plan(); p.scenario = 'balanced'; p.projects.push({ slug: 'absent', action: 'reuse', services: ['api'] });
  let writes = 0;
  const client = new Client(credentials, 'org', async (url, options) => { if (options.method !== 'GET') writes++; return response(url.includes('/teams/') ? [{ slug: 'team' }] : []); });
  await assert.rejects(applyPlan(client, p, true, () => {}), /reutilização/);
  assert.equal(writes, 0);
  assert.throws(() => validatePlan(plan(), 'other-org'));
  const collision = new Client(credentials, 'org', async url => response(url.includes('/teams/') ? [{ slug: 'team' }] : [{ slug: 'app' }]));
  await assert.rejects(applyPlan(collision, plan(), true, () => {}), /já existe/);
});
test('economy has one project and each service has one destination', () => {
  const p = plan(); p.projects.push({ slug: 'second', action: 'reuse', services: ['worker'] });
  assert.throws(() => validatePlan(p, 'test-org'), /único/);
  p.scenario = 'balanced';
  assert.throws(() => validatePlan(p, 'test-org'), /duplicado/);
});
test('uncertain mutation is not retried and does not expose error payload', async () => {
  let calls = 0;
  const client = new Client(credentials, 'auto', async () => { calls++; throw Error('fake-user provider payload'); });
  await assert.rejects(client.request('/teams/test-org/team/projects/', 'POST', {}), err => err.message.includes('incerto') && !err.message.includes('fake-user'));
  assert.equal(calls, 1);
});
test('env writes preserve unrelated secrets, remove duplicate keys, ignore files and reject unsafe destinations', () => {
  const root = mkdtempSync(join(tmpdir(), 'sentry-skill-'));
  try {
    execFileSync('git', ['init', '-q', root]); mkdirSync(join(root, 'app'));
    writeFileSync(join(root, 'app/.env.local'), 'UNRELATED="private"\nSENTRY_ENVIRONMENT=old\nexport SENTRY_ENVIRONMENT=other\n');
    const vars = { SENTRY_ENVIRONMENT: 'staging', SENTRY_DSN: 'https://fake@sentry.io/1', SENTRY_SERVICE: 'api' };
    writeEnv(root, 'app/.env.local', vars, false);
    assert.match(readFileSync(join(root, 'app/.env.local'), 'utf8'), /old/);
    const output = writeEnv(root, 'app/.env.local', vars, true);
    const content = readFileSync(join(root, 'app/.env.local'), 'utf8');
    assert.match(content, /UNRELATED="private"/);
    assert.equal((content.match(/SENTRY_ENVIRONMENT=/g) ?? []).length, 1);
    assert.match(content, /SENTRY_ENVIRONMENT="staging"/);
    assert.ok(!JSON.stringify(output).includes('https://'));
    execFileSync('git', ['check-ignore', '-q', 'app/.env.local'], { cwd: root });
    assert.throws(() => writeEnv(root, '../.env', vars, true));
    assert.throws(() => writeEnv(root, 'app/.env', { SENTRY_USER_TOKEN: 'bad' }, true));
    writeFileSync(join(root, '.env'), 'A=B'); execFileSync('git', ['add', '.env'], { cwd: root });
    assert.throws(() => writeEnv(root, '.env', vars, true), /rastreado/);
    symlinkSync(tmpdir(), join(root, 'outside'));
    assert.throws(() => writeEnv(root, 'outside/.env', vars, true), /symlink/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('installation location does not determine the workspace root', () => {
  const root = mkdtempSync(join(tmpdir(), 'sentry-portable-'));
  try {
    execFileSync('git', ['init', '-q', root]);
    const script = `import { ROOT } from ${JSON.stringify(new URL('./sentry.mjs', import.meta.url).href)}; console.log(ROOT);`;
    const detected = execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: root, encoding: 'utf8' }).trim();
    assert.equal(detected, realpathSync(root));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('symlinked gitignore is rejected before writing secrets or outside files', () => {
  const root = mkdtempSync(join(tmpdir(), 'sentry-ignore-'));
  const outside = mkdtempSync(join(tmpdir(), 'sentry-outside-'));
  try {
    execFileSync('git', ['init', '-q', root]);
    const victim = join(outside, 'ignore'); writeFileSync(victim, 'unchanged\n');
    symlinkSync(victim, join(root, '.gitignore'));
    assert.throws(() => writeEnv(root, '.env.local', { SENTRY_ENVIRONMENT: 'production' }, true), /symlink/);
    assert.equal(readFileSync(victim, 'utf8'), 'unchanged\n');
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
});



test('config loads env files, agent JSON and process values with explicit precedence', () => {
  const root = mkdtempSync(join(tmpdir(), 'sentry-config-'));
  try {
    mkdirSync(join(root, '.claude'));
    writeFileSync(join(root, '.env'), 'SENTRY_ORG_SLUG=base\nSENTRY_ORG_TOKEN=fake-base\nUNRELATED=private\n');
    writeFileSync(join(root, '.env.local'), 'SENTRY_ORG_SLUG=local\nSENTRY_RELEASE=app@1.2.0\n');
    assert.equal(config({ root, env: {} }).SENTRY_ORG_SLUG, 'local');
    writeFileSync(join(root, '.claude/settings.local.json'), JSON.stringify({ permissions: {} }));
    assert.equal(config({ root, env: {} }).SENTRY_ORG_SLUG, 'local');
    writeFileSync(join(root, '.claude/settings.local.json'), JSON.stringify({ env: { SENTRY_ORG_SLUG: 'agent', SENTRY_USER_TOKEN: 'fake-agent', UNRELATED: 'private' }, permissions: {} }));
    assert.equal(config({ root, env: {} }).SENTRY_ORG_SLUG, 'agent');
    const result = config({ root, env: { SENTRY_ORG_SLUG: 'process', SENTRY_ORG_TOKEN: '' } });
    assert.equal(result.SENTRY_ORG_SLUG, 'process');
    assert.equal(result.SENTRY_ORG_TOKEN, '');
    assert.equal(result.SENTRY_USER_TOKEN, 'fake-agent');
    assert.equal(result.SENTRY_RELEASE, 'app@1.2.0');
    assert.equal(result.UNRELATED, undefined);
    writeFileSync(join(root, 'custom.json'), JSON.stringify({ env: { SENTRY_ORG_SLUG: 'custom' } }));
    assert.equal(config({ root, env: { SENTRY_AGENT_CONFIG_FILE: 'custom.json' } }).SENTRY_ORG_SLUG, 'custom');
    assert.equal(config({ root, env: { SENTRY_AGENT_CONFIG_FILE: 'missing.json' }, configFile: 'custom.json' }).SENTRY_ORG_SLUG, 'custom');
    writeFileSync(join(root, '.env.local'), 'SENTRY_AGENT_CONFIG_FILE=custom.json\n');
    assert.equal(config({ root, env: {} }).SENTRY_ORG_SLUG, 'custom');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('bad agent configuration fails without echoing values or parse contents', () => {
  const root = mkdtempSync(join(tmpdir(), 'sentry-config-invalid-'));
  try {
    writeFileSync(join(root, '.env'), 'SENTRY_ORG_SLUG=test-org\n');
    for (const content of ['{"private-secret":', '{"env":[]}', '{"env":{"SENTRY_ORG_TOKEN":42}}']) {
      writeFileSync(join(root, 'agent.json'), content);
      assert.throws(() => config({ root, env: {}, configFile: 'agent.json' }), error => !error.message.includes('private-secret'));
    }
    assert.throws(() => config({ root, env: {}, configFile: 'missing.json' }), /inválida ou ilegível/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('installed CLI uses target workspace configuration from a nested directory', () => {
  const root = mkdtempSync(join(tmpdir(), 'sentry-cli-'));
  try {
    execFileSync('git', ['init', '-q', root]); mkdirSync(join(root, 'nested'));
    writeFileSync(join(root, '.env.local'), 'SENTRY_ORG_SLUG=workspace-org\nSENTRY_RELEASE=app@v2\n');
    const script = `import { ROOT, config } from ${JSON.stringify(new URL('./sentry.mjs', import.meta.url).href)}; const c = config({env: {}}); console.log(JSON.stringify({root: ROOT, org: c.SENTRY_ORG_SLUG, release: c.SENTRY_RELEASE}));`;
    const result = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: join(root, 'nested'), encoding: 'utf8' }));
    assert.deepEqual(result, { root: realpathSync(root), org: 'workspace-org', release: 'app@v2' });
  } finally { rmSync(root, { recursive: true, force: true }); }
});
