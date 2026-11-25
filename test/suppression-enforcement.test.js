import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeFiles } from '../src/analysis.js';
import { normalizeSuppression } from '../src/config.js';
const drop = 'ALTER TABLE users DROP COLUMN email;';
const directive = (ids='PG002', reason='approved') => `-- pg-safe-migrate-disable-next-line ${ids} -- reason: ${reason}`;
async function run(sql, suppression={enabled:true}) {
  const suppressionAudit=[];
  const findings=await analyzeFiles([{file:'migration.sql',sql}],{suppression},{suppressionAudit});
  return {findings,audit:suppressionAudit};
}
for (const [name,sql,config,count,status] of [
 ['default disabled',`${directive()}\n${drop}`,{},1,null],
 ['enabled',`${directive()}\n${drop}`,{enabled:true},0,'suppressed'],
 ['same line',`${directive()}\n${drop} ${drop}`,{enabled:true},1,'suppressed'],
 ['protected',`${directive()}\n${drop}`,{enabled:true,protectedRules:['PG002']},1,'rejected'],
 ['missing reason',`${directive('PG002','')}\n${drop}`,{enabled:true},1,'rejected'],
 ['unknown',`${directive('PG999')}\n${drop}`,{enabled:true},1,'rejected'],
 ['unused',`${directive()}\nSELECT 1;`,{enabled:true},0,'unused'],
 ['unicode',`SELECT '日本😀';\r\n${directive()}\r\n${drop}`,{enabled:true},0,'suppressed'],
 ['mixed protected',`${directive('PG002, PG023')}\n${drop}`,{enabled:true},1,'rejected'],
 ['unrelated rule',`${directive()}\n${drop}\nCREATE INDEX idx ON users(email);`,{enabled:true},1,'suppressed'],
]) test(name,async()=>{const r=await run(sql,config);assert.equal(r.findings.length,count);assert.equal(r.audit[0]?.status??null,status);});
test('audit retains finding and reason',async()=>{const r=await run(`${directive()}\n${drop}`);assert.equal(r.audit[0].finding.ruleId,'PG002');assert.equal(r.audit[0].reason,'approved');});
test('no silent suppression without audit sink',async()=>assert.rejects(analyzeFiles([{file:'x.sql',sql:drop}],{suppression:{enabled:true}}),/audit sink/));
for(const value of [null,[],{enabled:'true'},{requireReason:false},{reportSuppressed:false},{protectedRules:['PG999']},{protectedRules:null},{typo:true}]) test(`reject config ${JSON.stringify(value)}`,()=>assert.throws(()=>normalizeSuppression(value),/suppression/i));
