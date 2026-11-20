import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { validateProductionContext, productionAssessment } from '../src/production-context.js';

const ctx = { schemaVersion: 1, tables: [{ schema: 'public', table: 'users', estimatedRows: 1200000, bytes: 2147483648, writeQueriesPerSecond: 25 }] };
test('validates bounded context', () => assert.equal(validateProductionContext(ctx).tables.length, 1));
test('rejects invalid table estimates', () => assert.throws(() => validateProductionContext({ schemaVersion: 1, tables: [{ schema: 'public', table: 'users', estimatedRows: -1 }] }), /estimatedRows/));
test('rejects duplicate tables', () => assert.throws(() => validateProductionContext({ schemaVersion: 1, tables: [ctx.tables[0], ctx.tables[0]] }), /Duplicate/));
test('rejects unknown context keys', () => assert.throws(() => validateProductionContext({ ...ctx, password: 'secret' }), /Unknown/));
test('classifies large write-blocking index risk without predicting downtime', () => {
  const a = productionAssessment([{ ruleId: 'PG001', file: 'unsafe.sql', line: 1, column: 1, message: 'CREATE INDEX on "users" acquires a SHARE lock', lock: { mode: 'SHARE' } }], ctx);
  assert.equal(a.assessments[0].attention, 'elevated');
  assert.equal(a.assessments[0].potentialImpact, 'writes');
  assert.equal(a.assessments[0].table, 'public.users');
});
test('ambiguous table names never apply statistics', () => {
  const a = productionAssessment([{ ruleId: 'PG001', message: 'CREATE INDEX on "users"', lock: { mode: 'SHARE' } }], { schemaVersion: 1, tables: [ctx.tables[0], { schema: 'other', table: 'users' }] });
  assert.equal(a.assessments[0].table, null);
});
test('CLI JSON includes production advisory and keeps gate BLOCK', () => {
  const run = spawnSync(process.execPath, ['bin/cli.js', 'examples/unsafe.sql', '--production-context', 'examples/week3-production-context.json', '--gate-policy', 'examples/week3-gate-policy.json', '--format', 'json', '--fail-on', 'none'], { encoding: 'utf8' });
  assert.equal(run.status, 1, run.stderr);
  const result = JSON.parse(run.stdout);
  assert.equal(result.gate.decision, 'BLOCK');
  assert.equal(result.production.assessments[0].attention, 'elevated');
});
