// Read-only receipt for incident spans and continuous profiles. No raw response output.
import { Client, config, environment, identifier } from './sentry.mjs';
import { pathToFileURL } from 'node:url';
const id = x => typeof x === 'string' && /^[a-f0-9]{32}$/.test(x);
export function spanReceipt(data, release, operation, names) {
  if (!Array.isArray(data?.data)) throw Error('Resposta de spans inválida.');
  return data.data.slice(0,25).flatMap(row => row['span.op'] === operation && names.has(row['span.name']) && row.release === release && Number.isSafeInteger(row['count()']) && row['count()'] >= 0 ? [{ operation: row['span.name'], count: row['count()'], profilerId: id(row['profiler.id']) ? row['profiler.id'] : null }] : []);
}
export function profileReceipt(data, release, profilerId, env) {
  const p = data?.chunk;
  if (!p || p.release !== release || p.environment !== env || p.profiler_id !== profilerId || !id(p.chunk_id)) return { matched: false };
  return { matched: true, chunkId: p.chunk_id, profilerId, release, environment: env,
    samples: Array.isArray(p.profile?.samples) ? p.profile.samples.length : null,
    stacks: Array.isArray(p.profile?.stacks) ? p.profile.stacks.length : null,
    frames: Array.isArray(p.profile?.frames) ? p.profile.frames.length : null };
}
export function outcomeReceipt(data) {
  const categories = new Set(['error','span','span_indexed','profile_chunk']);
  const outcomes = new Set(['accepted','filtered','rate_limited','invalid','abuse','client_discard','cardinality_limited']);
  const reasons = new Set(['missing_dsc','profile_duration_usage_exceeded','span_usage_exceeded','sample_rate','network_error']);
  return (Array.isArray(data?.groups) ? data.groups : []).slice(0,50).flatMap(g => {
    const quantity=g?.totals?.['sum(quantity)'];
    return categories.has(g?.by?.category)&&outcomes.has(g?.by?.outcome)&&Number.isSafeInteger(quantity)&&quantity>=0
      ? [{category:g.by.category,outcome:g.by.outcome,reason:reasons.has(g.by.reason)?g.by.reason:'other',quantity}] : [];
  });
}
async function main() {
  const [start, end, releaseArg, projectArg] = process.argv.slice(2);
  const values = config();
  const release = releaseArg ?? values.SENTRY_RELEASE;
  const project = projectArg ?? values.SENTRY_PROJECT_SLUG;
  const env = environment(values.SENTRY_ENVIRONMENT);
  const operation = values.SENTRY_SPAN_OP;
  const names = new Set((values.SENTRY_SPAN_NAMES ?? '').split(',').map(x => x.trim()).filter(Boolean));
  if (!identifier(operation) || !names.size || [...names].some(x => !identifier(x))) throw Error('Configure SENTRY_SPAN_OP e SENTRY_SPAN_NAMES.');
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(project ?? '')) throw Error('Projeto inválido.');
  const a = Date.parse(start), b = Date.parse(end);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a >= b || b-a > 3600000 || !identifier(release)) throw Error('Janela/revisão inválida.');
  const client = new Client(values, 'auto');
  if (values.SENTRY_ORG_ID) {
    const { data } = await client.request(`/organizations/${client.org}/`);
    if (String(data.id) !== values.SENTRY_ORG_ID || data.slug !== client.org) throw Error('Organização divergente.');
  }
  const { data: projectData } = await client.request(`/projects/${client.org}/${project}/`);
  const projectId = String(projectData.id);
  if (!/^\d+$/.test(projectId)) throw Error('ID de projeto inválido.');
  const params=new URLSearchParams({ dataset:'spans',project:projectId,environment:env,start:new Date(a).toISOString(),end:new Date(b).toISOString(),query:`release:"${release}" span.op:"${operation}"`,per_page:'25' });
  for(const field of ['profiler.id','span.op','span.name','release','count()'])params.append('field',field);
  const {data,link}=await client.request(`/organizations/${client.org}/events/?${params}`);
  const spans=spanReceipt(data,release,operation,names), profilerId=spans.find(row=>row.profilerId)?.profilerId;
  const result={observedAt:new Date().toISOString(),project,start,end,release,spans,paginationAvailable:/rel="next"[^,]*results="true"/.test(link??''),profile:{queried:false},limitation:'Uma página; contagem de spans não é denominador de requisições. Falta de dados não prova ausência; ingestão, recursos, quotas e permissões limitam a consulta.'};
  if(profilerId){
    const q=new URLSearchParams({project:projectId,profiler_id:profilerId,start:new Date(a).toISOString(),end:new Date(b).toISOString()});
    try{const {data}=await client.request(`/organizations/${client.org}/profiling/chunks/?${q}`);result.profile={queried:true,...profileReceipt(data,release,profilerId,env)};}
    catch{result.profile={queried:true,matched:false,queryFailed:true};}
  }
  if(!spans.length || result.profile.queryFailed || result.profile.matched===false){
    const q=new URLSearchParams({project:projectId,start:new Date(a).toISOString(),end:new Date(b).toISOString(),field:'sum(quantity)'});
    for(const field of ['category','outcome','reason'])q.append('groupBy',field);
    try{const{data}=await client.request(`/organizations/${client.org}/stats_v2/?${q}`);result.ingestionOutcomes={groups:outcomeReceipt(data),limitation:'Agregado do projeto sem filtro por release; span/span_indexed sobrepostos, não somar.'};}
    catch{result.ingestionOutcomes={queryFailed:true};}
  }
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{process.stderr.write('Consulta de recibo de spans/perfis inconclusiva; sem resposta bruta ou retentativa.\n');process.exitCode=1;});
