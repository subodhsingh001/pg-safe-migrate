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
