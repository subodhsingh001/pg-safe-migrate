import {test} from 'node:test';
import assert from 'node:assert/strict';
import {run} from '../github-action/run.mjs';
const head='a'.repeat(40),base='b'.repeat(40),repo='owner/repo';
function fixture({fork=false,comment='false',status='passed'}={}) {
 const writes=[], calls=[];
 const env={GITHUB_EVENT_NAME:'pull_request_target',GITHUB_REPOSITORY:repo,GITHUB_WORKSPACE:'/tmp',PGSAFE_COMMENT:comment,PGSAFE_TOKEN:'token',PGSAFE_AUTHOR_ID:'123'};
 const deps={read:()=>JSON.stringify({pull_request:{number:1,head:{sha:head,repo:{full_name:fork?'other/repo':repo}},base:{sha:base,repo:{full_name:repo}}}}),append:(p,s)=>writes.push(s),analyze:async()=>({head,base,status,filesChecked:1,findings:status==='blocked'?[{ruleId:'PG001',severity:'error',file:'a.sql',line:1,message:'risk'}]:[],exitCode:status==='blocked'?1:0}),publish:async x=>{calls.push(x);return {status:'created'}}};
 return {env,deps,writes,calls};
}
test('summary and outputs',async()=>{const f=fixture();assert.equal(await run(f.env,f.deps),0);assert.match(f.writes.join(''),/status=passed/);assert.equal(f.calls.length,0)});
test('blocked gate remains blocked after publishing',async()=>{const f=fixture({comment:'true',status:'blocked'});assert.equal(await run(f.env,f.deps),1);assert.equal(f.calls[0].authorId,123)});
test('fork never publishes',async()=>{const f=fixture({fork:true,comment:'true'});await run(f.env,f.deps);assert.equal(f.calls.length,0)});
test('untrusted event rejected',async()=>{const f=fixture();f.env.GITHUB_EVENT_NAME='pull_request';await assert.rejects(run(f.env,f.deps),/Trusted/)});
test('missing token fails closed',async()=>{const f=fixture({comment:'true'});delete f.env.PGSAFE_TOKEN;await assert.rejects(run(f.env,f.deps),/requires token/)});
