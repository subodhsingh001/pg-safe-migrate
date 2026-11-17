
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeFiles } from '../src/analysis.js';

const sql = 'CREATE INDEX CONCURRENTLY users_email_idx ON users(email);';

test('Prisma concurrent index produces a warning by default', async () => {
  const findings = await analyzeFiles([
    {
      file: 'prisma/migrations/001_safe/migration.sql',
      sql
    }
  ]);

  const issue = findings.find(f => f.ruleId === 'PG015');

  assert.ok(issue);
  assert.equal(issue.severity, 'warning');
});

test('Drizzle concurrent index produces a warning by default', async () => {
  const findings = await analyzeFiles([
    {
      file: 'drizzle/0001_safe.sql',
      sql
    }
  ]);

  const issue = findings.find(f => f.ruleId === 'PG016');

  assert.ok(issue);
  assert.equal(issue.severity, 'warning');
});

test('configuration can promote an advisory rule to error', async () => {
  const findings = await analyzeFiles(
    [{ file: 'drizzle/0001_safe.sql', sql }],
    { rules: { PG016: 'error' } }
  );

  const issue = findings.find(f => f.ruleId === 'PG016');

  assert.ok(issue);
  assert.equal(issue.severity, 'error');
});

test('explicit transaction violation remains an error', async () => {
  const findings = await analyzeFiles([
    {
      file: 'migrations/001_unsafe.sql',
      sql: `
        BEGIN;
        CREATE INDEX CONCURRENTLY users_email_idx ON users(email);
        COMMIT;
      `
    }
  ]);

  const issue = findings.find(f => f.ruleId === 'PG008');

  assert.ok(issue);
  assert.equal(issue.severity, 'error');
});
