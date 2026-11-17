const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const root = path.resolve(__dirname, '..');
const migrationsDir = path.join(root, 'test', 'fixtures', 'pg-matrix', 'migrations');
const expected = ['001_add_phone.sql', '002_add_email_index.sql'];
const actual = fs.readdirSync(migrationsDir).filter(name => name.endsWith('.sql')).sort();
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  console.error('Matrix fixtures changed. Review the safe migration allowlist:', actual);
  process.exit(1);
}
const versions = ['14', '15', '16', '17', '18'];
let failed = false;
for (const version of versions) {
  console.log(`\n--- PostgreSQL ${version} ---`);
  const args = [
    path.join(root, 'bin', 'cli.js'), '--assess',
    '--migrations-dir', migrationsDir,
    '--baseline', path.join(root, 'examples', 'baseline.sql'),
    '--verify-sql', path.join(root, 'examples', 'verify.sql'),
    '--postgres-version', version
  ];
  const r = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit', timeout: 180000 });
  if (r.status !== 0) {
    failed = true;
    console.error(`PostgreSQL ${version} failed: ${r.error?.message ?? r.status}`);
  }
}
process.exitCode = failed ? 1 : 0;
