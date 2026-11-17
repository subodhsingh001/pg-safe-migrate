import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { combinedAssessment } from '../src/combined.js';

function sandbox(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-assess-negative-'));
  return Promise.resolve().then(() => fn(dir)).finally(() => fs.rmSync(dir, { recursive: true, force: true }));
}
const successfulDocker = () => ({ status: 0, stdout: '', stderr: '' });

test('successful SQL execution cannot override unsafe DROP TABLE lint', () => sandbox(async dir => {
  const file = path.join(dir, 'unsafe.sql');
  fs.writeFileSync(file, 'DROP TABLE users;');
  const report = await combinedAssessment({ file, run: successfulDocker, postgresVersion: '16' });
  assert.equal(report.execution.passed, true);
  assert.ok(report.lint.findings.length > 0, 'unsafe SQL must generate lint findings');
  assert.equal(report.passed, false, 'unsafe migration must block assessment despite execution success');
  assert.ok(report.operations.some(op => op.type === 'DropStmt'));
}));

test('duplicate CREATE INDEX is detected before Docker simulation', () => sandbox(async dir => {
  const migrationsDir = path.join(dir, 'migrations'); fs.mkdirSync(migrationsDir);
  fs.writeFileSync(path.join(migrationsDir, '001.sql'), 'CREATE INDEX idx_duplicate ON users(email);');
  fs.writeFileSync(path.join(migrationsDir, '002.sql'), 'CREATE INDEX idx_duplicate ON users(email);');
  let dockerCalled = false;
  const report = await combinedAssessment({ migrationsDir, run: () => { dockerCalled = true; return successfulDocker(); } });
  assert.ok(report.lint.findings.some(f => f.ruleId === 'PG018'));
  assert.equal(report.execution.skipped, true);
  assert.equal(report.passed, false);
  assert.equal(dockerCalled, false);
}));
