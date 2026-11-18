import test from 'node:test';
import assert from 'node:assert/strict';
import { getVersionCompatibility, VERSION_FEATURES } from '../src/rules/versionCatalog.js';
import { versionRules } from '../src/rules/versionRules.js';

test('version feature catalog documents stable rule IDs and minimum versions', () => {
  assert.equal(VERSION_FEATURES.merge.ruleId, 'PG019');
  assert.equal(VERSION_FEATURES.nullsNotDistinct.ruleId, 'PG020');
  assert.equal(getVersionCompatibility('merge', 14).supported, false);
  assert.equal(getVersionCompatibility('merge', 15).supported, true);
  assert.equal(getVersionCompatibility('nullsNotDistinct', null).supported, null);
});

test('PG020 detects unique index NULLS NOT DISTINCT on PostgreSQL 14 only', () => {
  const stmt = { IndexStmt: { unique: true, nullsNotDistinct: true } };
  assert.equal(versionRules.check(stmt, { postgresVersion: 14 })[0]?.ruleId, 'PG020');
  for (const postgresVersion of [15, 16, 17, 18]) {
    assert.equal(versionRules.check(stmt, { postgresVersion }).length, 0);
  }
  assert.equal(versionRules.check(stmt).length, 0);
});

test('PG020 detects unique table constraints but not ordinary indexes', () => {
  const stmt = { CreateStmt: { tableElts: [{ Constraint: { contype: 'CONSTR_UNIQUE', nullsNotDistinct: true } }] } };
  assert.equal(versionRules.check(stmt, { postgresVersion: 14 })[0]?.ruleId, 'PG020');
  assert.equal(versionRules.check({ IndexStmt: { unique: false, nullsNotDistinct: true } }, { postgresVersion: 14 }).length, 0);
});

test('unknown catalog features fail rather than silently passing', () => {
  assert.throws(() => getVersionCompatibility('unknown', 14), RangeError);
});
