import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function names(args, cwd) {
  return git(args, cwd).split('\0').filter(Boolean);
}
export function getChangedSqlFiles(baseBranch, cwd = process.cwd()) {
  let root;
  try { root = git(['rev-parse', '--show-toplevel'], cwd); }
  catch { throw new Error('Not inside a Git repository.'); }
  const changed = new Set();
  if (baseBranch) {
    try {
      git(['rev-parse', '--verify', `${baseBranch}^{commit}`], root);
      for (const f of names(['diff', '--name-only', '-z', '--diff-filter=ACMR', `${baseBranch}...HEAD`, '--'], root)) changed.add(f);
    } catch { throw new Error(`Git base ref not available: ${baseBranch}. Fetch the base branch before running --changed.`); }
  }
  for (const args of [
    ['diff', '--name-only', '-z', '--diff-filter=ACMR', '--cached', '--'],
    ['diff', '--name-only', '-z', '--diff-filter=ACMR', '--'],
    ['ls-files', '--others', '--exclude-standard', '-z']
  ]) {
    try { for (const f of names(args, root)) changed.add(f); }
    catch (e) { throw new Error(`Git change detection failed: ${e.message}`); }
  }
  return [...changed].filter(f => f.toLowerCase().endsWith('.sql'))
    .map(f => path.resolve(root, f))
    .filter(f => fs.existsSync(f) && fs.statSync(f).isFile()).sort();
}
