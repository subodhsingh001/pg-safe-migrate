import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeFiles } from '../src/analysis.js';

const merge = 'MERGE INTO target t USING source s ON t.id = s.id WHEN MATCHED THEN UPDATE SET value = s.value;';

test('PG019 flags MERGE on PostgreSQL 14', async () => {
  const findings = await analyzeFiles([{ file: 'migration.sql', sql: merge }], { postgresVersion: 14 });
  assert.equal(findings.filter(f => f.ruleId === 'PG019').length, 1);
  assert.match(findings.find(f => f.ruleId === 'PG019').message, /PostgreSQL 15/);
});

test('PG019 does not flag MERGE on PostgreSQL 15-18', async () => {
  for (const postgresVersion of [15, 16, 17, 18]) {
    const findings = await analyzeFiles([{ file: 'migration.sql', sql: merge }], { postgresVersion });
    assert.equal(findings.some(f => f.ruleId === 'PG019'), false);
  }
});

test('PG019 is disabled when version is unspecified or rule is off', async () => {
  const entries = [{ file: 'migration.sql', sql: merge }];
  assert.equal((await analyzeFiles(entries)).some(f => f.ruleId === 'PG019'), false);
  assert.equal((await analyzeFiles(entries, { postgresVersion: 14, rules: { PG019: 'off' } })).some(f => f.ruleId === 'PG019'), false);
});
