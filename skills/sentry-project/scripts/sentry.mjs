import { readFileSync, existsSync, realpathSync, writeFileSync, chmodSync, renameSync, unlinkSync, lstatSync } from 'node:fs';
import { resolve, dirname, relative, isAbsolute, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { execFileSync } from 'node:child_process';

// Workspace location is independent from the installed skill location.
export const ROOT = realpathSync(execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim());
const slugPattern = /^[a-z0-9][a-z0-9_-]*$/;
const settingsAllowed = new Set(['defaultEnvironment', 'highlightTags', 'dataScrubber', 'dataScrubberDefaults', 'scrubIPAddresses', 'sensitiveFields', 'allowedDomains', 'resolveAge']);
const fail = (message) => { throw new Error(message); };
export function identifier(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.@+:/-]{0,199}$/.test(value);
}
export function environment(value) {
  if (!identifier(value)) fail('Ambiente obrigatório: identificador de até 200 caracteres.');
  return value;
}
function slug(value) {
  if (typeof value !== 'string' || !slugPattern.test(value)) fail('Slug inválido.');
  return value;
}
const configKeys = ['SENTRY_ORG_SLUG', 'SENTRY_ORG_ID', 'SENTRY_ORG_TOKEN', 'SENTRY_USER_TOKEN',
  'SENTRY_ENVIRONMENT', 'SENTRY_SERVICE', 'SENTRY_RELEASE', 'SENTRY_PROJECT_SLUG',
  'SENTRY_SPAN_OP', 'SENTRY_SPAN_NAMES'];
