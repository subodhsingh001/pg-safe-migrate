
import test from 'node:test';
import assert from 'node:assert/strict';

import { analyzeFiles } from '../src/analysis.js';
import { DEFAULT_CONFIG } from '../src/config.js';

async function analyze(sql, file = 'migrations/accuracy.sql') {
  return analyzeFiles([{ file, sql }], DEFAULT_CONFIG);
}

async function expectRule(name, sql, ruleId) {
  await test(name, async () => {
    const findings = await analyze(sql);
    assert.ok(
      findings.some(f => f.ruleId === ruleId),
      `Expected ${ruleId}; received ${findings.map(f => f.ruleId).join(', ')}`
    );
  });
}

async function expectNoRule(name, sql, ruleId) {
  await test(name, async () => {
    const findings = await analyze(sql);
    assert.ok(
      !findings.some(f => f.ruleId === ruleId),
      `Unexpected ${ruleId}: ${JSON.stringify(findings)}`
    );
  });
}

await expectRule(
  'Non-concurrent IF NOT EXISTS index remains risky',
  'CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);',
  'PG001'
);

await expectNoRule(
  'Concurrent unique index does not trigger PG001',
  'CREATE UNIQUE INDEX CONCURRENTLY users_email_idx ON users(email);',
  'PG001'
);

await expectRule(
  'DROP COLUMN IF EXISTS remains destructive',
  'ALTER TABLE users DROP COLUMN IF EXISTS email;',
  'PG002'
);

await expectRule(
  'TRUNCATE CASCADE remains detectable',
  'TRUNCATE TABLE users CASCADE;',
  'PG023'
);

await expectRule(
  'Concurrent index inside transaction is rejected',
  `BEGIN;
   SELECT 1;
   CREATE INDEX CONCURRENTLY users_email_idx ON users(email);
   COMMIT;`,
  'PG008'
);

await expectRule(
  'Quoted schema-qualified DROP COLUMN is detected',
  'ALTER TABLE "public"."Users" DROP COLUMN "Email";',
  'PG002'
);

await expectNoRule(
  'Constant default does not trigger volatile-default rule',
  'ALTER TABLE users ADD COLUMN score integer DEFAULT 0;',
  'PG021'
);

await expectNoRule(
  'Stable default does not trigger volatile-default rule',
  'ALTER TABLE users ADD COLUMN created_at timestamptz DEFAULT now();',
  'PG021'
);

test('Multiple unsafe operations retain separate findings', async () => {
  const sql = `CREATE INDEX users_email_idx ON users(email);
ALTER TABLE users DROP COLUMN email;
TRUNCATE TABLE users;`;

  const findings = await analyze(sql);

  for (const ruleId of ['PG001', 'PG002', 'PG023']) {
    assert.ok(
      findings.some(f => f.ruleId === ruleId),
      `Missing ${ruleId}`
    );
  }

  const positions = new Map(
    findings.map(f => [f.ruleId, f.line])
  );

  assert.equal(positions.get('PG001'), 1);
  assert.equal(positions.get('PG002'), 2);
  assert.equal(positions.get('PG023'), 3);
});
