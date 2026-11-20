import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRiskBaseline, compareRiskBaseline, loadRiskBaseline, writeRiskBaseline } from '../src/risk-baseline.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sample = (file, sql, line=1) => ({entries:[{file,sql}], findings:[{file,line,ruleId:'PG001',severity:'error',message:'Index blocks writes'}]});
test('baseline preserves unchanged findings across line shifts',()=>{
 const before=sample('migrations/a.sql','CREATE INDEX idx ON users(email);');
 const after=sample('migrations/a.sql','\n\nCREATE INDEX idx ON users(email);',3);
 const result=compareRiskBaseline(after.findings,after.entries,createRiskBaseline(before.findings,before.entries));
 assert.equal(result.newCount,0);assert.equal(result.existingCount,1);
});
test('modified SQL is treated as new risk',()=>{
 const before=sample('migrations/a.sql','CREATE INDEX idx ON users(email);');
 const after=sample('migrations/a.sql','CREATE INDEX idx ON users(phone);');
 const result=compareRiskBaseline(after.findings,after.entries,createRiskBaseline(before.findings,before.entries));
 assert.equal(result.newCount,1);assert.equal(result.resolvedCount,1);
});
test('removed findings are reported as resolved',()=>{
 const before=sample('migrations/a.sql','CREATE INDEX idx ON users(email);');
 const result=compareRiskBaseline([],before.entries,createRiskBaseline(before.findings,before.entries));
 assert.equal(result.resolvedCount,1);
});
test('duplicate findings are counted, not collapsed',()=>{
 const before=sample('migrations/a.sql','CREATE INDEX idx ON users(email);');
 const after={...before,findings:[...before.findings,...before.findings]};
 const result=compareRiskBaseline(after.findings,after.entries,createRiskBaseline(before.findings,before.entries));
 assert.equal(result.newCount,1);assert.equal(result.existingCount,1);
});
test('invalid baseline fails validation',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pgsafe-baseline-'));
 try { const file=path.join(dir,'baseline.json');fs.writeFileSync(file,JSON.stringify({schemaVersion:2,tool:'pg-safe-migrate',fingerprints:[]}));assert.throws(()=>loadRiskBaseline(file),/Invalid risk baseline/); }
 finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('CLI baseline gates new findings but permits historical ones',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pgsafe-baseline-cli-'));
 try {
  const baseline=path.join(dir,'baseline.json');const policy=path.join(dir,'policy.json');
  fs.writeFileSync(policy,JSON.stringify({name:'ci',blockedRules:['PG001']}));
  const args=['bin/cli.js','examples/unsafe.sql','--risk-baseline',baseline,'--gate-policy',policy,'--format','json','--fail-on','none'];
  const generate=spawnSync(process.execPath,['bin/cli.js','examples/unsafe.sql','--write-risk-baseline',baseline,'--fail-on','none'],{cwd:root,encoding:'utf8'});
  assert.equal(generate.status,0,generate.stderr);
  const existing=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8'});
  assert.equal(existing.status,0,existing.stderr);
  assert.equal(JSON.parse(existing.stdout).baseline.existingCount,1);
  assert.equal(JSON.parse(existing.stdout).gate.decision,'PASS');
  const fresh=spawnSync(process.execPath,['bin/cli.js','examples/unsafe.sql','--risk-baseline',path.join(dir,'missing.json'),'--gate-policy',policy],{cwd:root,encoding:'utf8'});
  assert.equal(fresh.status,2);
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
