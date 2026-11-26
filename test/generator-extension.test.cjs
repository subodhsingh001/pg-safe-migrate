const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runPlan}=require('../vscode-extension/generate-plan.cjs');
test('generator uses literal arguments and bounded shell-free execution',async()=>{
 const result=await runPlan('node','/trusted/bin/cli.js','/workspace/a b.sql','prisma','/workspace/context.json','json',(node,args,opts,cb)=>{
 assert.deepEqual(args,['/trusted/bin/cli.js','generate','/workspace/a b.sql','--framework','prisma','--format','json','--schema-context','/workspace/context.json']); assert.equal(opts.shell,false); assert.equal(opts.timeout,30000); assert.equal(opts.env.NODE_OPTIONS,undefined); cb(null,'{}'); }); assert.equal(result,'{}');
});
test('generator rejects invalid options',()=>assert.throws(()=>runPlan('node','cli','file','bad',null,'json')));
test('generator rejects failed process',async()=>assert.rejects(runPlan('node','/trusted/bin/cli.js','file','raw',null,'markdown',(n,a,o,cb)=>cb(new Error('failed')))));
