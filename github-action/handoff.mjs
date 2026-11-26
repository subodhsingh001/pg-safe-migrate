import { readFileSync, appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { renderReport } from './report.mjs';
import { publishReport } from './publish.mjs';
const MAX = 240000;
export function context(env, read=readFileSync) {
  if (env.GITHUB_EVENT_NAME !== 'pull_request_target') throw Error('Trusted event required');
  const p=JSON.parse(read(env.GITHUB_EVENT_PATH,'utf8')).pull_request;
  const repository=env.GITHUB_REPOSITORY;
  if (!p || !/^[\w.-]+\/[\w.-]+$/.test(repository??'') || p.base?.repo?.full_name!==repository || !Number.isSafeInteger(p.number)||p.number<1 || ![p.head?.sha,p.base?.sha].every(s=>/^[a-f0-9]{40}$/.test(s??'')) || !/^\d+$/.test(env.GITHUB_RUN_ID??'') || !/^\d+$/.test(env.GITHUB_RUN_ATTEMPT??'')) throw Error('Invalid context');
  return {repository,pr:p.number,head:p.head.sha,base:p.base.sha,run:env.GITHUB_RUN_ID,attempt:env.GITHUB_RUN_ATTEMPT,fork:p.head.repo?.full_name!==repository};
}
export function encodeReport(ctx, report) {
  if(report.head!==ctx.head || report.base!==ctx.base || report.status==='error') throw Error('Invalid report context');
  renderReport(report);
  const findings=report.findings.map(f=>({ruleId:f.ruleId,severity:f.severity,file:f.file,line:f.line,message:String(f.message??'').slice(0,400),fix:String(f.fix??f.advisor?.summary??'').slice(0,400)}));
  const value=Buffer.from(JSON.stringify({context:ctx,report:{head:report.head,base:report.base,status:report.status,exitCode:report.exitCode,filesChecked:report.filesChecked,findings}})).toString('base64');
  if(value.length>MAX) throw Error('Report handoff exceeds limit');
  return value;
}
export function decodeReport(ctx,value) {
  if(typeof value!=='string'||!value.length||value.length>MAX||!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw Error('Invalid handoff');
  const data=JSON.parse(Buffer.from(value,'base64').toString('utf8'));
  if(!data.context || Object.keys(ctx).some(k=>data.context[k]!==ctx[k])) throw Error('Handoff context mismatch');
  if(encodeReport(ctx,data.report)!==value) throw Error('Noncanonical handoff');
  return data.report;
}
export async function publishHandoff(env,{read=readFileSync,publish=publishReport}={}) {
  const ctx=context(env,read);
  if(ctx.fork) return {status:'skipped'};
  const report=decodeReport(ctx,env.PGSAFE_HANDOFF);
  if(!env.PGSAFE_TOKEN||!/^[1-9]\d*$/.test(env.PGSAFE_AUTHOR_ID??'')) throw Error('Missing publisher configuration');
  return publish({repository:ctx.repository,pr:ctx.pr,head:ctx.head,report:{...report,repository:ctx.repository,pr:ctx.pr},authorId:Number(env.PGSAFE_AUTHOR_ID),token:env.PGSAFE_TOKEN});
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    if(process.argv[2]==='publish') { const result=await publishHandoff(process.env); console.log(`PGSAFE comment: ${result.status}`); }
    else if(process.argv[2]==='analyze') {
      const ctx=context(process.env); const {analyzeCommit}=await import('./analyze.mjs');
      const report=await analyzeCommit({cwd:process.env.GITHUB_WORKSPACE,base:ctx.base,head:ctx.head});
      appendFileSync(process.env.GITHUB_STEP_SUMMARY,renderReport(report));
      appendFileSync(process.env.GITHUB_OUTPUT,`handoff=${encodeReport(ctx,report)}\ngate=${report.exitCode}\n`);
    } else throw Error('Invalid mode');
  } catch { console.error('PGSAFE handoff failed'); process.exitCode=2; }
}
