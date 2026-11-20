import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSummary } from '../scripts/week3-pr-summary.mjs';
test('PR summary shows baseline and gate decisions', () => {
  const summary = buildSummary({filesChecked:1, findings:[{ruleId:'PG001',severity:'error',file:'m.sql',line:1,fix:'Use concurrently'}],baseline:{newCount:1,existingCount:0,resolvedCount:0,newFindings:[{ruleId:'PG001',severity:'error',file:'m.sql',line:1,fix:'Use concurrently'}]},gate:{passed:false,reasons:['Blocked PG001']}},1);
  assert.match(summary,/BLOCK/); assert.match(summary,/1 new/); assert.match(summary,/PG001/);
});
test('PR summary does not misrepresent missing report as pass', () => {
  assert.match(buildSummary(null,2),/Analysis unavailable/);
});
test('PR summary escapes table separators and markup', () => {
  const summary=buildSummary({filesChecked:1,findings:[{ruleId:'PG001',severity:'error',file:'x|y.sql',line:1,fix:'<unsafe>'}]},1);
  assert.match(summary,/x\\\|y.sql/); assert.match(summary,/&lt;unsafe&gt;/);
});
test('PR summary contains advisory production context', () => {
  const summary=buildSummary({filesChecked:1,findings:[],production:{source:'user-supplied',assessments:[{ruleId:'PG001',table:'public.users',attention:'elevated',potentialImpact:'writes',guidance:['Use concurrently']}]},gate:{passed:true}},0);
  assert.match(summary,/public.users/); assert.match(summary,/advisory only/);
});
