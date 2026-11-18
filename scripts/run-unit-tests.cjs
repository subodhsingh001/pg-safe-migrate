
const { readdirSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

const root = resolve(__dirname, '..');
const testDir = join(root, 'test');

const files = readdirSync(testDir)
  .filter((name) => name.endsWith('.test.js') ||
                    name.endsWith('.test.cjs') ||
                    name.endsWith('.cjs'))
  .sort()
  .map((name) => join(testDir, name));

if (files.length === 0) {
  console.error('No unit tests found.');
  process.exit(1);
}

console.log(`Running ${files.length} test files`);

const result = spawnSync(
  process.execPath,
  ['--test', ...files],
  {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true
  }
);

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
