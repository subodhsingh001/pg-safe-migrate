import { readFileSync, appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { renderReport } from './report.mjs';
import { publishReport } from './publish.mjs';
export async function run(env, {analyze, publish=publishReport, append=appendFileSync, read=readFileSync}={}) {
  if (env.GITHUB_EVENT_NAME !== 'pull_request_target') throw new Error('Trusted pull_request_target workflow required');
  const event=JSON.parse(read(env.GITHUB_EVENT_PATH,'utf8'));
  const p=event.pull_request, repository=env.GITHUB_REPOSITORY;
  if (!p || p.base?.repo?.full_name!==repository || !Number.isSafeInteger(p.number) || p.number<1 || !/^[a-f0-9]{40}$/.test(p.head?.sha) || !/^[a-f0-9]{40}$/.test(p.base?.sha)) throw new Error('Invalid PR context');
  const inputs=Object.fromEntries(['postgres-version','fail-on','advisor','preset','mode'].map(k=>[k,env['PGSAFE_'+k.toUpperCase().replaceAll('-','_')]]).filter(([,v])=>v!==undefined));
  const enabled=env.PGSAFE_COMMENT??'false';
  if (!['true','false'].includes(enabled)) throw new Error('Invalid comment input');
  const report=await analyze({cwd:env.GITHUB_WORKSPACE,base:p.base.sha,head:p.head.sha,inputs});
  const body=renderReport(report);
  append(env.GITHUB_STEP_SUMMARY,body+'\n');
  append(env.GITHUB_OUTPUT,`status=${report.status}\nfiles-checked=${report.filesChecked}\n`);
  let result={status:'skipped'};
  if(enabled==='true' && p.head.repo?.full_name===repository) {
    if(!env.PGSAFE_TOKEN || !/^[1-9][0-9]*$/.test(env.PGSAFE_AUTHOR_ID??'')) throw new Error('Comment publishing requires token and trusted bot ID');
    result=await publish({repository,pr:p.number,head:p.head.sha,report:{...report,repository,pr:p.number},authorId:Number(env.PGSAFE_AUTHOR_ID),token:env.PGSAFE_TOKEN});
  }
  append(env.GITHUB_OUTPUT,`comment-status=${result.status}\n`);
  return report.exitCode;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try { const env={...process.env}; delete process.env.PGSAFE_TOKEN; const {analyzeCommit}=await import('./analyze.mjs'); process.exitCode=await run(env,{analyze:analyzeCommit}); }
  catch { console.error('PGSAFE action failed; verify trusted checkout, inputs, dependencies and permissions.'); process.exitCode=2; }
}
