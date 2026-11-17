import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { simulateSqlFile } from '../src/simulator.js';

function fixture(sql, callback) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-safe-sim-test-'));
  const file = path.join(dir, 'migration.sql');
  fs.writeFileSync(file, sql);
  try { return callback(file); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('simulator executes only in an unnetworked disposable container and cleans up', () => fixture('CREATE TABLE demo(id int);', file => {
  const calls = [];
  const run = (_cmd, args, options) => {
    calls.push({ args, options });
    if (args[0] === 'run') return { status: 0, stdout: 'container-id', stderr: '' };
    if (args[0] === 'exec' && args.includes('pg_isready')) return { status: 0, stdout: 'ready', stderr: '' };
    return { status: 0, stdout: 'CREATE TABLE', stderr: '' };
  };
  const result = simulateSqlFile(file, { run });
  assert.equal(result.passed, true);
  assert.ok(calls[0].args.includes('none'));
  assert.ok(!calls[0].args.includes('-p'));
  assert.ok(!calls[0].args.includes('-v'));
  assert.equal(calls.at(-1).args[0], 'rm');
  assert.equal(calls.at(-1).args[1], '-f');
  assert.equal(calls.find(c => c.args.includes('psql')).options.input, 'CREATE TABLE demo(id int);');
}));

test('failed migration returns a failed result and removes container', () => fixture('INVALID SQL;', file => {
  const calls = [];
  const run = (_cmd, args) => {
    calls.push(args);
    if (args.includes('psql')) return { status: 3, stdout: '', stderr: 'syntax error' };
    return { status: 0, stdout: '', stderr: '' };
  };
  const result = simulateSqlFile(file, { run });
  assert.equal(result.passed, false);
  assert.equal(result.exitCode, 3);
  assert.equal(calls.at(-1)[0], 'rm');
}));

test('rejects unsupported PostgreSQL version and excessive SQL input', () => fixture('SELECT 1;', file => {
  assert.throws(() => simulateSqlFile(file, { postgresVersion: '13' }), /14-18/);
  assert.throws(() => simulateSqlFile(file, { timeoutSeconds: 0 }), /10-300/);
  fs.writeFileSync(file, 'x'.repeat(1024 * 1024 + 1));
  assert.throws(() => simulateSqlFile(file), /1 MiB/);
}));

test('baseline executes before target and returns both steps', () => fixture('CREATE TABLE demo(id int);', baseline => fixture('ALTER TABLE demo ADD COLUMN name text;', file => {
  const inputs = [];
  const run = (_cmd, args, options) => {
    if (args.includes('psql')) inputs.push(options.input);
    return { status: 0, stdout: '', stderr: '' };
  };
  const result = simulateSqlFile(file, { baseline, run });
  assert.equal(result.passed, true);
  assert.deepEqual(inputs, ['CREATE TABLE demo(id int);', 'ALTER TABLE demo ADD COLUMN name text;']);
  assert.deepEqual(result.steps.map(s => s.stage), ['baseline', 'migration']);
})));

test('failed baseline prevents migration execution', () => fixture('INVALID;', baseline => fixture('SELECT 1;', file => {
  let sqlCalls = 0;
  const run = (_cmd, args) => {
    if (args.includes('psql')) { sqlCalls++; return { status: 3, stdout: '', stderr: 'baseline error' }; }
    return { status: 0, stdout: '', stderr: '' };
  };
  const result = simulateSqlFile(file, { baseline, run });
  assert.equal(result.passed, false);
  assert.equal(result.stage, 'baseline');
  assert.equal(sqlCalls, 1);
})));

test('migration directory runs SQL files in sorted order and stops on failure', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-safe-sequence-'));
  try {
    fs.writeFileSync(path.join(dir, '002.sql'), 'SELECT 2;');
    fs.writeFileSync(path.join(dir, '001.sql'), 'SELECT 1;');
    fs.writeFileSync(path.join(dir, 'ignore.txt'), 'ignored');
    const inputs = [];
    const run = (_cmd, args, options) => {
      if (args.includes('psql')) {
        inputs.push(options.input);
        return { status: inputs.length === 2 ? 3 : 0, stdout: '', stderr: 'migration error' };
      }
      return { status: 0, stdout: '', stderr: '' };
    };
    const result = simulateSqlFile(undefined, { migrationsDir: dir, run });
    assert.deepEqual(inputs, ['SELECT 1;', 'SELECT 2;']);
    assert.equal(result.passed, false);
    assert.equal(result.steps.length, 2);
    assert.equal(result.stage, 'migration');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('rejects both file and directory options', () => fixture('SELECT 1;', file => {
  assert.throws(() => simulateSqlFile(file, { migrationsDir: '.' }), /either/);
}));
