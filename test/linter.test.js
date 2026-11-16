import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { parseSqlFile } from '../src/parser.js';
import { lintStatements } from '../src/engine.js';

test('catches all 6 unsafe PostgreSQL migration operations (PG001-PG006)', async () => {
  const sql = fs.readFileSync(new URL('./unsafe_migration.sql', import.meta.url), 'utf-8');
  const stmts = await parseSqlFile(sql);
  const issues = lintStatements(stmts);

  const ruleIds = issues.map((i) => i.ruleId);
  assert.deepEqual(ruleIds, ['PG001', 'PG002', 'PG003', 'PG004', 'PG005', 'PG006']);
});

test('passes safe zero-downtime PostgreSQL migrations with 0 errors', async () => {
  const sql = fs.readFileSync(new URL('./safe_migration.sql', import.meta.url), 'utf-8');
  const stmts = await parseSqlFile(sql);
  const issues = lintStatements(stmts);

  assert.equal(issues.length, 0);
});
