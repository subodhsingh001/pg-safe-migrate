const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runPlan}=require('../vscode-extension/generate-plan.cjs');
test('generator uses literal arguments and bounded shell-free execution',async()=>{
 const result=await runPlan('node','/trusted/bin/cli.js','/workspace/a b.sql','prisma','/workspace/context.json','json',(node,args,opts,cb)=>{
 assert.deepEqual(args,['/trusted/bin/cli.js','generate','/workspace/a b.sql','--framework','prisma','--format','json','--schema-context','/workspace/context.json']); assert.equal(opts.shell,false); assert.equal(opts.timeout,30000); assert.equal(opts.env.NODE_OPTIONS,undefined); cb(null,'{}'); }); assert.equal(result,'{}');
});
test('generator rejects invalid options',()=>assert.throws(()=>runPlan('node','cli','file','bad',null,'json')));
test('generator rejects failed process',async()=>assert.rejects(runPlan('node','/trusted/bin/cli.js','file','raw',null,'markdown',(n,a,o,cb)=>cb(new Error('failed')))));

const {appendPlanAction,register}=require('../vscode-extension/generate-plan.cjs');
const doc={uri:{scheme:'file',toString:()=> 'file:///migration.sql'},fileName:'migration.sql',version:7,isDirty:false};
const host={workspace:{isTrusted:true},CodeActionKind:{QuickFix:'quickfix'},CodeAction:class {constructor(title,kind){Object.assign(this,{title,kind});}}};
test('quick fix retains guidance and adds one plan action for multiple findings',()=>{
 const old=[{diagnostics:[{code:'PG006'}]},{diagnostics:[{code:'PG003'}]}];
 const actions=appendPlanAction(host,doc,old); assert.equal(actions.length,3); assert.equal(actions[0],old[0]); assert.equal(actions[1],old[1]); assert.equal(actions[2].command.command,'pgSafeMigrate.generatePlan'); assert.deepEqual(actions[2].command.arguments,['file:///migration.sql',7]); assert.equal(actions[2].diagnostics.length,2); assert.equal(actions[2].edit,undefined);
});
test('quick fix does not offer generator for unrelated diagnostics, dirty or untrusted files',()=>{
 const old=[{diagnostics:[{code:'PG006'}]}]; assert.deepEqual(appendPlanAction(host,doc,[]),[]); assert.equal(appendPlanAction(host,{...doc,isDirty:true},old),old); assert.equal(appendPlanAction({...host,workspace:{isTrusted:false}},doc,old),old);
});
test('generator rejects stale quick fix target before prompting',async()=>{
 let handler, warning; const v={workspace:{isTrusted:true},window:{activeTextEditor:{document:doc},showWarningMessage:m=>{warning=m;}},commands:{registerCommand:(n,fn)=>{handler=fn;}}}; register(v,()=>{throw Error('must not run');},()=>({})); await handler('file:///other.sql',7); assert.match(warning,/selection changed/); await handler('file:///migration.sql',6); assert.match(warning,/selection changed/);
});
const {indexFix,enterContext}=require('../vscode-extension/generate-plan.cjs');
test('simple raw index edit preserves original spelling and whitespace',()=>assert.equal(indexFix('  create index ix ON public.users (email);\n','migrations/a.sql'),'  CREATE INDEX CONCURRENTLY ix ON public.users (email);\n'));
test('index edit rejects complex and transactional SQL and ORM paths',()=>{
 for(const sql of ['BEGIN; CREATE INDEX ix ON public.users (email); COMMIT;','CREATE UNIQUE INDEX ix ON public.users (email);','CREATE INDEX ix ON users (email);','CREATE INDEX ix ON public.users (email) WHERE email IS NOT NULL;','CREATE INDEX ix ON public.users (email); -- comment']) assert.equal(indexFix(sql,'a.sql'),null);
 for(const file of ['prisma/migrations/a.sql','drizzle/a.sql','db/migration/a.sql','V1__a.sql']) assert.equal(indexFix('CREATE INDEX ix ON public.users (email);',file),null);
});
const {reviewedContext}=require('../vscode-extension/generate-plan.cjs');
const details={schema:'public',table:'users',column:'email',type:'text',review:true};
const defaults=['public','users','email','email_address'];
test('reviewed context requires confirmation and never assumes writer readiness',()=>{
 assert.throws(()=>reviewedContext({...details,review:false},defaults));
 assert.deepEqual(reviewedContext(details,defaults),{schemaVersion:1,tables:[{schema:'public',table:'users',columns:[{name:'email',type:'text'}]}]});
});
test('reviewed context supports explicitly confirmed key and writers',()=>{
 const t=reviewedContext({...details,key:'id',keyType:'bigint',batch:1000,stable:true,writers:true},defaults).tables[0]; assert.deepEqual(t.backfill,{primaryKey:['id'],batchSize:1000,stableKey:true,dualWritesReady:true});
 assert.equal(reviewedContext({...details,key:'id',keyType:'bigint',batch:1000},defaults).tables[0].backfill.dualWritesReady,false);
});
test('reviewed context rejects invalid or mismatched data',()=>{
 for(const d of [{table:'other'},{type:'text; DROP TABLE x'},{key:'email_address',keyType:'text',batch:1},{key:'id',keyType:'bigint',batch:10001}])assert.throws(()=>reviewedContext({...details,...d},defaults));
});
function webviewHost(){let receive,close;const errors=[];const panel={webview:{onDidReceiveMessage:f=>{receive=f;return {dispose(){}};},postMessage:m=>errors.push(m)},onDidDispose:f=>{close=f;return {dispose(){}};},dispose:()=>close()};return {v:{workspace:{isTrusted:true},ViewColumn:{Beside:2},window:{createWebviewPanel:()=>panel}},panel,errors,send:m=>receive(m),close:()=>close()};}
test('webview prefills rename and validates messages before resolving',async()=>{
 const h=webviewHost(),p=enterContext(h.v,'ALTER TABLE public.users RENAME COLUMN email TO email_address;');assert.match(h.panel.webview.html,/value="email_address"/);assert.match(h.panel.webview.html,/default-src 'none'/);h.send({kind:'generate',data:{...details,review:false}});assert.equal(h.errors.length,1);h.send({kind:'generate',data:details});assert.equal((await p).tables[0].table,'users');
});
test('closing webview cancels schema entry',async()=>{const h=webviewHost(),p=enterContext(h.v);h.close();assert.equal(await p,undefined);});
test('static discovery prefills reviewed candidates without asserting readiness',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');const root=fs.mkdtempSync(path.join(os.tmpdir(),'pgsafe-discovery-'));try{
 const {discover}=require('../vscode-extension/schema-discovery.cjs');fs.writeFileSync(path.join(root,'schema.prisma'),'model users {\n id BigInt @id\n email String\n}');assert.deepEqual(discover(root,defaults),{source:'schema.prisma',type:'text',key:'id',keyType:'bigint'});
 fs.writeFileSync(path.join(root,'schema.sql'),'CREATE TABLE public.users (id bigint PRIMARY KEY, email text);');assert.equal(discover(root,defaults),null);fs.unlinkSync(path.join(root,'schema.prisma'));assert.equal(discover(root,defaults).source,'schema.sql');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('Prisma discovery and webview prefill support Windows CRLF and mapped tables',async()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');const root=fs.mkdtempSync(path.join(os.tmpdir(),'pgsafe-crlf-'));try{
 fs.mkdirSync(path.join(root,'prisma'));fs.writeFileSync(path.join(root,'prisma','schema.prisma'),'model User {\r\n  id BigInt @id\r\n  email String\r\n\r\n  @@map("users")\r\n}');
 assert.deepEqual(require('../vscode-extension/schema-discovery.cjs').discover(root,defaults),{source:'prisma/schema.prisma',type:'text',key:'id',keyType:'bigint'});
 const h=webviewHost(),p=enterContext(h.v,'ALTER TABLE public.users RENAME COLUMN email TO email_address;',root);assert.match(h.panel.webview.html,/id="key"[^>]*value="id"/);assert.match(h.panel.webview.html,/<option selected>bigint<\/option>/);h.close();await p;
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
