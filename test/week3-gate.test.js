import test from 'node:test';
import assert from 'node:assert/strict';
import { assessLintPolicy, validateLintPolicy } from '../src/team-policy.js';
const findings = [{ ruleId:'PG001',severity:'warning',file:'a.sql' },{ruleId:'PG002',severity:'error',file:'b.sql'}];
test('lint gate is opt-in and blocks explicitly selected rule',()=>{
 const result=assessLintPolicy(findings,{name:'ci',blockedRules:['PG001']});
 assert.equal(result.passed,false); assert.match(result.reasons.join(' '),/PG001/);
});
test('lint gate counts warnings and applies risk threshold',()=>{
 assert.equal(assessLintPolicy(findings,{maxWarnings:0}).passed,false);
 assert.equal(assessLintPolicy(findings,{maxRiskScore:0}).passed,false);
 assert.equal(assessLintPolicy([],{maxWarnings:0,maxRiskScore:100}).passed,true);
});
test('lint gate refuses simulation-only policies rather than pretending to simulate',()=>{
 assert.throws(()=>validateLintPolicy({requireSimulation:true}),/--assess/);
});
test('lint gate does not classify missing lock context as safe',()=>{
 const result=assessLintPolicy([],{});
 assert.equal(result.passed,true); assert.match(result.note,/not a safety guarantee/);
});
