import { performance } from 'node:perf_hooks';
import { analyzeFiles } from '../src/analysis.js';
for (const count of [1000,5000,10000]) {
  const sql=Array.from({length:count},(_,i)=>`-- pg-safe-migrate-disable-next-line PG002 -- reason: benchmark\nALTER TABLE users DROP COLUMN c${i};`).join('\n');
  for(const enabled of [false,true]) {
    global.gc?.(); const before=process.memoryUsage(); const start=performance.now(); const audit=[];
    const findings=await analyzeFiles([{file:'benchmark.sql',sql}],{suppression:{enabled}},{suppressionAudit:audit});
    const elapsed=performance.now()-start; const after=process.memoryUsage();
    if(findings.length!==(enabled?0:count)||audit.length!==(enabled?count:0)) throw new Error('Unexpected benchmark findings');
    console.log(JSON.stringify({count,enabled,ms:Math.round(elapsed),heapBeforeMB:Math.round(before.heapUsed/1048576),heapAfterMB:Math.round(after.heapUsed/1048576),rssBeforeMB:Math.round(before.rss/1048576),rssAfterMB:Math.round(after.rss/1048576)}));
  }
}
