import test from 'node:test';
import assert from 'node:assert/strict';
import { toMarkdownReport, toJson, toSarif } from '../src/reports.js';
import { summarizeRisk } from '../src/risk.js';
const finding = {ruleId:'PG023',severity:'error',file:'migrations/a|b.sql',line:3,column:1,message:'TRUNCATE <customers> | destructive',fix:'Review | recovery plan'};
test('Markdown report includes escaped, actionable diagnostics', () => {
 const out=toMarkdownReport([finding],{filesChecked:1,postgresVersion:16});
 assert.match(out,/PG023/);assert.match(out,/a\\\|b.sql/);assert.match(out,/&lt;customers&gt;/);assert.match(out,/Review \\\| recovery plan/);
});
test('Markdown report handles zero findings without safety guarantee',()=>{
 const out=toMarkdownReport([],{filesChecked:2});assert.match(out,/No configured findings/);assert.match(out,/does not guarantee/);
});
test('Risk breakdown and limitations appear only when provided',()=>{
 const out=toMarkdownReport([finding],{risk:summarizeRisk([finding],{operations:[{lock:{mode:'ACCESS EXCLUSIVE'}}]})});
 assert.match(out,/Risk assessment/);assert.match(out,/destructive/);assert.match(out,/Limitations/);
});
test('JSON and SARIF existing schemas remain unchanged',()=>{
 assert.equal(JSON.parse(toJson([finding])).findings[0].ruleId,'PG023');
 assert.equal(JSON.parse(toSarif([finding])).runs[0].results[0].ruleId,'PG023');
});
