import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { simulateSqlFile } from '../src/simulator.js';
import { assessTeamPolicy, loadTeamPolicy } from '../src/team-policy.js';

function withDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-combined-test-'));
  try { return fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('verification runs after baseline and ordered migrations', () => withDir(dir => {
  const baseline = path.join(dir, 'base.sql');
  const migrationDir = path.join(dir, 'migrations'); fs.mkdirSync(migrationDir);
  const verifySql = path.join(dir, 'verify.sql');
  fs.writeFileSync(baseline, 'CREATE TABLE users(id int);');
  fs.writeFileSync(path.join(migrationDir, '002.sql'), 'SELECT 2;');
  fs.writeFileSync(path.join(migrationDir, '001.sql'), 'SELECT 1;');
  fs.writeFileSync(verifySql, 'SELECT 3;');
  const inputs = [];
  const run = (_command, args, options) => {
    if (args.includes('psql')) inputs.push(options.input);
    return { status: 0, stdout: '', stderr: '' };
  };
  const result = simulateSqlFile(undefined, { migrationsDir: migrationDir, baseline, verifySql, run });
  assert.equal(result.passed, true);
  assert.deepEqual(result.steps.map(x => x.stage), ['baseline','migration','migration','verification']);
  assert.deepEqual(inputs, ['CREATE TABLE users(id int);','SELECT 1;','SELECT 2;','SELECT 3;']);
}));

test('failed state verification makes the simulation fail', () => withDir(dir => {
  const file = path.join(dir, 'change.sql'); const verifySql = path.join(dir, 'verify.sql');
  fs.writeFileSync(file, 'SELECT 1;'); fs.writeFileSync(verifySql, 'DO $$ BEGIN RAISE EXCEPTION \'failed\'; END $$;');
  let count = 0;
  const result = simulateSqlFile(file, { verifySql, run: (_cmd,args) => {
    if (args.includes('psql')) { count++; return { status: count === 2 ? 3 : 0, stderr: count === 2 ? 'assertion failed' : '', stdout: '' }; }
    return { status: 0, stdout: '', stderr: '' };
  } });
  assert.equal(result.passed, false);
  assert.equal(result.stage, 'verification');
}));

test('team policy blocks selected rules and validates configuration', () => withDir(dir => {
  const file = path.join(dir, 'policy.json');
  fs.writeFileSync(file, JSON.stringify({ maxRiskScore: 10, blockedRules: ['PG001'], requireSimulation: true }));
  const policy = loadTeamPolicy(file);
  const result = assessTeamPolicy({ execution: { passed: true }, lint: { risk: { score: 20 }, findings: [{ ruleId: 'PG001', file: 'x.sql', severity: 'error' }] } }, policy);
  assert.equal(result.passed, false);
  assert.equal(result.reasons.length, 2);
  fs.writeFileSync(file, '{"unknown":true}');
  assert.throws(() => loadTeamPolicy(file), /Unknown/);
}));
