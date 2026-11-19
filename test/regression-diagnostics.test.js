import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeFiles } from '../src/analysis.js';
import { parseSqlFile } from '../src/parser.js';
import { position } from '../src/analysis.js';

const sql = `TRUNCATE TABLE customers;\n\nALTER TABLE users\nALTER COLUMN email SET NOT NULL;\n\nALTER TABLE orders\nDROP CONSTRAINT orders_customer_id_fkey;\n`;

test('multi-statement SQL retains exact starting line and column', async () => {
  const parsed = await parseSqlFile(sql, { details: true });
  assert.equal(parsed.length, 3);
  assert.deepEqual(parsed.map(({ offset }) => position(sql, offset)), [
    { line: 1, column: 1 },
    { line: 3, column: 1 },
    { line: 6, column: 1 }
  ]);
});

test('PG025 supersedes duplicate PG013 for the same statement', async () => {
  const findings = await analyzeFiles([{ file: 'migration-test.sql', sql }]);
  const selected = findings.filter(f => ['PG023', 'PG024', 'PG025', 'PG013'].includes(f.ruleId));
  assert.deepEqual(selected.map(f => [f.ruleId, f.line, f.column]), [
    ['PG023', 1, 1],
    ['PG025', 3, 1],
    ['PG024', 6, 1]
  ]);
});
