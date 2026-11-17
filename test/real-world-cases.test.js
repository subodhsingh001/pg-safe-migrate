import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeFiles } from '../src/analysis.js';
import { DEFAULT_CONFIG } from '../src/config.js';

// Curated, synthetic patterns. These are not measured production false-positive rates.
const cases = [
  { name: 'non-concurrent index', file: 'migrations/001.sql', sql: 'CREATE INDEX users_email_idx ON users(email);', expected: ['PG001'] },
  { name: 'concurrent index in plain SQL', file: 'migrations/002.sql', sql: 'CREATE INDEX CONCURRENTLY users_email_idx ON users(email);', expected: [] },
  { name: 'Prisma concurrent index advisory', file: 'prisma/migrations/001/migration.sql', sql: 'CREATE INDEX CONCURRENTLY users_email_idx ON users(email);', expected: ['PG015'] },
  { name: 'Drizzle concurrent index advisory', file: 'drizzle/001.sql', sql: 'CREATE INDEX CONCURRENTLY users_email_idx ON users(email);', expected: ['PG016'] },
  { name: 'explicit transaction concurrent index', file: 'migrations/003.sql', sql: 'BEGIN; CREATE INDEX CONCURRENTLY users_email_idx ON users(email); COMMIT;', expected: ['PG008'] },
  { name: 'drop column', file: 'migrations/004.sql', sql: 'ALTER TABLE users DROP COLUMN email;', expected: ['PG002'] },
  { name: 'drop table', file: 'migrations/005.sql', sql: 'DROP TABLE users;', expected: ['PG011'] },
  { name: 'simple add nullable column', file: 'migrations/006.sql', sql: 'ALTER TABLE users ADD COLUMN nickname text;', expected: [] },
  { name: 'rename column', file: 'migrations/007.sql', sql: 'ALTER TABLE users RENAME COLUMN email TO contact_email;', expected: ['PG006'] },
  { name: 'add not-null without default', file: 'migrations/008.sql', sql: 'ALTER TABLE users ADD COLUMN active boolean NOT NULL;', expected: ['PG004'] },
];

for (const sample of cases) {
  test(`curated migration: ${sample.name}`, async () => {
    const findings = await analyzeFiles([{ file: sample.file, sql: sample.sql }], DEFAULT_CONFIG);
    const actual = [...new Set(findings.map(f => f.ruleId))].sort();
    assert.deepEqual(actual, [...sample.expected].sort());
  });
}
