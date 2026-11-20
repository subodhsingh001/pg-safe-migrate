#!/usr/bin/env node
// Non-publishing release-readiness audit. Never edits files, creates tags, or publishes.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = process.cwd();
const outputArg = process.argv.indexOf('--output');
const output = outputArg >= 0 ? process.argv[outputArg + 1] : null;
if (outputArg >= 0 && (!output || output.startsWith('--'))) { console.error('Usage: node scripts/week3-release-readiness.mjs [--output report.md]'); process.exit(2); }
const checks = [];
function check(name, ok, detail = '') { checks.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`); }
function file(path) { return existsSync(resolve(root, path)); }
function command(name, cmd, args, cwd = root) {
  // Windows npm is a .cmd shim; invoke it through cmd.exe with fixed, trusted arguments.
  // Never concatenate user-provided input into this command line.
  const windowsNpm = process.platform === 'win32' && cmd === 'npm';
  const allowed = new Set(['run test:unit', 'run test:release', 'pack --dry-run --json']);
  const npmArgs = args.join(' ');
  if (windowsNpm && !allowed.has(npmArgs)) throw new Error('Unexpected npm audit command');
  const executable = windowsNpm ? (process.env.ComSpec || 'cmd.exe') : cmd;
  const executableArgs = windowsNpm ? ['/d', '/s', '/c', `npm.cmd ${npmArgs}`] : args;
  const result = spawnSync(executable, executableArgs, { cwd, encoding: 'utf8', shell: false, timeout: 180000 });
  const text = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
  check(name, result.status === 0 && !result.error, result.error?.message || `exit ${result.status ?? 'unknown'}`);
  if (text && result.status !== 0) console.error(text.slice(-2500));
}
let pkg, ext;
try { pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')); check('CLI package metadata', Boolean(pkg.name && pkg.version && pkg.bin?.['pg-safe-migrate'])); }
catch (e) { check('CLI package metadata', false, e.message); }
try { ext = JSON.parse(readFileSync(resolve(root, 'vscode-extension/package.json'), 'utf8')); check('VS Code package metadata', Boolean(ext.publisher && ext.version && ext.main)); }
catch (e) { check('VS Code package metadata', false, e.message); }
for (const [name, path] of [
  ['Day 1-2 policy', 'examples/week3-gate-policy.json'],
  ['Day 3 reviewed baseline', 'examples/reviewed-risk-baseline.json'],
  ['Day 4 context', 'examples/week3-production-context.json'],
  ['Day 5 workflow', '.github/workflows/week3-pr-safety.yml'],
  ['Day 5 summary generator', 'scripts/week3-pr-summary.mjs'],
  ['Day 6 adoption guide', 'docs/ADOPTION-GUIDE.md'],
  ['Day 6 Marketplace copy', 'docs/MARKETPLACE-COPY.md'],
  ['Day 6 README', 'README.md'],
]) check(name, file(path));
if (pkg) {
  command('Unit suite', 'npm', ['run', 'test:unit']);
  command('Release smoke suite', 'npm', ['run', 'test:release']);
  command('npm package dry run', 'npm', ['pack', '--dry-run', '--json']);
}
if (file('test/week3-day5.test.js')) command('Day 5 report tests', 'node', ['--test', 'test/week3-day5.test.js']);
else check('Day 5 report tests present', false);
if (file('bin/cli.js') && file('examples/unsafe.sql') && file('examples/week3-gate-policy.json')) {
  const result = spawnSync('node', ['bin/cli.js', 'examples/unsafe.sql', '--gate-policy', 'examples/week3-gate-policy.json', '--format', 'json', '--fail-on', 'none'], { cwd: root, encoding: 'utf8', timeout: 30000 });
  let gate;
  try { gate = JSON.parse(result.stdout).gate; } catch { /* invalid JSON is a failed check */ }
  check('Unsafe gate blocks with exit 1', result.status === 1 && gate?.decision === 'BLOCK', `exit ${result.status ?? 'unknown'}`);
}
const failed = checks.filter(c => !c.ok);
const lines = ['# Week 3 release-readiness audit', '', `CLI version: ${pkg?.version ?? 'unknown'}; VS Code version: ${ext?.version ?? 'unknown'}`, '', '| Check | Result | Detail |', '|---|---|---|', ...checks.map(c => `| ${c.name.replaceAll('|', '\\|')} | ${c.ok ? 'PASS' : 'FAIL'} | ${c.detail.replaceAll('|', '\\|')} |`), '', failed.length ? `**NOT READY:** ${failed.length} check(s) failed.` : '**Local checks passed.** Hosted PR workflow, VS Code packaging, and release approvals still require manual verification.', '', 'This audit never publishes, pushes, tags, or modifies a release.'];
if (output) { writeFileSync(resolve(root, output), lines.join('\n') + '\n'); console.log(`Report: ${output}`); }
console.log(`${checks.length - failed.length}/${checks.length} local checks passed.`);
process.exitCode = failed.length ? 1 : 0;
