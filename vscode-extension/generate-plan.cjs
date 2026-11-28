'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
// Deliberately narrow: one simple schema-qualified nonunique index, no comments or transaction statements.
function indexFix(sql,file) {
  if (/(?:^|[\\/])(?:prisma|drizzle|flyway|db[\\/]migration)(?:[\\/]|$)/i.test(file) || /(?:^|[\\/])(?:V[^/\\]+__|R__)/i.test(file)) return null;
  const id='[a-z_][a-z0-9_]*';
  const re=new RegExp('^\\s*CREATE\\s+INDEX\\s+('+id+')\\s+ON\\s+'+id+'\\.'+id+'\\s*\\(\\s*'+id+'(?:\\s*,\\s*'+id+')*\\s*\\)\\s*;\\s*$','i');
  return re.test(sql)?sql.replace(/CREATE\s+INDEX/i,'CREATE INDEX CONCURRENTLY'):null;
}
const {randomBytes}=require('node:crypto');
const TYPES=['text','integer','bigint','smallint','boolean','uuid','date','timestamp','timestamptz','numeric','real','double precision','bytea'];
function contextDefaults(sql='') {
  const m=/^\s*ALTER\s+TABLE\s+([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\s+RENAME\s+COLUMN\s+([a-z_][a-z0-9_]*)\s+TO\s+([a-z_][a-z0-9_]*)\s*;\s*$/i.exec(sql);
  return m ? m.slice(1,5).map(x=>x.toLowerCase()) : ['','','',''];
}
function reviewedContext(data, defaults) {
  const valid=x=>typeof x==='string' && x.trim().length>0 && Buffer.byteLength(x)<=63 && !/[\x00-\x1f\x7f]/.test(x);
  if(!data || data.review!==true || ![data.schema,data.table,data.column].every(valid) || !TYPES.includes(data.type)) throw Error('Review and enter valid schema, table, column and type.');
  if(defaults[0] && [data.schema,data.table,data.column].some((x,i)=>x!==defaults[i])) throw Error('Details must match the rename statement.');
  const table={schema:data.schema,table:data.table,columns:[{name:data.column,type:data.type}]};
  if(data.key!==undefined && data.key!=='') {
    if(!valid(data.key)||data.key===defaults[3]||!TYPES.includes(data.keyType)||!Number.isInteger(data.batch)||data.batch<1||data.batch>10000) throw Error('Invalid primary key, type or batch size.');
    if(data.key===data.column && data.keyType!==data.type) throw Error('Primary key type must match source column type.');
    if(data.key!==data.column) table.columns.push({name:data.key,type:data.keyType});
    table.backfill={primaryKey:[data.key],batchSize:data.batch,stableKey:data.stable===true,dualWritesReady:data.writers===true};
  }
  return {schemaVersion:1,tables:[table]};
}
function enterContext(vscode,sql='',root,live) {
  const defaults=contextDefaults(sql), nonce=randomBytes(24).toString('hex');
  const escape=x=>x.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const local=require('./schema-discovery.cjs').discover(root,defaults),found=live||local;
  const comparison=live?(local?(['type','key','keyType'].every(k=>local[k]===live[k])?'Static candidate matches inspected type and single-key fields.':'Static candidate differs from inspected type or key fields; review drift.'):'No unambiguous static candidate for comparison.') : '';
  const options=selected=>TYPES.map(t=>`<option${t===selected?' selected':''}>${t}</option>`).join('');
  const panel=vscode.window.createWebviewPanel('pgsafeContext','PGSAFE: Migration Assistant',vscode.ViewColumn.Beside,{enableScripts:true,localResourceRoots:[]});
  return new Promise(resolve=>{
    let done=false, listener, closed;
    const finish=value=>{if(done)return;done=true;listener?.dispose();closed?.dispose();resolve(value);};
    closed=panel.onDidDispose(()=>finish(undefined));
    listener=panel.webview.onDidReceiveMessage(msg=>{
      if(done)return;
      if(msg?.kind==='cancel'){finish(undefined);panel.dispose();return;}
      if(msg?.kind!=='generate')return;
      try {if(vscode.workspace.isTrusted!==true)throw Error('Workspace is no longer trusted.'); const data=reviewedContext(msg.data,defaults);finish(data);panel.dispose();}
      catch(e){panel.webview.postMessage({kind:'error',message:e.message});}
    });
    panel.webview.html=`<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'"><style nonce="${nonce}">body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);padding:24px;max-width:760px;margin:auto}form{display:grid;gap:14px} .fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px}label{display:block}input:not([type=checkbox]),select{display:block;box-sizing:border-box;width:100%;padding:8px;margin-top:5px;color:var(--vscode-input-foreground);background:var(--vscode-input-background);border:1px solid var(--vscode-input-border,gray)}button{padding:9px 16px;color:var(--vscode-button-foreground);background:var(--vscode-button-background);border:0;cursor:pointer}fieldset{border:1px solid var(--vscode-panel-border);padding:14px}#error{color:var(--vscode-errorForeground)}button:disabled{opacity:.5}</style></head><body><h1>PGSAFE Migration Assistant</h1><p>Review schema details against your database. No SQL is executed.</p><p>${found?escape((live?"Live candidate from ":"Static candidate from ")+found.source+"; verify against live schema."):"No unambiguous static candidate; enter reviewed details."}</p><p>${escape(comparison)}</p><form id="form"><div class="fields"><label>Schema<input id="schema" required value="${escape(defaults[0]||'public')}"></label><label>Table<input id="table" required value="${escape(defaults[1])}"></label><label>Existing column<input id="column" required value="${escape(defaults[2])}"></label><label>New column (from SQL)<input readonly value="${escape(defaults[3])}"></label><label>Existing type<select id="type" required><option value="">Select type</option>${options(found?.type)}</select></label></div><fieldset><legend>Optional backfill details (single-column key)</legend><div class="fields"><label>Primary key<input id="key" placeholder="e.g. id" value="${escape(found?.key||'')}"></label><label>Key type<select id="keyType"><option value="">Select type</option>${options(found?.keyType)}</select></label><label>Batch size<input id="batch" type="number" min="1" max="10000" value="1000"></label></div><p><label><input id="stable" type="checkbox"> Verified unique, non-null, stable key</label></p><label><input id="writers" type="checkbox"> All writers synchronized; old column authoritative</label></fieldset><label><input id="review" type="checkbox" required> I reviewed these details, including destination absence and table suitability.</label><p id="error" role="alert"></p><div><button id="generate" type="submit">Generate Migration Plan</button> <button id="cancel" type="button">Cancel</button></div></form><script nonce="${nonce}">const api=acquireVsCodeApi(),el=id=>document.getElementById(id);el('form').addEventListener('submit',e=>{e.preventDefault();el('generate').disabled=true;el('error').textContent='';const data={};for(const k of ['schema','table','column','type','key','keyType'])data[k]=el(k).value;for(const k of ['stable','writers','review'])data[k]=el(k).checked;data.batch=Number(el('batch').value);api.postMessage({kind:'generate',data});});el('cancel').onclick=()=>api.postMessage({kind:'cancel'});window.addEventListener('message',e=>{if(e.data.kind==='error'){el('error').textContent=e.data.message;el('generate').disabled=false;}});</script></body></html>`;
  });
}
const {execFile} = require('node:child_process');
function runPlan(node, cli, file, framework, context, format, execute=execFile) {
  if (!['auto','prisma','drizzle','flyway','raw'].includes(framework) || !['markdown','json'].includes(format)) throw new Error('Invalid plan options');
  const args=[cli,'generate',file,'--framework',framework,'--format',format];
  if(context) args.push('--schema-context',context);
  const env={...process.env}; delete env.NODE_OPTIONS; delete env.NODE_PATH;
  return new Promise((resolve,reject)=>execute(node,args,{cwd:path.dirname(path.dirname(cli)),shell:false,windowsHide:true,timeout:30000,maxBuffer:4*1024*1024,encoding:'utf8',env},(err,stdout)=>err?reject(new Error('Plan generation failed or exceeded limits. Check saved SQL, context and bundled runtime.')):resolve(stdout)));
}
function appendPlanAction(vscode, doc, actions) {
  if (!actions.length || vscode.workspace.isTrusted !== true || doc.isDirty || doc.uri.scheme !== 'file' || !doc.fileName.toLowerCase().endsWith('.sql')) return actions;
  const action = new vscode.CodeAction('PGSAFE: Generate Migration Plan', vscode.CodeActionKind.QuickFix);
  action.diagnostics = actions.flatMap(a => a.diagnostics || []);
  action.command = {command:'pgSafeMigrate.generatePlan', title:action.title, arguments:[doc.uri.toString(), doc.version]};
  const result=[...actions,action];
  if (action.diagnostics.some(d=>d.code==='PG001') && typeof doc.getText==='function' && indexFix(doc.getText(),doc.fileName)) {
    const fix=new vscode.CodeAction('PGSAFE: Review concurrent index edit',vscode.CodeActionKind.QuickFix);
    fix.diagnostics=action.diagnostics.filter(d=>d.code==='PG001');
    fix.command={command:'pgSafeMigrate.generatePlan',title:fix.title,arguments:[doc.uri.toString(),doc.version,'index-edit']};
    result.push(fix);
  }
  return result;
}
function register(vscode, findCli, settings, storage) {
  let busy=false;
  return vscode.commands.registerCommand('pgSafeMigrate.generatePlan',async(expectedUri, expectedVersion, mode)=>{
    if(busy) return vscode.window.showWarningMessage('PGSAFE: A migration plan request is already active.');
    if(vscode.workspace.isTrusted!==true) return vscode.window.showWarningMessage('Trust the workspace before generating a plan.');
    const doc=vscode.window.activeTextEditor?.document;
    if(!doc || doc.uri.scheme!=='file' || !doc.fileName.toLowerCase().endsWith('.sql') || doc.isDirty) return vscode.window.showWarningMessage('Open a saved SQL file first.');
    if(typeof expectedUri==='string' && (doc.uri.toString()!==expectedUri || doc.version!==expectedVersion)) return vscode.window.showWarningMessage('SQL selection changed; reopen Quick Fix.');
    busy=true;
    let temporary;
    try {
      const version=doc.version;
      if(mode==='index-edit') {
        const original=doc.getText(), replacement=indexFix(original,doc.fileName);
        if(!replacement) throw Error('Statement no longer eligible.');
        const approved=await vscode.window.showWarningMessage('Review proposed SQL:\n'+replacement+'\nConfirm ordinary nonpartitioned table, unused index name and nontransactional runner. This edits the file only.',{modal:true},'Apply editor edit');
        if(approved!=='Apply editor edit') return;
        const editor=vscode.window.activeTextEditor;
        if(editor?.document!==doc || doc.isClosed || doc.isDirty || doc.version!==version || doc.getText()!==original || vscode.workspace.isTrusted!==true) throw Error('SQL changed; retry.');
        if(!await editor.edit(builder=>builder.replace(new vscode.Range(doc.positionAt(0),doc.positionAt(original.length)),replacement))) throw Error('Editor rejected edit.');
        return;
      }
      const framework='auto', format='markdown';
      const choice=await vscode.window.showQuickPick(['Generate without schema context','Enter reviewed column details','Select reviewed JSON context','Inspect live PostgreSQL metadata'],{placeHolder:'Optional schema details (no file required)',ignoreFocusOut:true});
      if(!choice) return;
      let context, live, provenance;
      if(choice==='Enter reviewed column details'||choice==='Inspect live PostgreSQL metadata') {
        live=choice==='Inspect live PostgreSQL metadata'?await require('./live-schema.cjs').prompt(vscode,contextDefaults(doc.getText()),undefined,storage):undefined;
        if(choice==='Inspect live PostgreSQL metadata'&&!live)return;
        const data=await enterContext(vscode,doc.getText(),vscode.workspace.getWorkspaceFolder?.(doc.uri)?.uri.fsPath,live); if(!data) {vscode.window.showInformationMessage('PGSAFE: Schema entry cancelled; no plan generated.'); return;}
        if(live){const t=data.tables[0];const same=t.columns[0].type===live.type&&(!t.backfill||(t.backfill.primaryKey[0]===live.key&&(t.columns.find(c=>c.name===live.key)?.type===live.keyType)));provenance=same?'Live PostgreSQL metadata inspected during this session; retained values match discovered metadata. Operator readiness assertions are not verified.':'Live PostgreSQL metadata inspected; operator edited schema values. Reverify before use.';}
        temporary=fs.mkdtempSync(path.join(os.tmpdir(),'pgsafe-context-'));
        context=path.join(temporary,'context.json'); fs.writeFileSync(context,JSON.stringify(data),{flag:'wx',mode:0o600});
      }
      if(choice==='Select reviewed JSON context') {
        const files=await vscode.window.showOpenDialog({canSelectMany:false,filters:{JSON:['json']}});
        if(!files?.length || files[0].scheme!=='file') return;
        context=files[0].fsPath;
      }
      const cli=findCli(); if(!cli) throw new Error('Rebuild the standalone runtime.');
      if(vscode.workspace.isTrusted!==true || doc.isClosed || doc.isDirty || doc.version!==version) throw new Error('SQL changed or workspace is no longer trusted.');
      for(const [file,max] of [[doc.uri.fsPath,2*1024*1024],...(context?[[context,1024*1024]]:[])]) {const s=fs.statSync(file); if(!s.isFile()||s.size>max) throw new Error('Invalid or oversized input file.');}
      const node=settings().inspect?.('nodePath')?.globalValue || 'node';
      const report=await runPlan(node,cli,doc.uri.fsPath,framework,context,format);
      if(doc.isClosed || doc.isDirty || doc.version!==version || vscode.workspace.isTrusted!==true) throw new Error('SQL changed during generation; retry.');
      const preview=await vscode.workspace.openTextDocument({language:format,content:provenance?report.replace("Schema context is operator supplied and not verified against a live database.",provenance):report});
      await vscode.window.showTextDocument(preview,{preview:true});
    } catch(e) {vscode.window.showErrorMessage(`PGSAFE: ${e.message}`);} finally {if(temporary) {try {fs.rmSync(temporary,{recursive:true,force:true});} catch {vscode.window.showWarningMessage('PGSAFE: temporary schema context cleanup failed.');}} busy=false;}
  });
}
module.exports={runPlan,register,appendPlanAction,indexFix,enterContext,reviewedContext};
