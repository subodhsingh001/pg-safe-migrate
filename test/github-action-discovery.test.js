import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {discoverSql} from '../github-action/discovery.mjs';
import {analyzeCommit} from '../github-action/analyze.mjs';
function fixture(t) {
 const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'pgsafe-pr-')); t.after(()=>fs.rmSync(cwd,{recursive:true,force:true}));
 const git=(...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 git('init');git('config','user.email','test@example.invalid');git('config','user.name','Test');git('config','commit.gpgsign','false');
 const write=(file,sql)=>{fs.mkdirSync(path.dirname(path.join(cwd,file)),{recursive:true});fs.writeFileSync(path.join(cwd,file),sql);};
 const commit=()=>{git('add','-A');git('commit','-m','fixture');return git('rev-parse','HEAD');};
 write('migrations/old.sql','SELECT 1;');write('migrations/deleted.sql','SELECT 2;');const base=commit();
 write('prisma/migrations/one/migration.sql','ALTER TABLE users DROP COLUMN email;');fs.unlinkSync(path.join(cwd,'migrations/deleted.sql'));write('other.sql','SELECT 3;');const head=commit();
 return {cwd,base,head,write,commit,git};
}
test('changed reads committed blobs, ignores deleted and dirty files',t=>{const f=fixture(t);f.write('other.sql','SELECT 999;');f.write('untracked.sql','SELECT 4;');const rows=discoverSql(f);assert.deepEqual(rows.map(x=>x.file),['other.sql','prisma/migrations/one/migration.sql']);assert.equal(rows[0].sql,'SELECT 3;');});
test('all mode scans migration roots only',t=>{const f=fixture(t);assert.deepEqual(discoverSql({...f,mode:'all'}).map(x=>x.file),['migrations/old.sql','prisma/migrations/one/migration.sql']);});
test('invalid refs rejected',t=>{const f=fixture(t);assert.throws(()=>discoverSql({...f,head:'--help'}),/SHA/);});
test('SQL symlink rejected from Git tree without following it',t=>{const f=fixture(t);const oid=f.git('rev-parse',`${f.head}:other.sql`);f.git('update-index','--add','--cacheinfo',`120000,${oid},link.sql`);f.git('commit','-m','link');assert.throws(()=>discoverSql({...f,head:f.git('rev-parse','HEAD')}),/Non-regular/);});
test('oversize SQL rejected',t=>{const f=fixture(t);f.write('large.sql',' '.repeat(2*1024*1024+1));assert.throws(()=>discoverSql({...f,head:f.commit()}),/size limit/);});
test('real engine blocks committed destructive SQL',async t=>{const f=fixture(t);const r=await analyzeCommit(f);assert.equal(r.exitCode,1);assert.equal(r.status,'blocked');assert.ok(r.findings.some(x=>x.ruleId==='PG002'||x.rule==='PG002'||x.id==='PG002'));});
test('no changes explicitly reported',async t=>{const f=fixture(t);const r=await analyzeCommit({...f,base:f.head});assert.equal(r.status,'no-migrations');assert.equal(r.filesChecked,0);});
