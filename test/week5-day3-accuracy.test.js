
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(process.cwd());
const cli = join(root, 'bin', 'cli.js');

function lintSql(sql) {
  const directory = mkdtempSync(join(tmpdir(), 'pg-safe-accuracy-'));

  try {
    const file = join(directory, 'migration.sql');
    writeFileSync(file, sql, 'utf8');

    const result = spawnSync(
      process.execPath,
      [
        cli,
        file,
        '--format',
        'json',
        '--fail-on',
        'none'
      ],
      {
        cwd: root,
        encoding: 'utf8',
        windowsHide: true
      }
    );

    assert.equal(result.error, undefined);
    assert.equal(
      result.status,
      0,
      `CLI failed: ${result.stderr}\n${result.stdout}`
    );

    const report = JSON.parse(result.stdout);

    assert.ok(Array.isArray(report.findings));
    return report.findings;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('Week 5: safe migration has no findings', () => {
  const findings = lintSql(`
    -- CREATE INDEX idx_fake ON customers(email);
    -- ALTER TABLE customers DROP COLUMN email;

    CREATE TABLE customers (
      id BIGSERIAL PRIMARY KEY,
      email TEXT,
      name TEXT
    );

    CREATE INDEX CONCURRENTLY idx_customers_email
    ON customers(email);

    ALTER TABLE customers
    ADD COLUMN phone TEXT;

    ALTER TABLE customers
    ADD CONSTRAINT customers_name_fk
    FOREIGN KEY (id)
    REFERENCES customers(id)
    NOT VALID;
  `);

  assert.deepEqual(findings, []);
});

test('Week 5: unsafe migration detects four risks', () => {
  const findings = lintSql(`
    CREATE INDEX idx_customers_name
    ON customers(name);

    ALTER TABLE customers
    DROP COLUMN phone;

    ALTER TABLE customers
    ADD COLUMN status TEXT NOT NULL;

    ALTER TABLE customers
    ADD CONSTRAINT customers_parent_fk
    FOREIGN KEY (id)
    REFERENCES customers(id);
  `);

  const actual = findings.map((finding) => finding.ruleId).sort();

  assert.deepEqual(actual, [
    'PG001',
    'PG002',
    'PG004',
    'PG005'
  ]);
});

test('Week 5: SQL comments do not trigger findings', () => {
  const findings = lintSql(`
    -- DROP TABLE customers;
    -- CREATE INDEX idx_bad ON customers(email);
    /* ALTER TABLE customers DROP COLUMN email; */
    SELECT 1;
  `);

  assert.deepEqual(findings, []);
});

test('Week 5: concurrent index does not trigger PG001', () => {
  const findings = lintSql(`
    CREATE INDEX CONCURRENTLY idx_safe
    ON customers(email);
  `);

  assert.ok(!findings.some((finding) => finding.ruleId === 'PG001'));
});

test('Week 5: NOT VALID foreign key does not trigger PG005', () => {
  const findings = lintSql(`
    ALTER TABLE orders
    ADD CONSTRAINT orders_customer_fk
    FOREIGN KEY (customer_id)
    REFERENCES customers(id)
    NOT VALID;
  `);

  assert.ok(!findings.some((finding) => finding.ruleId === 'PG005'));
});
