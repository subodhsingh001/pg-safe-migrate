import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSqlFile } from '../src/parser.js';
import { lintStatements } from '../src/engine.js';

async function findings(sql) {
  return lintStatements(await parseSqlFile(sql));
}

test('PG023 flags TRUNCATE with table context', async () => {
  const found = await findings('TRUNCATE TABLE users, orders RESTART IDENTITY CASCADE;');
  const issue = found.find(x => x.ruleId === 'PG023');
  assert.ok(issue);
  assert.equal(issue.severity, 'ERROR');
  assert.match(issue.message, /users/);
});

test('PG024 flags dropping a constraint', async () => {
  const found = await findings('ALTER TABLE orders DROP CONSTRAINT orders_customer_id_fkey;');
  assert.ok(found.some(x => x.ruleId === 'PG024'));
});

test('PG025 flags SET NOT NULL on existing column', async () => {
  const found = await findings('ALTER TABLE users ALTER COLUMN email SET NOT NULL;');
  assert.ok(found.some(x => x.ruleId === 'PG025'));
});

test('non-destructive statements do not trigger Day 4 rules', async () => {
  const found = await findings('CREATE TABLE widgets (id integer PRIMARY KEY); ALTER TABLE widgets ADD COLUMN label text;');
  for (const id of ['PG023', 'PG024', 'PG025']) {
    assert.ok(!found.some(x => x.ruleId === id), `${id} should not be present`);
  }
});

test('existing DROP COLUMN rule remains unchanged', async () => {
  const found = await findings('ALTER TABLE users DROP COLUMN legacy;');
  assert.ok(found.some(x => x.ruleId === 'PG002'));
  assert.ok(!found.some(x => x.ruleId === 'PG024'));
});
