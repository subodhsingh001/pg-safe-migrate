
import { parseSqlFile } from './parser.js';
import { lintStatements } from './engine.js';
import { advise } from './advisor.js';

import { lockFor } from './locks.js';
import { migrationPlan } from './plans.js';

const ADVISORY_RULES = new Set(['PG015', 'PG016', 'PG017']);

export function position(sql, offset = 0) {
  const prefix = sql.slice(0, Math.max(0, offset));
  const lines = prefix.split('\n');

  return {
    line: lines.length,
    column: lines.at(-1).length + 1
  };
}

export function frameworkFor(file) {
  const p = file.replaceAll('\\', '/');

  if (/(^|\/)prisma\/migrations\//.test(p)) return 'prisma';
  if (/(^|\/)drizzle\//.test(p)) return 'drizzle';

  return 'sql';
}

function txType(stmt) {
  const kind = stmt.TransactionStmt?.kind;

  if (kind === 'TRANS_STMT_BEGIN' || kind === 'TRANS_STMT_START') {
    return 'begin';
  }

  if ([
    'TRANS_STMT_COMMIT',
    'TRANS_STMT_ROLLBACK',
    'TRANS_STMT_ROLLBACK_TO',
    'TRANS_STMT_PREPARE'
  ].includes(kind)) {
    return 'end';
  }

  return null;
}

function concurrently(stmt) {
  return Boolean(
    stmt.IndexStmt?.concurrent ||
    (
      stmt.DropStmt?.removeType === 'OBJECT_INDEX' &&
      stmt.DropStmt.concurrent
    )
  );
}

function ddlTarget(stmt) {
  if (stmt.AlterTableStmt) {
    return stmt.AlterTableStmt.relation?.relname;
  }

  if (stmt.RenameStmt) {
    return stmt.RenameStmt.relation?.relname;
  }

  if (stmt.DropStmt?.removeType === 'OBJECT_TABLE') {
    return stmt.DropStmt.objects?.[0]?.List?.items
      ?.map(x => x.String?.sval)
      .join('.');
  }

  return null;
}

function extras(stmt, postgresVersion) {
  const issues = [];

  const add = (ruleId, message, fix) => {
    issues.push({ ruleId, message, fix });
  };

  if (!stmt.AlterTableStmt) return issues;

  for (const wrapper of stmt.AlterTableStmt.cmds || []) {
    const cmd = wrapper.AlterTableCmd;
    if (!cmd) continue;

    if (cmd.subtype === 'AT_SetNotNull') {
      add(
        'PG013',
        'SET NOT NULL may scan a large table and requires a strong lock.',
        'Validate an equivalent CHECK constraint first where supported; test on your PostgreSQL version.'
      );
    }

    if (
      cmd.subtype === 'AT_AddConstraint' &&
      cmd.def?.Constraint?.contype === 'CONSTR_CHECK' &&
      !cmd.def.Constraint.skip_validation
    ) {
      add(
        'PG012',
        'Adding a validated CHECK constraint may scan existing rows.',
        'Consider NOT VALID followed by a separately scheduled VALIDATE CONSTRAINT.'
      );
    }

    if (
      cmd.subtype === 'AT_AddConstraint' &&
      cmd.def?.Constraint?.contype === 'CONSTR_UNIQUE'
    ) {
      add(
        'PG010',
        'Adding a UNIQUE constraint can require a blocking index build.',
        'Consider CREATE UNIQUE INDEX CONCURRENTLY then attach the index using a constraint, where applicable.'
      );
    }

    if (
      cmd.subtype === 'AT_AddColumn' &&
      postgresVersion != null &&
      Number(postgresVersion) < 11
    ) {
      const def = cmd.def?.ColumnDef;

      if (
        def?.constraints?.some(
          x => x.Constraint?.contype === 'CONSTR_DEFAULT'
        )
      ) {
        add(
          'PG014',
          'On PostgreSQL 10, adding a column with a default may rewrite the table.',
          'Use a nullable column and controlled backfill, or evaluate upgrading PostgreSQL.'
        );
      }
    }
  }

  return issues;
}

export async function analyzeFiles(entries, config = {}, options = {}) {
  const findings = [];
  const seen = new Map();
  const version = config.postgresVersion ?? null;

  const files = [...entries].sort((a, b) => a.file.localeCompare(b.file));

  for (const { file, sql } of files) {
    const parsed = await parseSqlFile(sql, { details: true });
    const framework = frameworkFor(file);

    let inTransaction = false;

    for (const { stmt, offset } of parsed) {
      const loc = position(sql, offset);
      const transaction = txType(stmt);

      if (transaction === 'begin') {
        inTransaction = true;
      }

      const issues = [
        ...lintStatements([stmt]),
        ...extras(stmt, version)
      ];

      if (inTransaction && concurrently(stmt)) {
        issues.push({
          ruleId: 'PG008',
          message: 'CONCURRENTLY cannot execute inside an explicit transaction block.',
          fix: 'Run concurrent index operations outside BEGIN/COMMIT.'
        });
      }

      if (framework === 'prisma' && concurrently(stmt)) {
        issues.push({
          ruleId: 'PG015',
          message: 'Prisma: use a standalone migration for CONCURRENTLY; combined SQL statements can fail in a transaction context.',
          fix: 'Review the generated migration and execution strategy; PostgreSQL forbids CONCURRENTLY inside a transaction.'
        });
      }

      if (framework === 'drizzle' && concurrently(stmt)) {
        issues.push({
          ruleId: 'PG016',
          message: 'Drizzle node-postgres migrator uses a transaction in the tested version; CONCURRENTLY fails with PostgreSQL 25001.',
          fix: 'Execute the concurrent index through a separately managed non-transactional path; do not use the standard transactional migrator.'
        });
      }

      const target = ddlTarget(stmt);

      if (
        target &&
        seen.has(target) &&
        (
          stmt.RenameStmt ||
          stmt.DropStmt?.removeType === 'OBJECT_TABLE'
        )
      ) {
        const previous = seen.get(target);

        if (previous.file !== file) {
          issues.push({
            ruleId: 'PG017',
            message: `Potential cross-file dependency: ${target} was modified earlier in ${previous.file}.`,
            fix: 'Review migration order and deployed application compatibility; this is a heuristic, not proof of a conflict.'
          });
        }
      }

      if (target) {
        seen.set(target, { file });
      }

      for (const issue of issues) {

        const isAdvisory = ADVISORY_RULES.has(issue.ruleId);

        const defaultSeverity = isAdvisory
          ? 'warning'
          : 'error';

        const severity =
          config.rules?.[issue.ruleId] ??
          (isAdvisory
            ? 'warning'
            : (config.severity ?? defaultSeverity));


        if (severity === 'off') continue;

        findings.push({
          ...issue,
          severity,
          file,
          line: loc.line,
          column: loc.column,
          framework,
          lock: lockFor(stmt),
          ...(options.advisor
            ? { advisor: advise(issue, framework) }
            : {})
        });
      }

      if (transaction === 'end') {
        inTransaction = false;
      }
    }
  }

  return findings;
}
