import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseSqlFile } from '../src/parser.js';
import { lintStatements } from '../src/engine.js';
import { RULE_CATALOG } from '../src/rules/ruleCatalog.js';

const fixture = (name) => readFile(new URL(`./fixtures/regression/${name}`, import.meta.url), 'utf8');
async function analyze(name, postgresVersion) {
  const statements = await parseSqlFile(await fixture(name));
  return lintStatements(statements, postgresVersion == null ? {} : { postgresVersion });
}
const ids = (issues) => issues.map((issue) => issue.ruleId);

test('safe expand fixture avoids Day 3 and Day 4 risk findings', async () => {
  const found = ids(await analyze('01-safe-expand.sql', 14));
  for (const rule of ['PG021', 'PG022', 'PG023', 'PG024', 'PG025']) {
    assert.ok(!found.includes(rule), `${rule} must not flag safe expansion`);
  }
});

test('operational risk fixture produces all five new rule identifiers', async () => {
  const found = ids(await analyze('02-operational-risks.sql', 16));
  for (const rule of ['PG021', 'PG022', 'PG023', 'PG024', 'PG025']) {
    assert.ok(found.includes(rule), `${rule} missing`);
    assert.equal(found.filter(id => id === rule).length, 1, `${rule} duplicated`);
  }
});

test('PostgreSQL 15 syntax is flagged only for PostgreSQL 14', async () => {
  const old = ids(await analyze('03-version-15-features.sql', 14));
  assert.ok(old.includes('PG019'));
  assert.ok(old.includes('PG020'));
  for (const version of [15, 16, 17, 18]) {
    const supported = ids(await analyze('03-version-15-features.sql', version));
    assert.ok(!supported.includes('PG019'), `MERGE wrongly flagged for PG${version}`);
    assert.ok(!supported.includes('PG020'), `NULLS NOT DISTINCT wrongly flagged for PG${version}`);
  }
});

test('version-dependent findings require an explicit target version', async () => {
  const found = ids(await analyze('03-version-15-features.sql'));
  assert.ok(!found.includes('PG019'));
  assert.ok(!found.includes('PG020'));
});

test('new rule findings have matching catalog metadata and valid severities', async () => {
  const byId = new Map(RULE_CATALOG.map(entry => [entry.id, entry]));
  const found = await analyze('02-operational-risks.sql', 16);
  for (const issue of found.filter(issue => /^PG02[1-5]$/.test(issue.ruleId))) {
    const catalog = byId.get(issue.ruleId);
    assert.ok(catalog, `Catalog missing ${issue.ruleId}`);
    assert.equal(issue.severity, catalog.defaultSeverity);
    assert.ok(typeof issue.message === 'string' && issue.message.length > 10);
    assert.ok(typeof issue.fix === 'string' && issue.fix.length > 10);
  }
});

test('catalog has no duplicate rule IDs', () => {
  assert.equal(new Set(RULE_CATALOG.map(rule => rule.id)).size, RULE_CATALOG.length);
});
