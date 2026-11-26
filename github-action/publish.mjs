import { githubApi } from './github-api.mjs';
import { renderReport, selectComment } from './report.mjs';
// Trusted caller must establish report provenance and serialize per PR.
export async function publishReport({repository,pr,head,report,authorId,token,dryRun=false,request}={}) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository??'') || repository.split('/').some(x=>x==='.'||x==='..') || !Number.isSafeInteger(pr)||pr<=0 || !/^[a-f0-9]{40}$/.test(head??'') || !Number.isSafeInteger(authorId)||authorId<=0 || typeof dryRun!=='boolean') throw new Error('Invalid publishing context');
  if (!report || report.head!==head || report.repository!==repository || report.pr!==pr) throw new Error('Report context mismatch');
  if (Buffer.byteLength(JSON.stringify(report))>2*1024*1024) throw new Error('Report size limit exceeded');
  const body=renderReport(report);
  if (dryRun) return {status:'dry-run',body};
  if (!token && !request) return {status:'skipped',reason:'missing-token'};
  const api=request??githubApi({token});
  const root=`/repos/${repository}`;
  const verify=async()=>{const live=await api(`${root}/pulls/${pr}`); if(live?.head?.sha!==head || live?.base?.repo?.full_name?.toLowerCase()!==repository.toLowerCase() || live.state!=='open') throw new Error('Stale or invalid pull request'); if(live.head.repo?.full_name?.toLowerCase()!==repository.toLowerCase()) return false; return true;};
  if (!await verify()) return {status:'skipped',reason:'fork'};
  const comments=[];
  for(let page=1;page<=20;page++) {
    const batch=await api(`${root}/issues/${pr}/comments?per_page=100&page=${page}`);
    if(!Array.isArray(batch)||batch.length>100) throw new Error('Invalid comments response');
    comments.push(...batch);
    if(batch.length<100) break;
    if(page===20) throw new Error('Comment pagination limit exceeded');
  }
  const id=selectComment(comments,authorId);
  if (!await verify()) return {status:'skipped',reason:'fork'};
  const result=await api(id===null?`${root}/issues/${pr}/comments`:`${root}/issues/comments/${id}`,{method:id===null?'POST':'PATCH',body:{body}});
  if(result?.user?.id!==authorId || !Number.isSafeInteger(result?.id)) throw new Error('Unexpected publisher identity');
  return {status:id===null?'created':'updated',id:result.id};
}
