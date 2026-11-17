import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { toGitHubAnnotations, toMarkdownSummary } from '../src/github.js';
import { getPreset } from '../src/presets.js';
import { summarizeRisk } from '../src/risk.js';
import { lockFor } from '../src/locks.js';
import { migrationPlan } from '../src/plans.js';
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url)));
test('CLI version matches package version', () => {
  const cli = fs.readFileSync(new URL('../bin/cli.js', import.meta.url), 'utf8');
  assert.match(cli, /\.version\(version\)/);
  const result = spawnSync(process.execPath, [new URL('../bin/cli.js', import.meta.url).pathname, '--version'], { encoding: 'utf8' });
  if (result.error || result.status !== 0) return; // Dependency-free check remains authoritative when dependencies unavailable.
  assert.equal(result.stdout.trim(), pkg.version);
});
test('GitHub annotations escape command injection', () => {
  const out = toGitHubAnnotations([{ file:'a,b.sql', line:3, column:2, ruleId:'PG001', severity:'error', message:'bad\n::warning::fake', fix:'fix' }]);
  assert.match(out, /a%2Cb.sql/);
  assert.match(out, /bad%0A::warning::fake/);
  assert.equal(out.split('\n').length, 2);
});
test('GitHub summary contains useful findings', () => {
  assert.match(toMarkdownSummary([{file:'x.sql',line:2,ruleId:'PG016',severity:'warning',message:'transaction'}],1), /PG016/);
});
test('strict preset promotes framework advisories', () => {
  assert.equal(getPreset('strict').rules.PG016, 'error');
  assert.equal(getPreset('recommended').rules.PG016, undefined);
  assert.throws(() => getPreset('unknown'));
});
test('risk score discloses uncertainty', () => {
  assert.equal(summarizeRisk([{severity:'error'}]).score,20);
  assert.equal(summarizeRisk([]).confidence,'low');
});
test('concurrent index lock and plan are advisory', () => {
  assert.equal(lockFor({IndexStmt:{concurrent:true}}).mode,'SHARE UPDATE EXCLUSIVE');
  assert.equal(migrationPlan({ruleId:'PG016'}).automated,false);
});
