
'use strict';

const { performance } = require('node:perf_hooks');

function originalPosition(sql, offset) {
  const prefix = sql.slice(0, offset);
  const lastNewline = prefix.lastIndexOf('\n');

  return {
    line: prefix.split('\n').length,
    column: offset - lastNewline
  };
}

function optimizedPositions(sql, offsets) {
  const results = [];
  let cursor = 0;
  let line = 1;
  let lineStart = 0;

  for (const offset of offsets) {
    while (cursor < offset) {
      if (sql.charCodeAt(cursor) === 10) {
        line++;
        lineStart = cursor + 1;
      }
      cursor++;
    }

    results.push({
      line,
      column: offset - lineStart + 1
    });
  }

  return results;
}

const count = 5000;
const lines = Array.from(
  { length: count },
  (_, i) => `CREATE TABLE bench_${i} (id integer);`
);

const sql = lines.join('\n');
const offsets = [];
let offset = 0;

for (const line of lines) {
  offsets.push(offset);
  offset += line.length + 1;
}

const startOld = performance.now();
const oldResults = offsets.map(
  value => originalPosition(sql, value)
);
const oldMs = performance.now() - startOld;

const startNew = performance.now();
const newResults = optimizedPositions(sql, offsets);
const newMs = performance.now() - startNew;

for (let i = 0; i < count; i++) {
  if (
    oldResults[i].line !== newResults[i].line ||
    oldResults[i].column !== newResults[i].column
  ) {
    throw new Error(`Mismatch at statement ${i}`);
  }
}

console.log({
  statements: count,
  originalMs: Number(oldMs.toFixed(2)),
  optimizedMs: Number(newMs.toFixed(2)),
  speedup: Number((oldMs / newMs).toFixed(2)),
  verified: true
});
