
import test from 'node:test';
import assert from 'node:assert/strict';

import { analyzeFiles } from '../src/analysis.js';
import { DEFAULT_CONFIG } from '../src/config.js';

async function analyze(sql) {
  return analyzeFiles(
    [{ file: 'migrations/week6-day2.sql', sql }],
    DEFAULT_CONFIG
  );
}

function countRule(findings, ruleId) {
  return findings.filter(f => f.ruleId === ruleId).length;
}

async function expectCount(name, sql, ruleId, expected) {
  await test(name, async () => {
    const findings = await analyze(sql);
    assert.equal(
      countRule(findings, ruleId),
      expected,
      `Expected ${expected} ${ruleId} finding(s), received: ${
        JSON.stringify(findings.map(f => ({
          ruleId: f.ruleId,
          message: f.message
        })))
      }`
    );
  });
}

// PG001: Index creation
await expectCount(
  'PG001: schema-qualified non-concurrent index is detected',
  'CREATE INDEX idx_email ON public.users(email);',
  'PG001',
  1
);

await expectCount(
  'PG001: schema-qualified concurrent index is not flagged',
  'CREATE INDEX CONCURRENTLY idx_email ON public.users(email);',
  'PG001',
  0
);

// PG002: Column deletion
await expectCount(
  'PG002: two dropped columns produce two findings',
  'ALTER TABLE users DROP COLUMN old_name, DROP COLUMN old_email;',
  'PG002',
  2
);

await expectCount(
  'PG002: quoted column name is detected',
  'ALTER TABLE "public"."Users" DROP COLUMN "OldEmail";',
  'PG002',
  1
);

// PG003: Column type change
await expectCount(
  'PG003: changing column type is detected',
  'ALTER TABLE users ALTER COLUMN age TYPE bigint;',
  'PG003',
  1
);

await expectCount(
  'PG003: adding a nullable column is not flagged',
  'ALTER TABLE users ADD COLUMN nickname text;',
  'PG003',
  0
);

// PG004: NOT NULL columns
await expectCount(
  'PG004: NOT NULL without default is detected',
  'ALTER TABLE users ADD COLUMN status text NOT NULL;',
  'PG004',
  1
);

await expectCount(
  'PG004: NOT NULL with constant default is not flagged',
  "ALTER TABLE users ADD COLUMN status text NOT NULL DEFAULT 'active';",
  'PG004',
  0
);

await expectCount(
  'PG004: nullable column without default is not flagged',
  'ALTER TABLE users ADD COLUMN nickname text;',
  'PG004',
  0
);

// PG005: Foreign keys
await expectCount(
  'PG005: validated foreign key is detected',
  'ALTER TABLE orders ADD CONSTRAINT fk_customer FOREIGN KEY (customer_id) REFERENCES customers(id);',
  'PG005',
  1
);

await expectCount(
  'PG005: NOT VALID foreign key is not flagged',
  'ALTER TABLE orders ADD CONSTRAINT fk_customer FOREIGN KEY (customer_id) REFERENCES customers(id) NOT VALID;',
  'PG005',
  0
);

await expectCount(
  'PG005: two validated foreign keys produce two findings',
  `ALTER TABLE orders
     ADD CONSTRAINT fk_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
     ADD CONSTRAINT fk_store FOREIGN KEY (store_id) REFERENCES stores(id);`,
  'PG005',
  2
);

// PG006: Renames
await expectCount(
  'PG006: table rename is detected',
  'ALTER TABLE users RENAME TO customers;',
  'PG006',
  1
);

await expectCount(
  'PG006: column rename is detected',
  'ALTER TABLE users RENAME COLUMN old_name TO new_name;',
  'PG006',
  1
);

await expectCount(
  'PG006: adding a nullable column is not a rename',
  'ALTER TABLE users ADD COLUMN nickname text;',
  'PG006',
  0
);

// Multiple risks in one statement
test('Mixed ALTER TABLE preserves distinct rule findings', async () => {
  const findings = await analyze(`
    ALTER TABLE users
      DROP COLUMN legacy_code,
      ADD COLUMN status text NOT NULL,
      ALTER COLUMN age TYPE bigint;
  `);

  for (const ruleId of ['PG002', 'PG003', 'PG004']) {
    assert.equal(
      countRule(findings, ruleId),
      1,
      `Expected one ${ruleId} finding`
    );
  }
});

// Comments must not generate false positives
test('Comments mentioning unsafe SQL are ignored', async () => {
  const findings = await analyze(`
    -- ALTER TABLE users DROP COLUMN email;
    /* CREATE INDEX idx_bad ON users(email); */
    SELECT 1;
  `);

  assert.deepEqual(findings, []);
});
