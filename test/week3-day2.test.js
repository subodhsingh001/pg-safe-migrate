import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadTeamPolicy } from '../src/team-policy.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function policy(value) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pgsafe-policy-'));
  const file = path.join(dir, 'policy.json');
  fs.writeFileSync(file, JSON.stringify(value));
  try { return loadTeamPolicy(file); } finally { fs.rmSync(dir, {recursive:true, force:true}); }
}
function cli(sql, config) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pgsafe-cli-'));
  const file = path.join(dir, 'policy.json');
  fs.writeFileSync(file, JSON.stringify(config));
  try { return spawnSync(process.execPath, ['bin/cli.js', `examples/${sql}.sql`, '--gate-policy', file, '--format', 'json', '--fail-on', 'none'], {cwd:root, encoding:'utf8'}); }
  finally { fs.rmSync(dir, {recursive:true, force:true}); }
}
test('rejects unknown and duplicate blocked rules', () => {
  assert.throws(() => policy({blockedRules:['PG999']}), /blockedRules/);
  assert.throws(() => policy({blockedRules:['PG001','PG001']}), /duplicates/);
});
test('rejects invalid policy name and thresholds', () => {
  assert.throws(() => policy({name:''}), /name/);
  assert.throws(() => policy({maxWarnings:-1}), /maxWarnings/);
  assert.throws(() => policy({maxRiskScore:101}), /maxRiskScore/);
});
test('unsafe migration returns JSON BLOCK and exit code 1', () => {
  const result=cli('unsafe',{name:'ci',blockedRules:['PG001']});
  assert.equal(result.status,1, result.stderr);
  const report=JSON.parse(result.stdout);
  assert.equal(report.gate.decision,'BLOCK');
  assert.match(report.gate.reasons.join(' '), /PG001/);
});
test('safe migration returns JSON PASS and exit code 0', () => {
  const result=cli('safe',{name:'ci',blockedRules:['PG001']});
  assert.equal(result.status,0,result.stderr);
  assert.equal(JSON.parse(result.stdout).gate.decision,'PASS');
});
test('invalid policy fails closed with exit code 2', () => {
  const result=cli('safe',{blockedRules:['PG999']});
  assert.equal(result.status,2);
  assert.match(result.stderr,/blockedRules/);
});
test('simulation-only gate fails closed with exit code 2', () => {
  const result=cli('safe',{requireSimulation:true});
  assert.equal(result.status,2);
  assert.match(result.stderr,/--assess/);
});
