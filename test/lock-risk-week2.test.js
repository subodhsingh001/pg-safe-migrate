import test from 'node:test';
import assert from 'node:assert/strict';
import { lockFor } from '../src/locks.js';
import { parseSqlFile } from '../src/parser.js';

const cases = [
  ['TRUNCATE TABLE customers;', 'ACCESS EXCLUSIVE', 'reads-and-writes'],
  ['CREATE INDEX idx_email ON users (email);', 'SHARE', 'writes'],
  ['CREATE INDEX CONCURRENTLY idx_email ON users (email);', 'SHARE UPDATE EXCLUSIVE', 'ddl-and-maintenance'],
  ['UPDATE users SET email = email;', 'ROW EXCLUSIVE', 'conflicting-writers-and-ddl'],
  ['ALTER TABLE users ADD COLUMN nickname text;', 'ACCESS EXCLUSIVE', 'reads-and-writes']
];
for (const [sql, mode, impact] of cases) {
  test(`lock classification: ${sql}`, async () => {
    const [stmt] = await parseSqlFile(sql);
    const result = lockFor(stmt);
    assert.equal(result.mode, mode);
    assert.equal(result.impact, impact);
    assert.ok(result.note);
  });
}
test('unknown operations never imply zero-lock safety', () => {
  const result = lockFor({ SelectStmt: {} });
  assert.equal(result.mode, 'unknown');
  assert.equal(result.confidence, 'unknown');
});
