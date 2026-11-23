
import test from 'node:test';
import assert from 'node:assert/strict';

import { analyzeFiles, frameworkFor } from '../src/analysis.js';

const concurrent =
  'CREATE INDEX CONCURRENTLY idx_users_email ON users(email);';

const regular =
  'CREATE INDEX idx_users_email ON users(email);';

async function analyze(file, sql, config = {}) {
  return analyzeFiles([{ file, sql }], config);
}

function count(findings, ruleId) {
  return findings.filter(f => f.ruleId === ruleId).length;
}

test('Prisma concurrent index produces PG015 warning', async () => {
  const findings = await analyze(
    'prisma/migrations/001/migration.sql',
    concurrent
  );

  assert.equal(count(findings, 'PG015'), 1);
  assert.equal(findings.find(f => f.ruleId === 'PG015').severity, 'warning');
  assert.equal(count(findings, 'PG016'), 0);
});

test('Drizzle concurrent index produces PG016 warning', async () => {
  const findings = await analyze('drizzle/001.sql', concurrent);

  assert.equal(count(findings, 'PG016'), 1);
  assert.equal(findings.find(f => f.ruleId === 'PG016').severity, 'warning');
  assert.equal(count(findings, 'PG015'), 0);
});

test('Plain SQL concurrent index has no ORM advisory', async () => {
  const findings = await analyze('migrations/001.sql', concurrent);

  assert.equal(count(findings, 'PG015'), 0);
  assert.equal(count(findings, 'PG016'), 0);
});

test('Prisma non-concurrent index reports PG001 only', async () => {
  const findings = await analyze(
    'prisma/migrations/001/migration.sql',
    regular
  );

  assert.equal(count(findings, 'PG001'), 1);
  assert.equal(count(findings, 'PG015'), 0);
});

test('Drizzle non-concurrent index reports PG001 only', async () => {
  const findings = await analyze('drizzle/001.sql', regular);

  assert.equal(count(findings, 'PG001'), 1);
  assert.equal(count(findings, 'PG016'), 0);
});

test('Prisma explicit transaction detects PG008 and PG015', async () => {
  const findings = await analyze(
    'prisma/migrations/002/migration.sql',
    `BEGIN;
     ${concurrent}
     COMMIT;`
  );

  assert.equal(count(findings, 'PG008'), 1);
  assert.equal(count(findings, 'PG015'), 1);
});

test('Drizzle explicit transaction detects PG008 and PG016', async () => {
  const findings = await analyze(
    'drizzle/002.sql',
    `BEGIN;
     ${concurrent}
     COMMIT;`
  );

  assert.equal(count(findings, 'PG008'), 1);
  assert.equal(count(findings, 'PG016'), 1);
});

test('Two Prisma concurrent indexes produce two advisories', async () => {
  const findings = await analyze(
    'prisma/migrations/003/migration.sql',
    `CREATE INDEX CONCURRENTLY idx_users_email ON users(email);
     CREATE INDEX CONCURRENTLY idx_users_name ON users(name);`
  );

  assert.equal(count(findings, 'PG015'), 2);
});

test('Two Drizzle concurrent indexes produce two advisories', async () => {
  const findings = await analyze(
    'drizzle/003.sql',
    `CREATE INDEX CONCURRENTLY idx_users_email ON users(email);
     CREATE INDEX CONCURRENTLY idx_users_name ON users(name);`
  );

  assert.equal(count(findings, 'PG016'), 2);
});

test('Windows Prisma migration path is recognized', () => {
  assert.equal(
    frameworkFor('C:\\project\\prisma\\migrations\\001\\migration.sql'),
    'prisma'
  );
});

test('Windows Drizzle migration path is recognized', () => {
  assert.equal(
    frameworkFor('C:\\project\\drizzle\\001.sql'),
    'drizzle'
  );
});

test('Strict configuration promotes Prisma advisory to error', async () => {
  const findings = await analyze(
    'prisma/migrations/004/migration.sql',
    concurrent,
    { rules: { PG015: 'error' } }
  );

  assert.equal(
    findings.find(f => f.ruleId === 'PG015').severity,
    'error'
  );
});

test('Strict configuration promotes Drizzle advisory to error', async () => {
  const findings = await analyze(
    'drizzle/004.sql',
    concurrent,
    { rules: { PG016: 'error' } }
  );

  assert.equal(
    findings.find(f => f.ruleId === 'PG016').severity,
    'error'
  );
});

test('Multiple migration files retain correct framework attribution', async () => {
  const findings = await analyzeFiles([
    {
      file: 'prisma/migrations/005/migration.sql',
      sql: concurrent
    },
    {
      file: 'drizzle/005.sql',
      sql: concurrent
    },
    {
      file: 'migrations/005.sql',
      sql: concurrent
    }
  ]);

  assert.equal(count(findings, 'PG015'), 1);
  assert.equal(count(findings, 'PG016'), 1);

  const prisma = findings.find(f => f.ruleId === 'PG015');
  const drizzle = findings.find(f => f.ruleId === 'PG016');

  assert.match(prisma.file.replaceAll('\\', '/'), /prisma\/migrations/);
  assert.match(drizzle.file.replaceAll('\\', '/'), /drizzle\//);
});
