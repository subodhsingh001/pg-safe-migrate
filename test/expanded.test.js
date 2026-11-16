import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseSqlFile } from '../src/parser.js';
import { lintStatements } from '../src/engine.js';
import { findMigrationFiles } from '../src/detector.js';
import { getChangedSqlFiles } from '../src/gitDiff.js';
const run = (args, cwd) => execFileSync('git', args, { cwd, stdio: 'pipe' });
test('reports each dropped column', async () => {
  const statements = await parseSqlFile('ALTER TABLE users DROP COLUMN first_name, DROP COLUMN last_name;');
  assert.equal(lintStatements(statements).filter(i => i.ruleId === 'PG002').length, 2);
});
test('rejects invalid SQL', async () => {
  await assert.rejects(() => parseSqlFile('ALTER TABLE ;'), /SQL Syntax Error/);
});
test('detects multiple migration roots', () => {
  const cwd = process.cwd(); const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-detector-'));
  try {
    process.chdir(tmp);
    for (const d of ['drizzle', 'prisma/migrations']) { fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'a.sql'), 'SELECT 1;'); }
    assert.equal(findMigrationFiles().length, 2);
  } finally { process.chdir(cwd); fs.rmSync(tmp, { recursive: true, force: true }); }
});
test('detects staged, unstaged, untracked and branch changes', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-git-'));
  try {
    run(['init'], tmp); run(['config', 'user.email', 'test@example.com'], tmp); run(['config', 'user.name', 'Test'], tmp);
    fs.writeFileSync(path.join(tmp, 'base.sql'), 'SELECT 1;'); run(['add', '.'], tmp); run(['commit', '-m', 'initial'], tmp);
    const base = run(['rev-parse', 'HEAD'], tmp).toString().trim();
    fs.writeFileSync(path.join(tmp, 'staged.sql'), 'SELECT 1;'); run(['add', 'staged.sql'], tmp);
    fs.writeFileSync(path.join(tmp, 'base.sql'), 'SELECT 2;');
    fs.writeFileSync(path.join(tmp, 'untracked.sql'), 'SELECT 3;');
    assert.deepEqual(getChangedSqlFiles(base, tmp).map(f => path.basename(f)).sort(), ['base.sql', 'staged.sql', 'untracked.sql']);
    assert.throws(() => getChangedSqlFiles('not-a-valid-ref', tmp), /Git base ref not available/);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
