
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSqlFile } from '../src/parser.js';
import { lockFor } from '../src/locks.js';

async function classify(sql) {
  const statements = await parseSqlFile(sql);
  assert.equal(statements.length, 1);
  return lockFor(statements[0]);
}

test('PG005 foreign key uses SHARE ROW EXCLUSIVE', async () => {
  const lock = await classify(
    'ALTER TABLE orders ADD CONSTRAINT orders_customer_fk FOREIGN KEY (customer_id) REFERENCES customers(id);'
  );
  assert.equal(lock.mode, 'SHARE ROW EXCLUSIVE');
});

test('NOT VALID foreign key still requires a table lock', async () => {
  const lock = await classify(
    'ALTER TABLE orders ADD CONSTRAINT orders_customer_fk FOREIGN KEY (customer_id) REFERENCES customers(id) NOT VALID;'
  );
  assert.equal(lock.mode, 'SHARE ROW EXCLUSIVE');
});

test('VALIDATE CONSTRAINT uses SHARE UPDATE EXCLUSIVE', async () => {
  const lock = await classify(
    'ALTER TABLE orders VALIDATE CONSTRAINT orders_customer_fk;'
  );
  assert.equal(lock.mode, 'SHARE UPDATE EXCLUSIVE');
});

test('DROP COLUMN retains ACCESS EXCLUSIVE', async () => {
  const lock = await classify(
    'ALTER TABLE orders DROP COLUMN legacy_code;'
  );
  assert.equal(lock.mode, 'ACCESS EXCLUSIVE');
});

test('ALTER COLUMN TYPE retains ACCESS EXCLUSIVE', async () => {
  const lock = await classify(
    'ALTER TABLE orders ALTER COLUMN amount TYPE bigint;'
  );
  assert.equal(lock.mode, 'ACCESS EXCLUSIVE');
});

test('mixed ALTER TABLE retains strongest lock classification', async () => {
  const lock = await classify(
    'ALTER TABLE orders ADD CONSTRAINT orders_customer_fk FOREIGN KEY (customer_id) REFERENCES customers(id), DROP COLUMN legacy_code;'
  );
  assert.equal(lock.mode, 'ACCESS EXCLUSIVE');
});
