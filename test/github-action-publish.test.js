import test from 'node:test';
import assert from 'node:assert/strict';
import {publishReport} from '../github-action/publish.mjs';
import {githubApi} from '../github-action/github-api.mjs';
import {MARKER} from '../github-action/report.mjs';
const head='a'.repeat(40), repository='owner/repo', pr=1, authorId=42;
const base={head,repository,pr,authorId,report:{head,repository,pr,status:'no-migrations',findings:[],filesChecked:0,exitCode:0}};
function mock({comments=[],fork=false,stale=false}={}) {const calls=[];return {calls,request:async(path,opts)=>{calls.push([path,opts]);if(path.includes('/pulls/'))return {state:'open',head:{sha:stale?'b'.repeat(40):head,repo:{full_name:fork?'other/repo':repository}},base:{repo:{full_name:repository}}};if(opts)return {id:7,user:{id:authorId}};return comments;}};}
test('creates comment',async()=>{const m=mock();assert.equal((await publishReport({...base,...m})).status,'created');assert.equal(m.calls.at(-1)[1].method,'POST');});
test('updates owned comment only',async()=>{const m=mock({comments:[{id:1,user:{id:99},body:MARKER},{id:7,user:{id:42},body:MARKER}]});assert.equal((await publishReport({...base,...m})).status,'updated');assert.match(m.calls.at(-1)[0],/comments\/7$/);});
test('dry run never calls API',async()=>{assert.equal((await publishReport({...base,dryRun:true,request:()=>assert.fail()})).status,'dry-run');});
test('missing token skips',async()=>assert.equal((await publishReport(base)).reason,'missing-token'));
test('fork skips writes',async()=>{const m=mock({fork:true});assert.equal((await publishReport({...base,...m})).reason,'fork');assert.equal(m.calls.length,1);});
test('stale head rejected',async()=>assert.rejects(publishReport({...base,...mock({stale:true})}),/Stale/));
test('report context mismatch rejected',async()=>assert.rejects(publishReport({...base,pr:2}),/mismatch/));
test('API never retries POST',async()=>{let n=0;const api=githubApi({token:'test',fetchImpl:async()=>{n++;return new Response('',{status:500});}});await assert.rejects(api('/repos/owner/repo/issues/1/comments',{method:'POST'}),/500/);assert.equal(n,1);});
test('API retries rate limited GET',async()=>{let n=0;const api=githubApi({token:'test',sleep:async()=>{},fetchImpl:async()=>++n===1?new Response('',{status:429,headers:{'retry-after':'0'}}):new Response('{}')});assert.deepEqual(await api('/repos/owner/repo/pulls/1'),{});assert.equal(n,2);});
test('API rejects foreign path',async()=>{const api=githubApi({token:'test',fetchImpl:()=>assert.fail()});await assert.rejects(api('https://evil.test'),/Invalid/);});
