import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, isExcluded } from '../src/config.js';
import { toJson, toSarif } from '../src/reports.js';
import { advise } from '../src/advisor.js';
import { additionalRules } from '../src/rules/additionalRules.js';

test('configuration validates rules and exclusions', () => {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pgcfg-'));
 try { const file=path.join(dir,'config.json'); fs.writeFileSync(file,JSON.stringify({rules:{PG001:'warning'},exclude:['legacy/']})); const c=loadConfig(file); assert.equal(c.rules.PG001,'warning'); assert.equal(isExcluded(path.join(dir,'legacy','old.sql'),c.exclude,dir),true); fs.writeFileSync(file,JSON.stringify({rules:{PG001:'bad'}})); assert.throws(()=>loadConfig(file),/Invalid rule/); } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('JSON and SARIF are parseable and retain findings',()=>{const findings=[{ruleId:'PG001',severity:'error',file:'a.sql',line:1,column:1,message:'risk',fix:'fix'}];assert.equal(JSON.parse(toJson(findings)).findings.length,1);const s=JSON.parse(toSarif(findings));assert.equal(s.runs[0].results[0].ruleId,'PG001');});
test('advisor returns deployment guidance',()=>assert.ok(advise({ruleId:'PG002'}).steps.length>=3));
test('drop table AST rule',()=>assert.equal(additionalRules.check({DropStmt:{removeType:'OBJECT_TABLE'}})[0].ruleId,'PG011'));
