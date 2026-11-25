
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const root = process.cwd();
const cli = path.join(root, 'bin', 'cli.js');

const tempDir = fs.mkdtempSync(
  path.join(os.tmpdir(), 'pg-safe-day7-')
);

const sizes = [1000, 5000, 10000];
const results = [];

function createSQL(count) {
  return Array.from(
    { length: count },
    (_, i) =>
      `CREATE TABLE benchmark_${i} (id integer);`
  ).join('\n');
}

try {
  for (const count of sizes) {
    const sqlFile = path.join(
      tempDir,
      `migration-${count}.sql`
    );

    fs.writeFileSync(
      sqlFile,
      createSQL(count),
      'utf8'
    );

    const runs = [];

    for (let run = 1; run <= 3; run++) {
      const start = performance.now();

      const result = spawnSync(
        process.execPath,
        [
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
          maxBuffer: 20 * 1024 * 1024
        }
      );

      const elapsed = performance.now() - start;

      if (result.error || result.status !== 0) {
        throw new Error(
          `Benchmark failed: ${count} statements\n` +
          String(result.error || result.stderr)
        );
      }

      const report = JSON.parse(result.stdout);

      if (report.filesChecked !== 1) {
        throw new Error('Unexpected filesChecked value');
      }

      runs.push(Number(elapsed.toFixed(2)));
    }

    const average =
      runs.reduce((a, b) => a + b, 0) /
      runs.length;

    results.push({
      statements: count,
      runsMs: runs,
      averageMs: Number(average.toFixed(2))
    });
  }

  console.log(
    'PG Safe Migrate - Week 6 Day 7'
  );
  console.log('Node:', process.version);
  console.log('Platform:', process.platform);
  console.log('Results:');
  console.log(JSON.stringify(results, null, 2));
} finally {
  fs.rmSync(tempDir, {
    recursive: true,
    force: true
  });
}
