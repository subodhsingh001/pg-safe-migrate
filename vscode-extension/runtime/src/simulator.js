import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const MAX_SQL_BYTES = 1024 * 1024;
const MAX_FILES = 100;
const ALLOWED_VERSIONS = new Set(['14', '15', '16', '17', '18']);

function readSql(file) {
  const resolved = path.resolve(file);
  const stat = fs.statSync(resolved);
  if (!stat.isFile() || stat.size > MAX_SQL_BYTES) throw new Error('SQL file must be a regular file <= 1 MiB');
  const sql = fs.readFileSync(resolved, 'utf8');
  if (!sql.trim()) throw new Error(`SQL file is empty: ${resolved}`);
  return { file: resolved, sql };
}

function migrationFiles(dir) {
  const root = path.resolve(dir);
  if (!fs.statSync(root).isDirectory()) throw new Error('migrations-dir must be a directory');
  const files = fs.readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.sql'))
    .map(entry => path.join(root, entry.name)).sort();
  if (!files.length || files.length > MAX_FILES) throw new Error('migrations-dir must contain 1-100 top-level .sql files');
  return files.map(readSql);
}

/** Run SQL in a disposable, network-isolated PostgreSQL container.
 * Baseline and target steps are separate. Not a production safety or rollback guarantee.
 */
export function simulateSqlFile(file, {
  postgresVersion = '16', timeoutSeconds = 60, baseline,
  migrationsDir, verifySql, run = spawnSync
} = {}) {
  if (!ALLOWED_VERSIONS.has(String(postgresVersion))) throw new Error('Simulation supports PostgreSQL 14-18');
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 10 || timeoutSeconds > 300) throw new Error('timeoutSeconds must be 10-300');
  if (file && migrationsDir) throw new Error('Use either --simulate <file> or --migrations-dir, not both');
  if (!file && !migrationsDir) throw new Error('Provide a SQL file or --migrations-dir');
  const baselineStep = baseline ? readSql(baseline) : null;
  const targets = migrationsDir ? migrationFiles(migrationsDir) : [readSql(file)];
  const verification = verifySql ? readSql(verifySql) : null;
  const name = `pg-safe-sim-${randomUUID().slice(0, 12)}`;
  const image = `postgres:${postgresVersion}`;
  const call = (args, options = {}) => {
    const result = run('docker', args, {
      encoding: 'utf8', timeout: options.timeout ?? 15000,
      input: options.input, maxBuffer: 2 * 1024 * 1024, windowsHide: true
    });
    if (result.error) throw new Error(`Docker ${args[0]} failed: ${result.error.message}`);
    return result;
  };
  let created = false;
  let primaryError;
  try {
    const started = call(['run', '-d', '--name', name, '--network', 'none', '--memory', '512m', '--cpus', '1', '--pids-limit', '128', '--security-opt', 'no-new-privileges', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', image], { timeout: 120000 });
    if (started.status !== 0) throw new Error(`Docker could not start disposable PostgreSQL: ${(started.stderr || '').trim()}`);
    created = true;
    let ready = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      const result = call(['exec', name, 'pg_isready', '-U', 'postgres'], { timeout: 5000 });
      if (result.status === 0) { ready = true; break; }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
    }
    if (!ready) throw new Error('Disposable PostgreSQL did not become ready within 30 seconds');
    const execute = (step, stage) => {
      const result = call(['exec', '-i', name, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-f', '-'], { input: step.sql, timeout: timeoutSeconds * 1000 });
      return {
        stage, file: step.file, passed: result.status === 0,
        stdout: (result.stdout || '').slice(-4000), stderr: (result.stderr || '').slice(-4000),
        exitCode: result.status
      };
    };
    const steps = [];
    if (baselineStep) {
      const result = execute(baselineStep, 'baseline');
      steps.push(result);
      if (!result.passed) return summary(result, steps, postgresVersion);
    }
    for (const target of targets) {
      const result = execute(target, 'migration');
      steps.push(result);
      if (!result.passed) return summary(result, steps, postgresVersion);
    }
    if (verification) {
      const result = execute(verification, 'verification');
      steps.push(result);
      if (!result.passed) return summary(result, steps, postgresVersion);
    }
    return summary(steps.at(-1), steps, postgresVersion);
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    if (created) {
      try {
        const removed = call(['rm', '-f', name], { timeout: 30000 });
        if (removed.status !== 0) throw new Error((removed.stderr || 'docker rm failed').trim());
      } catch (error) {
        const message = `CRITICAL: Disposable container ${name} could not be removed: ${error.message}`;
        if (primaryError) throw new AggregateError([primaryError, error], message);
        throw new Error(message);
      }
    }
  }
}

function summary(last, steps, postgresVersion) {
  return {
    passed: last.passed, postgresVersion: Number(postgresVersion), isolated: true,
    disposable: true, stage: last.stage, file: last.file,
    stdout: last.stdout, stderr: last.stderr, exitCode: last.exitCode,
    steps, limitation: 'Checks SQL execution against an empty disposable database plus optional baseline; not a downtime, production-data, or rollback guarantee.'
  };
}
