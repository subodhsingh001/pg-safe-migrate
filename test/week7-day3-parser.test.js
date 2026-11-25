import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSqlFile } from '../src/parser.js';
import { analyzeFiles } from '../src/analysis.js';

const drop = 'ALTER TABLE users DROP COLUMN email;';
const index = 'CREATE INDEX CONCURRENTLY idx_email ON users(email);';
const analyze = sql => analyzeFiles([{ file: 'migration.sql', sql }]);
async function expectFinding(sql, ruleId, line, column) {
  const findings = await analyze(sql);
  assert.deepEqual(findings.map(f => [f.ruleId, f.line, f.column]), [[ruleId, line, column]]);
}

for (const [name, prefix] of [
  ['Bengali', "SELECT 'বাংলা';"],
  ['Japanese', "SELECT '日本語';"],
  ['emoji', "SELECT '😀';"],
  ['accented Latin', "SELECT 'café';"],
  ['mixed Unicode', "SELECT 'বাংলা 日本語 😀';"],
]) {
  test(`Unicode position: ${name}`, async () => {
    await expectFinding(`${prefix}\n${drop}`, 'PG002', 2, 1);
  });
}

test('Unicode same-line UTF-16 column', async () => {
  const prefix = "SELECT '😀'; ";
  await expectFinding(prefix + drop, 'PG002', 1, prefix.length + 1);
});
test('Unicode with CRLF and indentation', async () => {
  await expectFinding(`SELECT 'বাংলা';\r\n  ${drop}`, 'PG002', 2, 3);
});
test('quoted Unicode identifiers', async () => {
  await expectFinding('ALTER TABLE "顧客" DROP COLUMN "名前";', 'PG002', 1, 1);
});
for (const [name, statements] of [
  ['rollback to savepoint', ['BEGIN;', 'SAVEPOINT s;', 'ROLLBACK TO SAVEPOINT s;']],
  ['rollback to shorthand', ['BEGIN;', 'SAVEPOINT s;', 'ROLLBACK TO s;']],
  ['release savepoint', ['BEGIN;', 'SAVEPOINT s;', 'RELEASE SAVEPOINT s;']],
  ['commit and chain', ['BEGIN;', 'COMMIT AND CHAIN;']],
  ['rollback and chain', ['BEGIN;', 'ROLLBACK AND CHAIN;']],
  ['start transaction', ['START TRANSACTION;']],
]) {
  test(`PG008: ${name}`, async () => {
    await expectFinding([...statements, index, 'COMMIT;'].join('\n'), 'PG008', statements.length + 1, 1);
  });
}
for (const end of ['COMMIT;', 'ROLLBACK;', 'COMMIT AND NO CHAIN;', 'ROLLBACK AND NO CHAIN;']) {
  test(`transaction ends: ${end}`, async () => {
    assert.deepEqual(await analyze(`BEGIN;\n${end}\n${index}`), []);
  });
}
test('dollar quoted string is not split', async () => {
  await expectFinding(`SELECT $tag$DROP TABLE users; BEGIN; COMMIT;$tag$;\n${drop}`, 'PG002', 2, 1);
});
test('escaped quote and semicolon are not split', async () => {
  await expectFinding(`SELECT 'it''s; DROP TABLE users;';\n${drop}`, 'PG002', 2, 1);
});
test('nested comments do not produce findings', async () => {
  assert.deepEqual(await analyze('/* outer /* DROP TABLE users; */ BEGIN; */ SELECT 1;'), []);
});
test('PL/pgSQL body is parsed as one outer statement', async () => {
  const sql = 'CREATE FUNCTION f() RETURNS void LANGUAGE plpgsql AS $$ BEGIN PERFORM 1; RETURN; END; $$;';
  assert.equal((await parseSqlFile(sql)).length, 1);
  await expectFinding(`${sql}\n${drop}`, 'PG002', 2, 1);
});
test('empty and whitespace-only SQL', async () => {
  for (const sql of ['', ' \r\n\t']) assert.deepEqual(await analyze(sql), []);
});
test('comment-only SQL', async () => {
  assert.deepEqual(await analyze('-- DROP TABLE users;\n/* BEGIN; */'), []);
});
test('malformed SQL fails instead of reporting no risks', async () => {
  await assert.rejects(() => analyze('ALTER TABLE ;'), /SQL Syntax Error/);
});
test('leading nested comments locate actual SQL keyword', async () => {
  await expectFinding(`/* outer /* inner */ end */\n-- migration\n${drop}`, 'PG002', 3, 1);
});
