import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeRisk } from '../src/risk.js';

test('legacy severity scoring remains stable without context', () => {
  assert.equal(summarizeRisk([{ severity: 'error' }]).score, 20);
  assert.equal(summarizeRisk([]).confidence, 'low');
});
test('ACCESS EXCLUSIVE adds explainable lock impact', () => {
  const result = summarizeRisk([], { operations: [{ lock: { mode: 'ACCESS EXCLUSIVE' } }] });
  assert.equal(result.score, 15);
  assert.equal(result.breakdown.lock, 15);
});
test('lock score uses strongest operation, not count', () => {
  const operations = Array.from({ length: 100 }, () => ({ lock: { mode: 'SHARE' } }));
  assert.equal(summarizeRisk([], { operations }).breakdown.lock, 8);
});
test('unknown locks are disclosed and never treated as proven safe', () => {
  const result = summarizeRisk([], { operations: [{ lock: { mode: 'unknown' } }] });
  assert.equal(result.unknownLocks, true);
  assert.equal(result.confidence, 'low');
});
test('destructive operations contribute bounded points', () => {
  const findings = [{ ruleId: 'PG023', severity: 'error', file: 'a.sql', line: 1 }];
  const result = summarizeRisk(findings);
  assert.equal(result.breakdown.destructive, 5);
  assert.equal(result.score, 25);
});
test('optional table size and transaction risk require explicit context', () => {
  const result = summarizeRisk([], { transactionRisk: true, tableStats: { estimatedRows: 1000000 } });
  assert.equal(result.score, 20);
  assert.equal(result.breakdown.transaction, 10);
  assert.equal(result.breakdown.tableSize, 10);
});
test('score is capped at 100', () => {
  const findings = Array.from({ length: 20 }, (_, i) => ({ ruleId: 'PG023', severity: 'error', line: i + 1 }));
  assert.equal(summarizeRisk(findings).score, 100);
});
