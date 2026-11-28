#!/usr/bin/env node
// Build a self-contained VS Code extension runtime from the sibling CLI project.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const target = path.join(__dirname, 'runtime');
const copy = (from, to) => fs.cpSync(from, to, { recursive: true, force: true });
for (const p of ['bin', 'src', 'package.json', 'package-lock.json']) {
  if (!fs.existsSync(path.join(root, p))) throw new Error(`Missing ${p} in main project`);
}
try { fs.rmSync(target, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); }
catch (e) { throw new Error('Cannot clean generated runtime. Close VS Code and retry from external PowerShell.', {cause:e}); }
fs.mkdirSync(target, { recursive: true });
for (const p of ['bin', 'src', 'package.json', 'package-lock.json']) copy(path.join(root, p), path.join(target, p));
// npm ci installs locked production dependencies (including the PostgreSQL parser).
// Windows .cmd files require cmd.exe; avoid spawnSync(args, { shell: true }) (DEP0190).
// Keep the command fixed: never interpolate untrusted values into shell commands.
const npmArgs = ['ci', '--omit=dev', '--no-audit', '--no-fund'];
const result = process.platform === 'win32'
  ? spawnSync(process.env.ComSpec || 'cmd.exe',
      ['/d', '/s', '/c', 'npm.cmd ci --omit=dev --no-audit --no-fund'],
      { cwd: target, stdio: 'inherit', windowsHide: true })
  : spawnSync('npm', npmArgs, { cwd: target, stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
for (const p of ['bin/cli.js', 'src/analysis.js', 'node_modules/libpg-query/package.json', 'node_modules/commander/package.json', 'node_modules/chalk/package.json']) {
  if (!fs.existsSync(path.join(target, p))) throw new Error(`Standalone runtime incomplete: ${p}`);
}
console.log(`Standalone runtime ready: ${target}`);
