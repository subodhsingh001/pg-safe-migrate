
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { analyzeFiles } from '../src/analysis.js';

if (typeof global.gc !== 'function') {
  throw new Error('Run with node --expose-gc');
}

const count = 10000;
const rounds = 20;

const sql = Array.from(
  { length: count },
  (_, i) =>
    `-- pg-safe-migrate-disable-next-line PG002 -- reason: Benchmark\n` +
    `ALTER TABLE users DROP COLUMN column_${i};`
).join('\n');

const entries = [
  {
    file: 'retention-test.sql',
    sql
  }
];

const config = {
  severity: 'error',
  rules: {},
  suppression: {
    enabled: true,
    requireReason: true,
    reportSuppressed: true,
    protectedRules: ['PG011', 'PG023']
  }
};

function memory() {
  const m = process.memoryUsage();

  return {
    heapMB: +(m.heapUsed / 1048576).toFixed(2),
    rssMB: +(m.rss / 1048576).toFixed(2),
    externalMB: +(m.external / 1048576).toFixed(2),
    arrayBuffersMB: +(m.arrayBuffers / 1048576).toFixed(2)
  };
}

async function analyze() {
  const suppressionAudit = [];

  const findings = await analyzeFiles(
    entries,
    config,
    { suppressionAudit }
  );

  assert.equal(findings.length, 0);
  assert.equal(suppressionAudit.length, count);

  assert.ok(
    suppressionAudit.every(
      record => record.status === 'suppressed'
    )
  );
}

async function collectGarbage() {
  global.gc();
  await new Promise(resolve => setImmediate(resolve));
  global.gc();
}

console.log('Starting warm-up');

for (let i = 0; i < 3; i++) {
  await analyze();
  await collectGarbage();
}

const baseline = memory();

console.log(JSON.stringify({
  stage: 'baseline',
  ...baseline
}));

for (let round = 1; round <= rounds; round++) {
  const start = performance.now();

  await analyze();

  const ms = Math.round(performance.now() - start);

  await collectGarbage();

  console.log(JSON.stringify({
    round,
    statements: count,
    ms,
    ...memory()
  }));
}

const final = memory();

console.log(JSON.stringify({
  stage: 'summary',
  rounds,
  totalStatements: count * rounds,
  baseline,
  final,
  heapGrowthMB: +(
    final.heapMB - baseline.heapMB
  ).toFixed(2),
  rssGrowthMB: +(
    final.rssMB - baseline.rssMB
  ).toFixed(2)
}));
