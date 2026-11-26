import test from 'node:test';
import assert from 'node:assert/strict';
import { RULE_CATALOG, getRule, searchRules } from '../src/rules/ruleCatalog.js';
import { execFileSync } from 'node:child_process';

test('catalog has unique rule identifiers', () => {
  assert.equal(new Set(RULE_CATALOG.map(rule => rule.id)).size, RULE_CATALOG.length);
});
test('existing and new rule identifiers retain their meaning', () => {
  assert.match(getRule('PG001').title, /index/i);
  assert.equal(getRule('pg019').minPostgresVersion, 15);
  assert.equal(getRule('PG025').category, 'constraint');
});
test('catalog supports text search', () => {
  assert.ok(searchRules('locking').some(rule => rule.id === 'PG001'));
  assert.ok(searchRules('PG023').some(rule => rule.id === 'PG023'));
});
test('catalog CLI supports JSON output', () => {
  const output = execFileSync(process.execPath, ['scripts/rule-catalog.cjs', '--rule', 'PG020', '--json'], { encoding: 'utf8' });
  assert.equal(JSON.parse(output)[0].minPostgresVersion, 15);
});

test('catalog covers implemented identifiers and default CLI severity', () => {
  const expected = Array.from({length:29}, (_,i)=>i+1).filter(n=>n!==9 && n!==18).map(n=>`PG${String(n).padStart(3,'0')}`);
  assert.deepEqual(RULE_CATALOG.map(r=>r.id).sort(), expected);
  for (const rule of RULE_CATALOG) assert.equal(rule.defaultCliSeverity, ['PG015','PG016','PG017','PG026','PG027','PG028','PG029'].includes(rule.id) ? 'WARNING' : 'ERROR');
  assert.match(getRule('PG013').title, /legacy/i);
  assert.match(getRule('PG017').title, /Flyway/i);
});

test('raw severity metadata preserves engine warnings', () => {
  for (const id of ['PG024', 'PG025']) {
    assert.equal(getRule(id).defaultSeverity, 'WARNING');
    assert.equal(getRule(id).defaultCliSeverity, 'ERROR');
  }
});
