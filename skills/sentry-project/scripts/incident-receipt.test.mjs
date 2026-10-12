import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spanReceipt,profileReceipt,outcomeReceipt} from './incident-receipt.mjs';
const release='example-app@'+'a'.repeat(40),profilerId='b'.repeat(32);
test('span receipt allows fixed operations and release only, without provider strings',()=>{
 const rows=spanReceipt({data:[{'span.op':'app.job','span.name':'job_discover',release,'count()':12,'profiler.id':profilerId,user:'private'}, {'span.op':'app.job','span.name':'private',release,'count()':4}]},release,'app.job',new Set(['job_discover']));
 assert.deepEqual(rows,[{operation:'job_discover',count:12,profilerId}]);assert(!JSON.stringify(rows).includes('private'));
});
test('ingestion outcomes allow numeric known categories only and redact arbitrary reasons',()=>{
 const rows=outcomeReceipt({groups:[{by:{category:'span',outcome:'invalid',reason:'missing_dsc'},totals:{'sum(quantity)':746}}, {by:{category:'profile_chunk',outcome:'rate_limited',reason:'private'},totals:{'sum(quantity)':1}}, {by:{category:'private',outcome:'invalid'},totals:{'sum(quantity)':4}}]});
 assert.deepEqual(rows,[{category:'span',outcome:'invalid',reason:'missing_dsc',quantity:746},{category:'profile_chunk',outcome:'rate_limited',reason:'other',quantity:1}]);assert(!JSON.stringify(rows).includes('private'));
 assert.deepEqual(outcomeReceipt({groups:[{by:{category:'span',outcome:'invalid'},totals:{'sum(quantity)':-1}}]}),[]);
});
test('continuous profile receipt validates identity and reports only counts',()=>{
 const raw={chunk:{release,environment:'staging',platform:'node',profiler_id:profilerId,chunk_id:'c'.repeat(32),profile:{samples:[{private:'private'}],stacks:[[0]],frames:[{function:'private'}]}}};
 const result=profileReceipt(raw,release,profilerId,'staging');assert.equal(result.matched,true);assert.equal(result.samples,1);assert(!JSON.stringify(result).includes('private'));
 assert.equal(profileReceipt(raw,release,'d'.repeat(32),'staging').matched,false);
});
