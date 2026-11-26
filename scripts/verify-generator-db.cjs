// Explicit opt-in test: only a fresh, network-disabled disposable container.
const {spawnSync}=require('node:child_process');
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
function run(cmd,args,input){const r=spawnSync(cmd,args,{input,encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024,shell:false});if(r.error||r.status!==0)throw new Error(r.error?.message||r.stderr||'Command failed');return r.stdout.trim();}
const plan=JSON.parse(run(process.execPath,[path.join(root,'bin/cli.js'),'generate',path.join(root,'examples/generator-backfill.sql'),'--schema-context',path.join(root,'examples/generator-backfill-context.json'),'--format','json']));
const op=plan.operations[0];const sql=phase=>{const s=op.steps.find(s=>s.phase===phase)?.sql;assert.ok(s);return s;};
const id=run('docker',['run','-d','--rm','--network','none','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:16']);
try{
 const query=s=>run('docker',['exec','-i',id,'psql','-X','-U','postgres','-v','ON_ERROR_STOP=1','-Atq'],s);
 (async()=>{try{
 let ready=false;for(let i=0;i<60;i++){try{run('docker',['exec',id,'pg_isready','-U','postgres','-h','127.0.0.1']);ready=true;break;}catch{await new Promise(r=>setTimeout(r,1000));}}assert.ok(ready,'Database not ready');
 query('CREATE TABLE public.users(id bigint PRIMARY KEY,email text); INSERT INTO public.users SELECT i, CASE WHEN i%3=0 THEN NULL ELSE i::text END FROM generate_series(1,2500) i;');
 query(sql('expand')); assert.equal(query(sql('validate')),'1667');
 query(sql('backfill')); assert.equal(query(sql('validate')),'667');
 query(sql('backfill')); assert.equal(query(sql('validate')),'0');
 query(sql('backfill')); assert.equal(query(sql('validate')),'0');
 query("UPDATE public.users SET email='changed',email_address='changed' WHERE id=1;");query(sql('backfill'));assert.equal(query(sql('validate')),'0');
 console.log('PASS: generated expansion, bounded backfill, NULL handling, repeatability and synchronized write');
 }catch(e){console.error(e.message);process.exitCode=1;}finally{try{run('docker',['rm','-f',id]);}catch(e){console.error(e.message);process.exitCode=1;}}})();
}catch(e){run('docker',['rm','-f',id]);throw e;}
