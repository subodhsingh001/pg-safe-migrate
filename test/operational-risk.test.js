import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSqlFile } from '../src/parser.js';
import { lintStatements } from '../src/engine.js';

async function rules(sql) {
  const stmts = await parseSqlFile(sql);
  return lintStatements(stmts).map(x => x.ruleId);
}

test('PG021 flags recognized volatile DEFAULT functions', async () => {
  assert.ok((await rules('ALTER TABLE users ADD COLUMN token float DEFAULT random();')).includes('PG021'));
  assert.ok((await rules("ALTER TABLE users ADD COLUMN created_at timestamptz DEFAULT clock_timestamp();")).includes('PG021'));
});

test('PG021 does not flag constant or stable defaults', async () => {
  assert.ok(!(await rules('ALTER TABLE users ADD COLUMN score integer DEFAULT 0;')).includes('PG021'));
  assert.ok(!(await rules('ALTER TABLE users ADD COLUMN created_at timestamptz DEFAULT now();')).includes('PG021'));
  assert.ok(!(await rules('ALTER TABLE users ADD COLUMN label text;')).includes('PG021'));
});

test('PG022 flags SET LOGGED but not SET UNLOGGED', async () => {
  assert.ok((await rules('ALTER TABLE events SET LOGGED;')).includes('PG022'));
  assert.ok(!(await rules('ALTER TABLE events SET UNLOGGED;')).includes('PG022'));
});

test('existing type-change rule remains active without duplicate new findings', async () => {
  const ids = await rules('ALTER TABLE users ALTER COLUMN age TYPE bigint;');
  assert.ok(ids.includes('PG003'));
  assert.ok(!ids.includes('PG021'));
  assert.ok(!ids.includes('PG022'));
});
