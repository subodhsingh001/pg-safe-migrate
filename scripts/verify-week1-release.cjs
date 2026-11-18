#!/usr/bin/env node
'use strict';
// Verification only: this script never publishes, tags, or changes versions.
const { spawnSync } = require('node:child_process');
const { readFileSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');
const root = resolve(__dirname, '..');
process.chdir(root);
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const checks = [
  ['PG020 regression', process.execPath, ['--test', 'test/regression-week1.test.js']],
  ['Version catalog', process.execPath, ['--test', 'test/version-catalog.test.js']],
  ['Unit tests', 'npm', ['run', 'test:unit']],
  ['Full tests', 'npm', ['test']],
  ['Release smoke', process.execPath, ['test/release-smoke.cjs']],
  ['npm package dry-run', 'npm', ['pack', '--dry-run']]
];
if (process.argv.includes('--integration')) {
  checks.push(['PostgreSQL integration matrix', 'npm', ['run', 'test:integration']]);
}
let failed = 0;
console.log(`Release verification for ${pkg.name}@${pkg.version}`);
for (const [label, cmd, args] of checks) {
  if (cmd === process.execPath && !existsSync(args[args.length - 1])) {
    console.error(`FAIL ${label}: missing test file`);
    failed++;
    continue;
  }
  console.log(`\n=== ${label} ===`);
  const executable = process.platform === 'win32' && cmd === 'npm' ? 'npm.cmd' : cmd;
  const result = spawnSync(executable, args, { stdio: 'inherit', shell: process.platform === 'win32' && cmd === 'npm' });
  if (result.error || result.status !== 0) {
    console.error(`FAIL ${label}: ${result.error?.message || `exit ${result.status}`}`);
    failed++;
  } else console.log(`PASS ${label}`);
}
console.log(`\n${failed ? `NOT READY: ${failed} check(s) failed` : 'LOCAL CHECKS PASSED'}${process.argv.includes('--integration') ? '' : ' (Docker matrix not requested)'}`);
process.exitCode = failed ? 1 : 0;
