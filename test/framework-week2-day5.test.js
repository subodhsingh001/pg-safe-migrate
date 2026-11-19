import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { frameworkFor, analyzeFiles } from '../src/analysis.js';
import { findMigrationFiles } from '../src/detector.js';
import { advise } from '../src/advisor.js';

test('framework paths distinguish Prisma, Drizzle, Flyway and raw SQL', () => {
  assert.equal(frameworkFor('prisma/migrations/20261119_init/migration.sql'), 'prisma');
  assert.equal(frameworkFor('drizzle/0001_init.sql'), 'drizzle');
  assert.equal(frameworkFor('db/migration/V1__create_users.sql'), 'flyway');
  assert.equal(frameworkFor('sql/V2_1__add_index.sql'), 'flyway');
  assert.equal(frameworkFor('migrations/R__refresh_views.sql'), 'flyway');
  assert.equal(frameworkFor('migrations/manual.sql'), 'sql');
  assert.equal(frameworkFor('C:\\project\\db\\migration\\V3__update.sql'), 'flyway');
});

test('Flyway default migration root is discoverable', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pgsm-flyway-'));
  const previous = process.cwd();
  try {
    fs.mkdirSync(path.join(root, 'db', 'migration'), {recursive:true});
    fs.writeFileSync(path.join(root, 'db', 'migration', 'V1__create.sql'), 'SELECT 1;');
    process.chdir(root);
    const files = findMigrationFiles();
    assert.equal(files.length, 1);
    assert.match(files[0].replaceAll('\\', '/'), /db\/migration\/V1__create.sql$/);
  } finally { process.chdir(previous); fs.rmSync(root, {recursive:true, force:true}); }
});

test('Flyway concurrent index receives transaction configuration warning', async () => {
  const sql = 'CREATE INDEX CONCURRENTLY idx_users_email ON users(email);';
  const findings = await analyzeFiles([{file:'db/migration/V2__add_index.sql', sql}], {}, {advisor:true});
  const warning = findings.find(f => f.ruleId === 'PG017');
  assert.ok(warning);
  assert.equal(warning.framework, 'flyway');
  assert.match(warning.message, /executeInTransaction=false/);
  assert.match(warning.advisor.note, /Flyway migration/);
});

test('Flyway advisory does not apply to non-concurrent indexes', async () => {
  const findings = await analyzeFiles([{file:'db/migration/V2__add_index.sql',sql:'CREATE INDEX idx_users_email ON users(email);'}]);
  assert.ok(!findings.some(f => f.ruleId === 'PG017'));
});

test('Flyway advisory remains non-executable guidance', () => {
  const advice = advise({ruleId:'PG017'}, 'flyway');
  assert.match(advice.note, /Guidance only/);
});
