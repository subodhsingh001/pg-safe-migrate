'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const runtime = path.join(__dirname, 'runtime');
for (const file of ['bin/cli.js', 'src/analysis.js', 'src/parser.js', 'node_modules/libpg-query/package.json', 'node_modules/commander/package.json', 'node_modules/chalk/package.json', 'node_modules/pg/package.json']) {
  assert.ok(fs.existsSync(path.join(runtime, file)), `Missing ${file}. Run npm run build:standalone`);
}
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg safe standalone '));
try {
  const isolated = path.join(dir, 'isolated runtime');
  fs.cpSync(runtime, isolated, { recursive: true });
  assert.equal(typeof require(path.join(isolated,'node_modules','pg')).Client,'function');
  console.log('PASS: bundled PostgreSQL driver loads');
  const cli = path.join(isolated, 'bin', 'cli.js');
  const sql = path.join(dir, 'migration test.sql');
  function run(content, expectedCode = 0) {
    fs.writeFileSync(sql, content, 'utf8');
    const result = spawnSync(process.execPath, [cli, '--format', 'json', '--advisor', '--fail-on', 'none', sql], {
      cwd: dir, encoding: 'utf8', shell: false, windowsHide: true, timeout: 30000, maxBuffer: 16 * 1024 * 1024
    });
    if (result.error) throw result.error;
    assert.equal(result.status, expectedCode, result.stderr || result.stdout);
    if (expectedCode !== 0) return result;
    const report = JSON.parse(result.stdout);
    assert.ok(Array.isArray(report.findings));
    return report.findings;
  }
  function check(name, content, expected) {
    const findings = run(content);
    assert.deepEqual(findings.map(f => [f.ruleId, f.line, f.column]), expected);
    console.log(`PASS: ${name}`);
    return findings;
  }
  check('safe SQL', 'SELECT 1;', []);
  const findings = check('destructive SQL and paths with spaces', 'DROP TABLE users;\nALTER TABLE accounts DROP COLUMN email;\nTRUNCATE TABLE events;', [['PG011',1,1],['PG002',2,1],['PG023',3,1]]);
  assert.ok(findings.every(f => f.severity === 'error'));
  const prefix = "SELECT '\u{1F600}'; ";
  check('Unicode UTF-16 positions', prefix + 'ALTER TABLE users DROP COLUMN email;', [['PG002',1,prefix.length+1]]);
  check('CRLF and nested comments', '/* outer /* inner */ end */\r\n-- migration\r\n  DROP TABLE users;', [['PG011',3,3]]);
  check('savepoint transaction', 'BEGIN;\nSAVEPOINT s;\nROLLBACK TO s;\nCREATE INDEX CONCURRENTLY idx ON users(email);\nCOMMIT;', [['PG008',4,1]]);
  check('chained transaction', 'BEGIN;\nCOMMIT AND CHAIN;\nCREATE INDEX CONCURRENTLY idx ON users(email);\nCOMMIT;', [['PG008',3,1]]);
  check('dollar quoted SQL', 'SELECT $tag$DROP TABLE users;$tag$;', []);
  run('ALTER TABLE ;', 2);
  console.log('PASS: malformed SQL returns exit code 2');
  console.log('PASS: all 8 isolated bundled CLI checks');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
