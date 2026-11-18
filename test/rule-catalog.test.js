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
