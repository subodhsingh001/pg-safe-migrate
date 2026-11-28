'use strict';
const TYPES=new Map([['text','text'],['int2','smallint'],['int4','integer'],['int8','bigint'],['bool','boolean'],['uuid','uuid'],['date','date'],['timestamp','timestamp'],['timestamptz','timestamptz'],['float4','real'],['float8','double precision'],['bytea','bytea']]);
const SQL=`SELECT a.attname AS name,t.typname AS type,n2.nspname AS type_schema,a.atttypmod AS modifier,a.attnotnull AS not_null, EXISTS (SELECT 1 FROM pg_catalog.pg_index i WHERE i.indrelid=c.oid AND i.indisprimary AND a.attnum=ANY(i.indkey)) AS pk FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid JOIN pg_catalog.pg_type t ON t.oid=a.atttypid JOIN pg_catalog.pg_namespace n2 ON n2.oid=t.typnamespace WHERE n.nspname=$1 AND c.relname=$2 AND c.relkind='r' AND NOT c.relispartition AND NOT c.relrowsecurity AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_inherits h WHERE h.inhrelid=c.oid OR h.inhparent=c.oid) AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum LIMIT 1601`;
async function inspect(config, defaults, Client, progress=()=>{}){
 const [schema,table,column,destination]=defaults;
 if(!schema||!table||!column||!destination)throw Error('Live discovery requires a simple schema-qualified rename.');
 const client=new Client({...config,connectionTimeoutMillis:5000,query_timeout:8000,statement_timeout:5000,application_name:'PGSAFE metadata'});
 try{progress('connect');await client.connect();progress('read-only transaction');await client.query('BEGIN READ ONLY');await client.query('SET LOCAL search_path = pg_catalog');progress('catalog query');const {rows}=await client.query(SQL,[schema,table]);await client.query('ROLLBACK');progress('metadata validation');
 const source=rows.find(r=>r.name===column),keys=rows.filter(r=>r.pk);const type=r=>r?.type_schema==='pg_catalog'&&r.modifier===-1?TYPES.get(r.type):undefined;
 if(rows.length>1600||!type(source)||rows.some(r=>r.name===destination))throw Error('Unsupported or conflicting live schema.');
 const key=keys.length===1&&keys[0].not_null&&type(keys[0])?keys[0]:null;
 return {source:'Live PostgreSQL metadata',type:type(source),key:key?.name||'',keyType:type(key)||'',keyColumns:keys.map(k=>k.name)};
 }finally{await client.end().catch(()=>{});}
}
function connectionConfig(data){
 const {host,port,database,user,password,tls}=data||{};
 if(typeof host!=='string'||host.length>253||!/^[a-zA-Z0-9.:-]+$/.test(host)||typeof port!=='string'||!/^\d{1,5}$/.test(port)||Number(port)<1||Number(port)>65535||[database,user].some(x=>typeof x!=='string'||!x.trim()||x.length>128||/[\x00-\x1f\x7f]/.test(x))||typeof password!=='string'||!password||password.length>4096||!['local','verified'].includes(tls))throw Error('Invalid connection settings.');
 if(tls==='local'&&!['localhost','127.0.0.1','::1'].includes(host))throw Error('Verified TLS is required for remote connections.');
 return {host,port:Number(port),database,user,password,ssl:tls==='verified'?{rejectUnauthorized:true}:false};
}
function safeError(e){const messages={ECONNREFUSED:'Connection refused. Check database service and port.',ENOTFOUND:'Host not found. Check hostname.',ETIMEDOUT:'Connection timed out. Check network and firewall.', '28P01':'Authentication failed. Check username and password.','28000':'Authentication rejected. Check database access rules.','3D000':'Database does not exist.','42501':'Insufficient database permissions.',CERT_HAS_EXPIRED:'TLS certificate expired.',SELF_SIGNED_CERT_IN_CHAIN:'TLS certificate is not trusted.',DEPTH_ZERO_SELF_SIGNED_CERT:'TLS certificate is not trusted.',UNABLE_TO_VERIFY_LEAF_SIGNATURE:'TLS certificate could not be verified.',ERR_TLS_CERT_ALTNAME_INVALID:'TLS hostname verification failed.'};return (Object.hasOwn(messages,e?.code)?messages[e.code]:undefined)|| (e?.message==='Unsupported or conflicting live schema.'?'Table or column unsupported, missing, or destination already exists.':'Inspection failed. Check connection, TLS, timeout and bundled pg runtime.');}
async function prompt(vscode,defaults,Client){
 if(defaults.some(x=>!x))throw Error('Live discovery requires a simple schema-qualified rename.');
 if(vscode.workspace.isTrusted!==true)return;
 const nonce=require('node:crypto').randomBytes(24).toString('hex');
 const panel=vscode.window.createWebviewPanel('pgsafeConnection','PGSAFE: Connection Manager',vscode.ViewColumn.Beside,{enableScripts:true,localResourceRoots:[]});
 return new Promise(resolve=>{
 let done=false,busy=false,listener,closed,pendingResult;
 const output=vscode.window.createOutputChannel?.('PGSAFE Connection');
 const log=message=>output?.appendLine(message);
 const disposeOutput=()=>output?.dispose();
 const finish=value=>{if(done)return;done=true;listener?.dispose();closed?.dispose();disposeOutput();resolve(value);};
 closed=panel.onDidDispose(()=>finish(undefined));
 listener=panel.webview.onDidReceiveMessage(async msg=>{
 if(done)return;if(msg?.kind==='cancel'){finish(undefined);panel.dispose();return;}
 if(busy)return;
 if(msg?.kind==='continue'){if(pendingResult&&vscode.workspace.isTrusted===true){finish(pendingResult);panel.dispose();}return;}
 if(!['test','discover'].includes(msg?.kind))return;pendingResult=undefined;busy=true;
 const send=(kind,message)=>{if(!done)panel.webview.postMessage({kind,message});};
 let stage='settings';
 const progress=value=>{stage=value;log('Stage: '+value);send('progress',value+'...');};
 try{
 if(vscode.workspace.isTrusted!==true)throw Error('Workspace is not trusted.');
 let config;try{config=connectionConfig(msg.data);}catch(e){send('error',e.message);return;}
 progress('load bundled driver');
 const Driver=Client||require('./runtime/node_modules/pg').Client;
 if(msg.kind==='test'){
 const client=new Driver({...config,connectionTimeoutMillis:5000,query_timeout:8000,statement_timeout:5000,application_name:'PGSAFE metadata'});
 try{progress('connect');await client.connect();progress('read-only connection test');await client.query('BEGIN READ ONLY');await client.query('SELECT 1');await client.query('ROLLBACK');}finally{await client.end().catch(()=>{});}
 send('success','Connection successful. Schema has not yet been inspected.');
 }else{
 const result=await inspect(config,defaults,Driver,progress);
 if(!done&&vscode.workspace.isTrusted===true){pendingResult=result;send('preview',JSON.stringify(result));}else send('error','Workspace is no longer trusted.');
 }
 }catch(e){const code=typeof e?.code==='string'&&/^(?:[0-9A-Z]{5}|E[A-Z_]{2,40}|MODULE_NOT_FOUND)$/.test(e.code)?e.code:'unclassified';const detail=stage==='load bundled driver'?'Bundled PostgreSQL driver could not load.':safeError(e);const message=stage+': '+detail+' ['+code+']';log(message);output?.show(true);send('error',message);}finally{busy=false;}
 });
 panel.webview.html=`<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'"><style nonce="${nonce}">body{font-family:var(--vscode-font-family);padding:24px;max-width:700px;margin:auto;color:var(--vscode-foreground)}form{display:grid;gap:14px} .fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px}input,select{display:block;width:100%;box-sizing:border-box;padding:8px;margin-top:5px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border,gray)}button{padding:9px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:0;margin:4px}button:disabled{opacity:.5}#status{white-space:pre-wrap}</style></head><body><h1>PGSAFE Connection Manager</h1><p>Use credentials supplied by your database administrator or local database setup. PGSAFE does not create accounts. Passwords are not saved. Only read-only queries are sent.</p><form id="form"><div class="fields"><label>Host<input id="host" required value="127.0.0.1"></label><label>Port<input id="port" required type="number" min="1" max="65535" value="5432"></label><label>Database<input id="database" required value="postgres"></label><label>Username<input id="user" required autocomplete="off" placeholder="Database role"></label></div><label>Password<input id="password" required type="password" autocomplete="off"></label><label>TLS<select id="tls"><option value="verified">Require verified TLS</option><option value="local">Local loopback only (no TLS)</option></select></label><p>For a local Docker database, use its published host port and the role/password you created.</p><div><button id="test" type="button">Test Connection</button><button id="discover" type="submit">Connect &amp; Discover</button><button id="cancel" type="button">Cancel</button></div><button id="continue" type="button" hidden>Use discovered metadata</button><pre id="preview" hidden></pre><p id="status" role="status" aria-live="polite"></p></form><script nonce="${nonce}">const api=acquireVsCodeApi(),el=id=>document.getElementById(id);function send(kind){el('continue').hidden=el('preview').hidden=true;if(!el('form').reportValidity())return;const data={};for(const k of ['host','port','database','user','password','tls'])data[k]=el(k).value;el('test').disabled=el('discover').disabled=true;el('status').textContent='Connecting...';api.postMessage({kind,data});}el('test').onclick=()=>send('test');el('form').onsubmit=e=>{e.preventDefault();send('discover');};el('continue').onclick=()=>{el('password').value='';api.postMessage({kind:'continue'});};el('cancel').onclick=()=>{el('password').value='';api.postMessage({kind:'cancel'});};window.addEventListener('message',e=>{if(e.data.kind==='progress'){el('status').textContent=e.data.message;}if(e.data.kind==='preview'){el('preview').textContent=e.data.message;el('preview').hidden=el('continue').hidden=false;el('status').textContent='Metadata discovered. Review before continuing.';el('test').disabled=el('discover').disabled=false;}if(['error','success'].includes(e.data.kind)){el('status').textContent=e.data.message;el('test').disabled=el('discover').disabled=false;}});</script></body></html>`;
 });
}
module.exports={inspect,prompt,SQL,connectionConfig,safeError};
