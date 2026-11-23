
import test from 'node:test';
import assert from 'node:assert/strict';

import { analyzeFiles, position } from '../src/analysis.js';

test('position preserves line and column accuracy', () => {
  const sql = [
    '-- migration comment',
    '',
    'CREATE TABLE users (id integer);',
    '',
    'DROP TABLE users;'
  ].join('\n');

  const offset = sql.indexOf('DROP TABLE');

  assert.deepEqual(position(sql, offset), {
    line: 5,
    column: 1
  });
});

test('optimized analysis preserves positions across many statements', async () => {
  const statements = Array.from(
    { length: 1000 },
    (_, i) => `CREATE TABLE table_${i} (id integer);`
  );

  statements.push('DROP TABLE important_data;');

  const sql = statements.join('\n');

  const findings = await analyzeFiles([
    {
      file: 'large-migration.sql',
      sql
    }
  ]);

  const dropFinding = findings.find(
    finding => finding.message.includes('DROP TABLE')
  );

  assert.ok(
    dropFinding,
    'Expected a DROP TABLE risk finding'
  );

  assert.equal(dropFinding.line, 1001);
  assert.equal(dropFinding.column, 1);
});

test('optimized analysis handles multiline SQL', async () => {
  const sql = [
    'CREATE TABLE users (',
    '  id integer',
    ');',
    '',
    'DROP TABLE users;'
  ].join('\n');

  const findings = await analyzeFiles([
    {
      file: 'multiline.sql',
      sql
    }
  ]);

  const dropFinding = findings.find(
    finding =>
     finding.message.includes('DROP TABLE')
  );

  assert.ok(dropFinding);
  assert.equal(dropFinding.line, 5);
  assert.equal(dropFinding.column, 1);
});
