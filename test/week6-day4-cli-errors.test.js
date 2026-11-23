
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  writeFileSync,
  rmSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(process.cwd());
const cli = join(root, 'bin', 'cli.js');

function withProject(callback) {
  const directory = mkdtempSync(join(tmpdir(), 'pgsm-day4-'));

  try {
    return callback(directory);
  } finally {
    rmSync(directory, {
      recursive: true,
      force: true
    });
  }
}

function run(directory, args) {
  const result = spawnSync(
    process.execPath,
    [cli, ...args],
    {
      cwd: directory,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15000
    }
  );

  assert.equal(
    result.error,
    undefined,
    result.error?.message
  );

  return result;
}

test('missing SQL file returns exit code 2', () => {
  withProject(directory => {
    const result = run(directory, ['missing.sql']);

    assert.equal(result.status, 2);
    assert.match(result.stderr, /Error:/);
  });
});

test('invalid SQL returns exit code 2', () => {
  withProject(directory => {
    writeFileSync(
      join(directory, 'invalid.sql'),
      'CREATE TABLE users (id INTEGER,);'
    );

    const result = run(directory, ['invalid.sql']);

    assert.equal(result.status, 2);
    assert.match(result.stderr, /Error:/);
  });
});

test('invalid output format returns exit code 2', () => {
  withProject(directory => {
    writeFileSync(join(directory, 'safe.sql'), 'SELECT 1;');

    const result = run(directory, [
      'safe.sql',
      '--format',
      'invalid'
    ]);

    assert.equal(result.status, 2);
    assert.match(result.stderr, /format must be/);
  });
});

test('invalid fail-on value returns exit code 2', () => {
  withProject(directory => {
    writeFileSync(join(directory, 'safe.sql'), 'SELECT 1;');

    const result = run(directory, [
      'safe.sql',
      '--fail-on',
      'critical'
    ]);

    assert.equal(result.status, 2);
    assert.match(result.stderr, /fail-on must be/);
  });
});

test('invalid PostgreSQL version returns exit code 2', () => {
  withProject(directory => {
    writeFileSync(join(directory, 'safe.sql'), 'SELECT 1;');

    const result = run(directory, [
      'safe.sql',
      '--postgres-version',
      'abc'
    ]);

    assert.equal(result.status, 2);
    assert.match(result.stderr, /postgres-version/);
  });
});

test('malformed JSON configuration returns exit code 2', () => {
  withProject(directory => {
    writeFileSync(join(directory, 'safe.sql'), 'SELECT 1;');
    writeFileSync(
      join(directory, 'pg-safe-migrate.config.json'),
      '{invalid json'
    );

    const result = run(directory, ['safe.sql']);

    assert.equal(result.status, 2);
    assert.match(result.stderr, /Error:/);
  });
});

test('invalid rule configuration returns exit code 2', () => {
  withProject(directory => {
    writeFileSync(join(directory, 'safe.sql'), 'SELECT 1;');
    writeFileSync(
      join(directory, 'pg-safe-migrate.config.json'),
      JSON.stringify({
        rules: {
          PG001: 'invalid-severity'
        }
      })
    );

    const result = run(directory, ['safe.sql']);

    assert.equal(result.status, 2);
    assert.match(result.stderr, /Error:/);
  });
});

test('unsafe SQL returns exit code 1 by default', () => {
  withProject(directory => {
    writeFileSync(
      join(directory, 'unsafe.sql'),
      'CREATE INDEX idx_users_email ON users(email);'
    );

    const result = run(directory, ['unsafe.sql']);

    assert.equal(result.status, 1);
    assert.match(result.stdout, /PG001/);
  });
});

test('fail-on none permits findings without blocking', () => {
  withProject(directory => {
    writeFileSync(
      join(directory, 'unsafe.sql'),
      'CREATE INDEX idx_users_email ON users(email);'
    );

    const result = run(directory, [
      'unsafe.sql',
      '--fail-on',
      'none'
    ]);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /PG001/);
  });
});

test('safe SQL produces valid JSON report', () => {
  withProject(directory => {
    writeFileSync(join(directory, 'safe.sql'), 'SELECT 1;');

    const result = run(directory, [
      'safe.sql',
      '--format',
      'json'
    ]);

    assert.equal(result.status, 0);

    const report = JSON.parse(result.stdout);

    assert.ok(Array.isArray(report.findings));
    assert.equal(report.findings.length, 0);
  });
});

test('unwritable output destination returns exit code 2', () => {
  withProject(directory => {
    writeFileSync(join(directory, 'safe.sql'), 'SELECT 1;');
    writeFileSync(
      join(directory, 'occupied'),
      'This is a file, not a directory.'
    );

    const result = run(directory, [
      'safe.sql',
      '--output',
      'occupied/report.json',
      '--format',
      'json'
    ]);

    assert.equal(result.status, 2);
    assert.match(result.stderr, /Error:/);
  });
});

test('conflicting risk baseline options return exit code 2', () => {
  withProject(directory => {
    writeFileSync(join(directory, 'safe.sql'), 'SELECT 1;');

    const result = run(directory, [
      'safe.sql',
      '--write-risk-baseline',
      'new.json',
      '--risk-baseline',
      'existing.json'
    ]);

    assert.equal(result.status, 2);
    assert.match(result.stderr, /Cannot combine/);
  });
});
