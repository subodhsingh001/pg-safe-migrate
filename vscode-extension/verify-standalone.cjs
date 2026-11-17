const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = __dirname;
const runtime = path.join(root, 'runtime');
for (const file of ['bin/cli.js','src/analysis.js','node_modules/libpg-query/package.json','node_modules/commander/package.json','node_modules/chalk/package.json']) {
  if (!fs.existsSync(path.join(runtime, file))) throw new Error(`Missing ${file}. Run npm run build:standalone`);
}
const sql = path.join(root, 'standalone-smoke.sql');
try {
  fs.writeFileSync(sql, 'DROP TABLE users;\n');
  const result = spawnSync('node', [path.join(runtime,'bin','cli.js'), '--format','json','--fail-on','none',sql], { cwd: root, encoding:'utf8', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`CLI failed: ${result.stderr || result.stdout}`);
  const parsed = JSON.parse(result.stdout);
  if (!parsed.findings?.some(f => f.ruleId === 'PG011' && f.severity === 'error')) throw new Error('PG011 not detected');
  console.log('PASS: bundled CLI detects PG011 without relying on parent project.');
} finally { fs.rmSync(sql, { force:true }); }
