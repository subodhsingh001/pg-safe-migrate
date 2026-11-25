
import pgQuery from 'libpg-query';
import { analyzeFiles } from '../src/analysis.js';

const count = Number(process.argv[2] ?? 1000);
const mode = process.argv[3] ?? 'parse';

if (!Number.isInteger(count) || count < 1 || count > 20000) {
  throw new Error('Statement count must be 1-20000');
}

if (!['generate', 'parse', 'analyze'].includes(mode)) {
  throw new Error('Mode must be generate, parse or analyze');
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

let peak = memory();

function sample() {
  const m = memory();

  for (const key of Object.keys(peak)) {
    peak[key] = Math.max(peak[key], m[key]);
  }
}

const timer = setInterval(sample, 5);
timer.unref();

const sql = Array.from(
  { length: count },
  (_, i) => `CREATE TABLE benchmark_${i} (id integer);`
).join('\n');

sample();

const started = performance.now();

let result;

if (mode === 'generate') {
  result = sql.length;
} else if (mode === 'parse') {
  result = await pgQuery.parse(sql);
} else {
  result = await analyzeFiles([
    {
      file: 'benchmark.sql',
      sql
    }
  ]);
}

const durationMs = performance.now() - started;

sample();

console.log(JSON.stringify({
  mode,
  statements: count,
  durationMs: +durationMs.toFixed(2),
  memoryAtEnd: memory(),
  peakSampledMemory: peak,
  resultCount:
    mode === 'parse'
      ? result.stmts?.length
      : mode === 'analyze'
        ? result.length
        : result
}, null, 2));

clearInterval(timer);
