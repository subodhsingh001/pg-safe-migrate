
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { performance } = require('node:perf_hooks');

const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'bin', 'cli.js');

const sizes = [10, 100, 1000, 5000];
const tempDir = fs.mkdtempSync(
  path.join(os.tmpdir(), 'pg-safe-day6-')
);

function createSQL(count) {
  const file = path.join(tempDir, `test-${count}.sql`);

  const statements = Array.from(
    { length: count },
    (_, i) =>
      `CREATE TABLE IF NOT EXISTS bench_${i + 1} (id integer);`
  );

  fs.writeFileSync(file, statements.join('\n') + '\n');

  return file;
}

function run(args, label) {
  return new Promise((resolve, reject) => {
    const started = performance.now();

    const child = spawn(process.execPath, args, {
      cwd: root,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });

    child.on('error', reject);

    child.on('close', code => {
      if (code !== 0) {
        reject(
          new Error(
            `${label} failed (exit ${code}):\n${stderr}`
          )
        );
        return;
      }

      resolve({
        label,
        durationMs: Math.round(performance.now() - started),
        stdout,
        stderr
      });
    });
  });
}

async function main() {
  try {
    console.log('\nPG Safe Migrate - Week 6 Day 6');
    console.log('Node:', process.version);
    console.log('Platform:', process.platform);
    console.log('Architecture:', process.arch);

    console.log('\nBaseline:');

    const baseline = await run(
      ['-e', `
        const m = process.memoryUsage();
        console.log(JSON.stringify({
          rssMB: +(m.rss / 1048576).toFixed(2),
          heapUsedMB: +(m.heapUsed / 1048576).toFixed(2),
          externalMB: +(m.external / 1048576).toFixed(2),
          arrayBuffersMB: +(m.arrayBuffers / 1048576).toFixed(2)
        }));
      `],
      'Node baseline'
    );

    console.log(baseline.stdout.trim());

    console.log('\nCLI benchmarks:');

    for (const count of sizes) {
      const file = createSQL(count);

      const result = await run(
        [
          '--expose-gc',
          cli,
          '--format',
          'json',
          '--fail-on',
          'none',
          file
        ],
        `${count} statements`
      );

      JSON.parse(result.stdout);

      console.log(
        `${count} statements: ${result.durationMs} ms`
      );
    }

    console.log('\nAll Day 6 CLI executions passed.');
  } finally {
    fs.rmSync(tempDir, {
      recursive: true,
      force: true
    });
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
