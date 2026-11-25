
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const root = process.cwd();
const cli = path.join(root, 'bin', 'cli.js');
const tempDir = fs.mkdtempSync(
  path.join(os.tmpdir(), 'pg-safe-memory-')
);

const preload = path.join(tempDir, 'memory-preload.cjs');

fs.writeFileSync(preload, `
const fs = require('node:fs');

let peakRSS = 0;
let peakHeap = 0;
let peakExternal = 0;
let peakArrayBuffers = 0;

function sample() {
  const m = process.memoryUsage();
  peakExternal = Math.max(peakExternal, m.external);
  peakArrayBuffers = Math.max(
    peakArrayBuffers,
    m.arrayBuffers
  );
  peakRSS = Math.max(peakRSS, m.rss);
  peakHeap = Math.max(peakHeap, m.heapUsed);
}

sample();

const timer = setInterval(sample, 10);
timer.unref();

process.on('exit', () => {
  sample();
  fs.writeFileSync(
    process.env.PG_SAFE_MEMORY_REPORT,
    JSON.stringify({
      peakSampledRSSMB: +(peakRSS / 1048576).toFixed(2),
      peakSampledHeapMB: +(peakHeap / 1048576).toFixed(2),
      peakExternalMB: +(peakExternal / 1048576).toFixed(2),
      peakArrayBuffersMB: +(peakArrayBuffers / 1048576).toFixed(2)
    })
  );
});
`);

try {
  for (const count of [1000, 5000, 10000]) {
    const sqlFile = path.join(
      tempDir,
      `migration-${count}.sql`
    );

    const memoryFile = path.join(
      tempDir,
      `memory-${count}.json`
    );

    const sql = Array.from(
      { length: count },
      (_, i) => `CREATE TABLE memory_${i} (id integer);`
    ).join('\n');

    fs.writeFileSync(sqlFile, sql);

    const result = spawnSync(
      process.execPath,
      [
        '--require',
        preload,
        cli,
        '--format',
        'json',
        '--fail-on',
        'none',
        sqlFile
      ],
      {
        cwd: root,
        encoding: 'utf8',
        timeout: 60000,
        maxBuffer: 20 * 1024 * 1024,
        env: {
          ...process.env,
          PG_SAFE_MEMORY_REPORT: memoryFile
        }
      }
    );

    if (result.error || result.status !== 0) {
      throw new Error(
        String(result.error || result.stderr)
      );
    }

    JSON.parse(result.stdout);

    const memory = JSON.parse(
      fs.readFileSync(memoryFile, 'utf8')
    );

    console.log(
      JSON.stringify({
        statements: count,
        ...memory
      })
    );
  }
} finally {
  fs.rmSync(tempDir, {
    recursive: true,
    force: true
  });
}
