import fs from 'node:fs';
import path from 'node:path';
import { analyzeFiles } from './analysis.js';
import { simulateSqlFile } from './simulator.js';
import { summarizeRisk } from './risk.js';
import { parseSqlFile } from './parser.js';
import { lockFor } from './locks.js';

export function simulationEntries({ file, migrationsDir }) {
  if (Boolean(file) === Boolean(migrationsDir)) throw new Error('Provide exactly one migration file or --migrations-dir');
  const paths = migrationsDir
    ? fs.readdirSync(migrationsDir, { withFileTypes: true }).filter(x => x.isFile() && x.name.toLowerCase().endsWith('.sql')).map(x => path.join(migrationsDir, x.name)).sort()
    : [file];
  if (!paths.length || paths.length > 100) throw new Error('Expected 1-100 migration SQL files');
  return paths.map(p => ({ file: path.resolve(p), sql: fs.readFileSync(p, 'utf8') }));
}

export async function combinedAssessment({ file, migrationsDir, baseline, postgresVersion = '16', config = {}, run, verifySql }) {
  const entries = simulationEntries({ file, migrationsDir });
  const findings = await analyzeFiles(entries, { ...config, postgresVersion: Number(postgresVersion) }, { advisor: true });
  // Inventory every statement, including operations that do not trigger a lint rule.
  // A zero-findings result must never be mistaken for a zero-lock result.
  const operations = [];
  const indexNames = new Map();
  for (const entry of entries) {
    const statements = await parseSqlFile(entry.sql, { details: true });
    for (const { stmt } of statements) {
      const type = Object.keys(stmt)[0] ?? 'Unknown';
      const lock = lockFor(stmt);
      operations.push({ file: entry.file, type, lock });
      const name = stmt.IndexStmt?.idxname;
      if (name) {
        if (indexNames.has(name)) findings.push({
          ruleId: 'PG018', severity: 'error', file: entry.file, line: 1, column: 1,
          message: `Duplicate CREATE INDEX name ${name}; previously defined in ${indexNames.get(name)}.`,
          fix: 'Give indexes unique names or remove the duplicate migration.',
          lock, framework: 'sql'
        });
        else indexNames.set(name, entry.file);
      }
    }
  }
  // Do not start Docker when the migration set is internally inconsistent.
  const duplicate = findings.some(f => f.ruleId === 'PG018');
  const simulation = duplicate
    ? { passed: false, skipped: true, reason: 'Duplicate index definitions detected before simulation', steps: [] }
    : simulateSqlFile(file, { migrationsDir, baseline, postgresVersion, run, verifySql });
  const risk = summarizeRisk(findings, { operations });
  return {
    schemaVersion: 1, postgresVersion: Number(postgresVersion),
    execution: simulation, lint: { findings, count: findings.length, risk }, operations,
    safetyNote: 'No lint findings does not mean no locks or downtime risk; review operations and production workload.',
    recommendation: !simulation.passed ? 'Migration execution or verification failed; do not deploy.'
      : findings.some(f => f.severity === 'error') ? 'Execution succeeded but static analysis found errors; review before deployment.'
      : findings.length ? 'Execution succeeded with advisories; review locks and production workload.'
      : 'Execution succeeded with no configured findings; this is not a downtime guarantee.',
    passed: simulation.passed && !findings.some(f => f.severity === 'error'),
    confidence: 'limited: disposable database and heuristic linting cannot establish production safety'
  };
}
