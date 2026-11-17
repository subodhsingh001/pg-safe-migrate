const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'bin', 'cli.js');
function run(args, cwd=root) {
  return spawnSync(process.execPath, [cli, ...args], {cwd, encoding:'utf8'});
}
assert.equal(run(['--help']).status, 0);
assert.equal(run(['examples/safe.sql']).status, 0);
assert.equal(run(['examples/unsafe.sql']).status, 1);
assert.equal(run(['examples/unsafe.sql','--fail-on','none']).status, 0);
assert.equal(run(['--format','unknown','examples/safe.sql']).status, 2);
assert.equal(run(['missing.sql']).status, 2);
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pg-safe-release-'));
try {
  fs.writeFileSync(path.join(tmp,'pg-safe-migrate.config.json'), JSON.stringify({rules:{PG001:'off'}}));
  fs.writeFileSync(path.join(tmp,'unsafe.sql'),'CREATE INDEX idx_x ON users(email);');
  assert.equal(run(['unsafe.sql'],tmp).status, 0);
  fs.writeFileSync(path.join(tmp,'pg-safe-migrate.config.json'), JSON.stringify({rules:{PG001:'warning'}}));
  assert.equal(run(['unsafe.sql','--fail-on','error'],tmp).status, 0);
  assert.equal(run(['unsafe.sql','--fail-on','warning'],tmp).status, 1);
  assert.equal(run(['unsafe.sql','--format','json','--output','result.json','--fail-on','none'],tmp).status,0);
  const result=JSON.parse(fs.readFileSync(path.join(tmp,'result.json'),'utf8'));
  assert.equal(result.findings[0].ruleId,'PG001');
} finally { fs.rmSync(tmp,{recursive:true,force:true}); }
console.log('Release smoke checks passed: CLI, exit codes, config, JSON and error handling.');
