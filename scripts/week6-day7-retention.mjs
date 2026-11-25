
import pgQuery from 'libpg-query';
import { analyzeFiles } from '../src/analysis.js';

if (typeof global.gc !== 'function') {
  throw new Error('Run Node with --expose-gc');
}

const count = Number(process.argv[2] ?? 5000);
const mode = process.argv[3] ?? 'parse';

if (!Number.isInteger(count) || count < 1 || count > 20000) {
  throw new Error('Count must be between 1 and 20000');
}

if (!['parse', 'analyze'].includes(mode)) {
  throw new Error('Mode must be parse or analyze');
}

const MB = 1024 * 1024;

function memory() {
  const m = process.memoryUsage();

  return {
    rssMB: +(m.rss / MB).toFixed(2),
    heapMB: +(m.heapUsed / MB).toFixed(2),
    externalMB: +(m.external / MB).toFixed(2),
    arrayBuffersMB: +(m.arrayBuffers / MB).toFixed(2)
  };
}

const sql = Array.from(
  { length: count },
  (_, i) => `CREATE TABLE retention_${i} (id integer);`
).join('\n');

async function runOnce() {
  if (mode === 'parse') {
    const result = await pgQuery.parse(sql);
    return result.stmts?.length ?? 0;
  }

  const findings = await analyzeFiles([
    { file: 'retention.sql', sql }
  ]);

  return findings.length;
}

console.log('Before:', memory());

for (let iteration = 1; iteration <= 5; iteration++) {
  const start = performance.now();

  const resultCount = await runOnce();

  const elapsed = performance.now() - start;

  const beforeGC = memory();

  global.gc();
  global.gc();

  const afterGC = memory();

  console.log(JSON.stringify({
    iteration,
    resultCount,
    durationMs: +elapsed.toFixed(2),
    beforeGC,
    afterGC
  }));
}