export function config({ root = ROOT, env = process.env, configFile } = {}) {
  const values = {};
  const merge = source => {
    for (const key of configKeys) {
      if (!Object.hasOwn(source, key)) continue;
      if (typeof source[key] !== 'string') fail('Configuração Sentry deve conter valores string.');
      values[key] = source[key];
    }
  };
  let fileValues = {};
  for (const name of ['.env', '.env.local']) {
    const path = resolve(root, name);
    if (existsSync(path)) {
      try { fileValues = { ...fileValues, ...parseEnv(readFileSync(path, 'utf8')) }; }
      catch { fail('Arquivo de ambiente inválido ou ilegível.'); }
    }
  }
  merge(fileValues);
  // Select one JSON source; do not silently mix credentials from multiple agents.
  const selected = configFile ?? env.SENTRY_AGENT_CONFIG_FILE ?? fileValues.SENTRY_AGENT_CONFIG_FILE;
  const path = resolve(root, selected || '.claude/settings.local.json');
  if (selected || existsSync(path)) {
    let data;
    try { data = JSON.parse(readFileSync(path, 'utf8')); }
    catch { fail('Configuração JSON do agente inválida ou ilegível.'); }
    if (!data || typeof data !== 'object' || Array.isArray(data) || (data.env !== undefined && (!data.env || typeof data.env !== 'object' || Array.isArray(data.env)))) fail('Configuração JSON deve conter objeto env.');
    merge(data.env ?? {});
  }
  merge(env); // Empty process values deliberately disable a credential from files.
  slug(values.SENTRY_ORG_SLUG);
  return values;
}
export class Client {
  constructor(values, mode = 'auto', fetcher = fetch) {
    if (!['auto', 'org', 'user'].includes(mode)) fail('--token deve ser auto, org ou user.');
    this.values = values; this.mode = mode; this.fetcher = fetcher;
    this.org = slug(values.SENTRY_ORG_SLUG);
  }
  async request(path, method = 'GET', body) {
    if (!/^\/(organizations|teams|projects)\//.test(path) || path.includes('..') || path.includes('://')) fail('Endpoint não permitido.');
    const selected = this.mode === 'auto' ? (this.values.SENTRY_ORG_TOKEN ? 'org' : 'user') : this.mode;
    const candidates = [selected];
    if (method === 'GET' && this.mode === 'auto' && selected === 'org' && this.values.SENTRY_USER_TOKEN) candidates.push('user');
    for (const [index, type] of candidates.entries()) {
      const token = this.values[type === 'org' ? 'SENTRY_ORG_TOKEN' : 'SENTRY_USER_TOKEN'];
      if (!token) fail(`Token ${type} ausente.`);
      let response;
      try {
        response = await this.fetcher(`https://sentry.io/api/0${path}`, {
          method, redirect: 'error', signal: AbortSignal.timeout(20000),
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
      } catch { fail(`Falha de transporte em ${method}; resultado ${method === 'GET' ? 'não obtido' : 'incerto: consultar estado antes de repetir'}.`); }
      if ([401, 403].includes(response.status) && index + 1 < candidates.length) continue;
      if (!response.ok) fail(`Sentry HTTP ${response.status}, token ${type}, ${method}. Verifique escopos; nenhuma retentativa automática.`);
      let data;
      try { data = await response.json(); } catch { fail('Resposta JSON inválida; consulte estado antes de repetir mutação.'); }
      return { data, link: response.headers.get('link'), token: type };
    }
  }
  async list(path) {
    let cursor; const result = []; const seen = new Set();
    do {
      const { data, link } = await this.request(path + (cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''));
      if (!Array.isArray(data)) fail('Resposta de listagem inválida.');
      result.push(...data);
      const next = link?.split(',').find(part => /rel="next"/.test(part) && /results="true"/.test(part));
      cursor = next?.match(/cursor="([^"]+)"/)?.[1];
      if (cursor && seen.has(cursor)) fail('Cursor repetido na paginação.');
      if (cursor) seen.add(cursor);
    } while (cursor);
    return result;
  }
}
export function validatePlan(plan, org) {
  if (!plan || plan.org !== org) fail('Organização do plano difere da configurada.');
  if (!['economy', 'balanced', 'ideal'].includes(plan.scenario)) fail('Cenário inválido.');
  if (!Array.isArray(plan.projects) || !plan.projects.length) fail('Plano sem projetos.');
  if (plan.scenario === 'economy' && plan.projects.length !== 1) fail('Economia exige um único projeto/DSN.');
  const seen = new Set(); const services = new Set();
  for (const p of plan.projects) {
    slug(p.slug);
    if (seen.has(p.slug)) fail('Projeto duplicado no plano.');
    seen.add(p.slug);
    if (!['create', 'reuse'].includes(p.action)) fail('Ação deve ser create ou reuse.');
    if (p.action === 'create') {
      slug(p.team);
      if (typeof p.name !== 'string' || !p.name.trim() || typeof p.platform !== 'string' || !/^[a-z0-9-]+$/.test(p.platform)) fail('Nome/plataforma ausente ou inválida.');
    }
    if (!Array.isArray(p.services) || !p.services.length || p.services.some(s => typeof s !== 'string' || !/^[a-z0-9_-]+$/.test(s))) fail('Declare os serviços do projeto.');
    for (const service of p.services) {
      if (services.has(service)) fail('Serviço duplicado no mapeamento; use identificadores únicos.');
      services.add(service);
    }
    const settings = p.settings ?? {};
    for (const key of Object.keys(settings)) if (!settingsAllowed.has(key)) fail('Configuração não suportada; amplie script após consultar API.');
    if ('defaultEnvironment' in settings) environment(settings.defaultEnvironment);
    for (const key of ['dataScrubber', 'dataScrubberDefaults', 'scrubIPAddresses']) {
      if (key in settings && typeof settings[key] !== 'boolean') fail('Configuração booleana inválida.');
    }
    for (const key of ['highlightTags', 'sensitiveFields', 'allowedDomains']) {
      if (key in settings && (!Array.isArray(settings[key]) || settings[key].some(v => typeof v !== 'string'))) fail('Lista de configuração inválida.');
    }
    if ('resolveAge' in settings && (!Number.isInteger(settings.resolveAge) || settings.resolveAge < 0)) fail('resolveAge inválido.');
    if (p.default_rules !== undefined && typeof p.default_rules !== 'boolean') fail('default_rules inválido.');
  }
  return plan;
}
export async function applyPlan(client, plan, execute, emit) {
  validatePlan(plan, client.org);
  const existing = await client.list(`/organizations/${client.org}/projects/`);
  const teams = await client.list(`/organizations/${client.org}/teams/`);
  // Preflight all projects before the first mutation.
  for (const p of plan.projects) {
    const found = existing.find(x => x.slug === p.slug);
    if (p.action === 'reuse' && !found) fail('Projeto para reutilização não encontrado.');
    if (p.action === 'create' && found) fail('Projeto já existe: revisar como reuse, sem criação automática.');
    if (p.action === 'create' && !teams.some(t => t.slug === p.team)) fail('Equipe do plano não encontrada.');
  }
  for (const p of plan.projects) {
    if (!execute) { emit({ slug: p.slug, action: p.action, services: p.services, settings: p.settings ?? {}, preview: true }); continue; }
    if (p.action === 'create') {
      const { data } = await client.request(`/teams/${client.org}/${p.team}/projects/`, 'POST', {
        name: p.name, slug: p.slug, platform: p.platform, default_rules: p.default_rules ?? true,
      });
      emit({ slug: data.slug, status: 'created' });
    }
    if (Object.keys(p.settings ?? {}).length) {
      await client.request(`/projects/${client.org}/${p.slug}/`, 'PUT', p.settings);
      emit({ slug: p.slug, status: 'configured' });
    }
  }
}
// Project responses may contain DSNs and tokens: expose only diagnostic settings.
export function projectSummary(data) {
  const options = data.options ?? {};
  return { id: data.id, slug: data.slug,
    highlightTags: data.highlightTags ?? options.highlightTags ?? [],
    dataScrubber: options.dataScrubber ?? data.dataScrubber,
    dataScrubberDefaults: options.dataScrubberDefaults ?? data.dataScrubberDefaults,
    scrubIPAddresses: options.scrubIPAddresses ?? data.scrubIPAddresses };
}
// API receipts intentionally omit payloads; this never filters SDK transport.
export function eventSummary(e) {
  const exception = e.exception ?? e.entries?.find(entry => entry.type === 'exception')?.data;
  const values = Array.isArray(exception?.values) ? exception.values : [];
  const id = e.eventID ?? e.id, timestamp = e.dateCreated ?? e.timestamp;
  return {
    id: typeof id === 'string' && /^[a-f0-9]{32}$/.test(id) ? id : undefined,
    timestamp: typeof timestamp === 'string' && /^\d{4}-\d\d-\d\dT/.test(timestamp) && Number.isFinite(Date.parse(timestamp)) ? new Date(timestamp).toISOString() : undefined,
    integrationSmoke: [e.message, e.message?.formatted, e.title, e.metadata?.value,
      ...(e.entries ?? []).filter(entry => entry.type === 'message').flatMap(entry => [entry.data?.formatted, entry.data?.message])]
      .some(value => value === 'sentry_integration_smoke'),
    tags: Array.isArray(e.tags) ? e.tags.filter(t => t && ['environment', 'service', 'release'].includes(t.key) && identifier(t.value)).map(t => ({ key: t.key, value: t.value })) : [],
    errorDetails: {
      exceptionCount: values.length,
      stackFrameCount: values.reduce((n, v) => n + (Array.isArray(v?.stacktrace?.frames) ? v.stacktrace.frames.length : 0), 0),
      messagePresent: values.some(v => typeof v?.value === 'string' && v.value.length > 0),
      linkedCausePresent: values.some(v => Number.isInteger(v?.mechanism?.parent_id)),
    },
  };
}
export async function windowEvents(client, project, options) {
  slug(project); environment(options.environment);
  if (!identifier(options.release)) fail('Release da janela inválida.');
  const start = Date.parse(options.start), end = Date.parse(options.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end || end - start > 3600000) fail('Janela deve ter início/fim válidos e no máximo uma hora.');
  const params = new URLSearchParams({ full: 'false', start: new Date(start).toISOString(), end: new Date(end).toISOString() });
  const events = []; let cursor; let pages = 0; let excluded = 0;
  do {
    if (cursor) params.set('cursor', cursor);
    const { data, link } = await client.request(`/projects/${client.org}/${project}/events/?${params}`);
    if (!Array.isArray(data)) fail('Eventos inválidos.');
    pages++;
    for (const raw of data) {
      const event = eventSummary(raw), tags = Object.fromEntries((event.tags ?? []).map(t => [t.key, t.value]));
      const timestamp = Date.parse(event.timestamp);
      if (!event.id || tags.environment !== options.environment || tags.release !== options.release || !Number.isFinite(timestamp) || timestamp < start || timestamp >= end) { excluded++; continue; }
      if (!events.some(e => e.id === event.id)) events.push(event);
    }
    const next = link?.split(',').find(part => /rel="next"/.test(part) && /results="true"/.test(part));
    const nextCursor = next?.match(/cursor="([^"]+)"/)?.[1];
    if (nextCursor && nextCursor === cursor) fail('Cursor repetido na paginação.');
    cursor = nextCursor;
  } while (cursor && pages < 2);
  return { project, start: new Date(start).toISOString(), end: new Date(end).toISOString(), environment: options.environment, release: options.release, pages, excluded, nextPageAvailable: Boolean(cursor), countsPartial: Boolean(cursor), events, limitation: 'Contagem de eventos recebidos, sem denominador de tentativas; ingestão/retenção/quota podem limitar os dados. Não somar aos logs locais.' };
}
export function writeEnv(root, file, variables, execute) {
  root = realpathSync(root);
  const target = resolve(root, file); const rel = relative(root, target);
  if (!rel || rel.startsWith('..') || isAbsolute(rel) || /[\r\n\0*?\[\]\\]/.test(rel) || !['.env', '.env.local'].includes(basename(target))) fail('Destino deve ser .env ou .env.local dentro do repositório.');
  const realRoot = realpathSync(root); const realParent = realpathSync(dirname(target));
  if (relative(realRoot, realParent).startsWith('..')) fail('Destino fora do repositório via symlink.');
  if (existsSync(target) && lstatSync(target).isSymbolicLink()) fail('Arquivo de ambiente com symlink não permitido.');
  const ignore = resolve(root, '.gitignore');
  if (existsSync(ignore) && lstatSync(ignore).isSymbolicLink()) fail('.gitignore com symlink não permitido.');
  const tracked = execFileSync('git', ['ls-files', '--', rel], { cwd: root, encoding: 'utf8' }).trim();
  if (tracked) fail('Arquivo de ambiente rastreado pelo Git: destino recusado.');
  for (const [key, value] of Object.entries(variables)) {
    if (!/^(?:[A-Z][A-Z0-9_]*_)?SENTRY_(DSN|ENVIRONMENT|SERVICE|RELEASE)$/.test(key) || typeof value !== 'string' || /[\r\n\0]/.test(value)) fail('Variável de ambiente inválida.');
    if (key.endsWith('SENTRY_ENVIRONMENT')) environment(value);
  }
  if (!execute) return { file: rel, keys: Object.keys(variables), preview: true };
  try { execFileSync('git', ['check-ignore', '-q', '--', rel], { cwd: root }); }
  catch {
    const previous = existsSync(ignore) ? readFileSync(ignore, 'utf8') : '';
    writeFileSync(ignore, previous + (previous.endsWith('\n') ? '' : '\n') + `/${rel}\n`);
    try { execFileSync('git', ['check-ignore', '-q', '--', rel], { cwd: root }); }
    catch { fail('Destino não ficou ignorado pelo Git; ambiente não gravado.'); }
  }
  let content = existsSync(target) ? readFileSync(target, 'utf8') : '';
  // Replace every occurrence, including export syntax, so stale duplicate keys cannot override.
  for (const [key, value] of Object.entries(variables)) {
    content = content.split('\n').filter(line => !new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=`).test(line)).join('\n');
    content += (content.endsWith('\n') || !content ? '' : '\n') + `${key}=${JSON.stringify(value)}\n`;
  }
  const temporary = `${target}.sentry-${process.pid}.tmp`;
  try { writeFileSync(temporary, content, { flag: 'wx', mode: 0o600 }); chmodSync(temporary, 0o600); renameSync(temporary, target); }
  finally { if (existsSync(temporary)) unlinkSync(temporary); }
  return { file: rel, keys: Object.keys(variables), status: 'saved' };
}
function args(argv) {
  const [command, ...rest] = argv; const options = {};
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i];
    if (!['--config', '--token', '--plan', '--project', '--event-id', '--start', '--end', '--file', '--environment', '--service', '--release', '--prefix', '--key-id', '--execute'].includes(key)) fail('Opção desconhecida.');
    if (key === '--execute') options.execute = true;
    else { if (!rest[i + 1] || rest[i + 1].startsWith('--')) fail('Valor de opção ausente.'); options[key.slice(2)] = rest[++i]; }
  }
  return { command, options };
}
async function main() {
  const { command, options } = args(process.argv.slice(2));
  if (!command || command === 'help') { console.log('inventory | keys --project SLUG | apply --plan FILE [--execute] | env --project SLUG --file PATH --environment NAME --service NAME [--release VERSION] [--prefix NEXT_PUBLIC_] [--key-id ID] [--execute] | events --project SLUG | project --project SLUG | event --project SLUG --event-id 32-HEX; --token auto|org|user; --config JSON-FILE'); return; }
  if (!['inventory', 'keys', 'project', 'apply', 'env', 'events', 'event'].includes(command)) fail('Comando desconhecido.');
  const values = config({ configFile: options.config });
  options.project ??= values.SENTRY_PROJECT_SLUG;
  options.environment ??= values.SENTRY_ENVIRONMENT;
  options.service ??= values.SENTRY_SERVICE;
  options.release ??= values.SENTRY_RELEASE;
  const client = new Client(values, options.token ?? 'auto');
  const emit = data => console.log(JSON.stringify(data));
  if (values.SENTRY_ORG_ID) {
    const { data } = await client.request(`/organizations/${client.org}/`);
    if (String(data.id) !== String(values.SENTRY_ORG_ID) || data.slug !== client.org) fail('ID/slug da organização difere da configuração.');
  }
  if (command === 'inventory') {
    const projects = await client.list(`/organizations/${client.org}/projects/`);
    const teams = await client.list(`/organizations/${client.org}/teams/`);
    emit({ org: client.org, projects: projects.map(p => ({ id: p.id, slug: p.slug, name: p.name, platform: p.platform, teams: p.teams?.map(t => t.slug) })), teams: teams.map(t => ({ id: t.id, slug: t.slug })) });
  } else if (command === 'project') {
    slug(options.project);
    const { data } = await client.request(`/projects/${client.org}/${options.project}/`);
    emit(projectSummary(data));
  } else if (command === 'event') {
    slug(options.project);
    if (!/^[a-f0-9]{32}$/.test(options['event-id'] ?? '')) fail('Event ID inválido.');
    const { data } = await client.request(`/projects/${client.org}/${options.project}/events/${options['event-id']}/`);
    emit({ project: options.project, event: eventSummary(data) });
  } else if (command === 'keys') {
    slug(options.project);
    const keys = await client.list(`/projects/${client.org}/${options.project}/keys/`);
    emit({ project: options.project, keys: keys.map(k => ({ id: k.id, name: k.name, active: k.isActive })) });
  } else if (command === 'apply') {
    if (!options.plan) fail('--plan obrigatório.');
    const plan = JSON.parse(readFileSync(resolve(options.plan), 'utf8'));
    await applyPlan(client, plan, Boolean(options.execute), emit);
  } else if (command === 'env') {
    slug(options.project); environment(options.environment); slug(options.service);
    if (!options.file) fail('--file obrigatório.');
    const prefix = options.prefix ?? '';
    if (prefix && !/^[A-Z][A-Z0-9_]*_$/.test(prefix)) fail('Prefixo inválido.');
    const keys = (await client.list(`/projects/${client.org}/${options.project}/keys/`)).filter(k => k.isActive);
    const key = options['key-id'] ? keys.find(k => String(k.id) === options['key-id']) : keys.length === 1 ? keys[0] : undefined;
    if (!key?.dsn?.public) fail('DSN ativo ausente ou ambíguo: escolha --key-id.');
    const dsn = new URL(key.dsn.public);
    if (dsn.protocol !== 'https:' || !dsn.hostname.endsWith('.sentry.io')) fail('DSN fora do Sentry SaaS.');
    emit(writeEnv(ROOT, options.file, {
      [`${prefix}SENTRY_DSN`]: key.dsn.public,
      [`${prefix}SENTRY_ENVIRONMENT`]: options.environment,
      [`${prefix}SENTRY_SERVICE`]: options.service,
      ...(options.release ? { [`${prefix}SENTRY_RELEASE`]: options.release } : {}),
    }, Boolean(options.execute)));
  } else {
    slug(options.project);
    if (options.start || options.end) {
      emit(await windowEvents(client, options.project, options)); return;
    }
    const { data } = await client.request(`/projects/${client.org}/${options.project}/events/?full=false`);
    if (!Array.isArray(data)) fail('Eventos inválidos.');
    emit({ project: options.project, events: data.map(eventSummary) });
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    // Never echo provider errors, request bodies, plan parse contents or secret values.
    const safe = error instanceof SyntaxError ? 'JSON inválido.' : error?.code ? 'Falha de arquivo/processo; confira caminhos e permissões.' : error.message;
    console.error(safe); process.exitCode = 1;
  });
}
