import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {loadTeamPolicy, applySuppressionPolicy, enforceSuppressionAudit} from '../src/team-policy.js';
const config={suppression:{enabled:true,protectedRules:[]}};
const gate={passed:true,reasons:[]};
const audit=(s={})=>({summary:{suppressed:0,rejected:0,unused:0,scanErrors:0,...s}});
test('policy protection is additive',()=>assert.deepEqual(applySuppressionPolicy(config,{blockedRules:['PG002'],suppression:{protectedRules:['PG001']}}).suppression.protectedRules,['PG011','PG023','PG002','PG001']));
test('default gate allows zero suppressions',()=>assert.equal(enforceSuppressionAudit(gate,{},audit({suppressed:1})).passed,false));
test('explicit limit allows suppression',()=>assert.equal(enforceSuppressionAudit(gate,{suppression:{maxSuppressedFindings:1}},audit({suppressed:1})).passed,true));
for(const key of ['rejected','unused','scanErrors']) test(`${key} blocks gate`,()=>assert.equal(enforceSuppressionAudit(gate,{},audit({[key]:1})).passed,false));
test('existing block retained',()=>assert.equal(enforceSuppressionAudit({passed:false,reasons:['blocked']},{},audit()).passed,false));
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pg-suppression-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const write=(name,value)=>{const f=path.join(dir,name);fs.writeFileSync(f,typeof value==='string'?value:JSON.stringify(value));return f;};return {write};}
for(const suppression of [null,[],{maxSuppressedFindings:-1},{protectedRules:['PG999']},{failOnUnused:'true'},{typo:true}]) test(`invalid policy ${JSON.stringify(suppression)}`,t=>{const {write}=fixture(t);assert.throws(()=>loadTeamPolicy(write('policy.json',{suppression})));});
function cli(t,policy,extra=[]){const {write}=fixture(t);const sql=write('migration.sql','-- pg-safe-migrate-disable-next-line PG002 -- reason: reviewed\nALTER TABLE users DROP COLUMN email;');const cfg=write('config.json',config);const p=write('policy.json',policy);const result=spawnSync(process.execPath,['bin/cli.js',sql,'--config',cfg,'--gate-policy',p,'--format','json','--fail-on','none',...extra],{encoding:'utf8'});assert.notEqual(result.status,2,result.stderr);return {code:result.status,report:JSON.parse(result.stdout)};}
test('blocked rule cannot be suppressed',t=>{const {code,report}=cli(t,{blockedRules:['PG002']});assert.equal(code,1);assert.equal(report.findings.length,1);assert.equal(report.suppression.summary.rejected,1);});
test('risk threshold includes suppressed finding',t=>{const {code,report}=cli(t,{maxRiskScore:0,suppression:{maxSuppressedFindings:1}});assert.equal(code,1);assert.equal(report.findings.length,0);assert.equal(report.gate.decision,'BLOCK');});
test('explicit permitted exception passes gate',t=>{const {code,report}=cli(t,{suppression:{maxSuppressedFindings:1}});assert.equal(code,0);assert.equal(report.gate.decision,'PASS');});
