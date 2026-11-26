'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {execFile} = require('node:child_process');
function runPlan(node, cli, file, framework, context, format, execute=execFile) {
  if (!['auto','prisma','drizzle','flyway','raw'].includes(framework) || !['markdown','json'].includes(format)) throw new Error('Invalid plan options');
  const args=[cli,'generate',file,'--framework',framework,'--format',format];
  if(context) args.push('--schema-context',context);
  const env={...process.env}; delete env.NODE_OPTIONS; delete env.NODE_PATH;
  return new Promise((resolve,reject)=>execute(node,args,{cwd:path.dirname(path.dirname(cli)),shell:false,windowsHide:true,timeout:30000,maxBuffer:4*1024*1024,encoding:'utf8',env},(err,stdout)=>err?reject(new Error('Plan generation failed or exceeded limits. Check saved SQL, context and bundled runtime.')):resolve(stdout)));
}
function register(vscode, findCli, settings) {
  let busy=false;
  return vscode.commands.registerCommand('pgSafeMigrate.generatePlan',async()=>{
    if(busy) return;
    if(vscode.workspace.isTrusted!==true) return vscode.window.showWarningMessage('Trust the workspace before generating a plan.');
    const doc=vscode.window.activeTextEditor?.document;
    if(!doc || doc.uri.scheme!=='file' || !doc.fileName.toLowerCase().endsWith('.sql') || doc.isDirty) return vscode.window.showWarningMessage('Open a saved SQL file first.');
    busy=true;
    try {
      const version=doc.version;
      const framework=await vscode.window.showQuickPick(['auto','prisma','drizzle','flyway','raw'],{placeHolder:'Select migration framework'});
      if(!framework) return;
      const choice=await vscode.window.showQuickPick(['No schema context','Select reviewed JSON context']);
      if(!choice) return;
      let context;
      if(choice==='Select reviewed JSON context') {
        const files=await vscode.window.showOpenDialog({canSelectMany:false,filters:{JSON:['json']}});
        if(!files?.length || files[0].scheme!=='file') return;
        context=files[0].fsPath;
      }
      const format=await vscode.window.showQuickPick(['markdown','json']);
      if(!format) return;
      const cli=findCli(); if(!cli) throw new Error('Rebuild the standalone runtime.');
      if(vscode.workspace.isTrusted!==true || doc.isDirty || doc.version!==version) throw new Error('SQL changed or workspace is no longer trusted.');
      for(const [file,max] of [[doc.uri.fsPath,2*1024*1024],...(context?[[context,1024*1024]]:[])]) {const s=fs.statSync(file); if(!s.isFile()||s.size>max) throw new Error('Invalid or oversized input file.');}
      const node=settings().inspect?.('nodePath')?.globalValue || 'node';
      const report=await runPlan(node,cli,doc.uri.fsPath,framework,context,format);
      if(doc.isClosed || doc.isDirty || doc.version!==version || vscode.workspace.isTrusted!==true) throw new Error('SQL changed during generation; retry.');
      const preview=await vscode.workspace.openTextDocument({language:format,content:report});
      await vscode.window.showTextDocument(preview,{preview:true});
    } catch(e) {vscode.window.showErrorMessage(`PGSAFE: ${e.message}`);} finally {busy=false;}
  });
}
module.exports={runPlan,register};
