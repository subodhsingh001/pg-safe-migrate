import { parseSqlFile } from './parser.js';
import { lintStatements } from './engine.js';
import { advise } from './advisor.js';
import { lockFor } from './locks.js';
import { normalizeSuppression } from './config.js';
import { matchSuppressions } from './suppression-matcher.js';

const ADVISORY_RULES = new Set(['PG015', 'PG016', 'PG017']);

export function position(sql, offset = 0) {
  const source = String(sql ?? '');
  const numericOffset = Number(offset);

  const safeOffset = Number.isFinite(numericOffset)
    ? Math.min(
        source.length,
        Math.max(0, Math.floor(numericOffset))
      )
    : 0;

  const prefix = source.slice(0, safeOffset);
  const lastNewline = prefix.lastIndexOf('\n');

  return {
    line: prefix.split('\n').length,
    column: safeOffset - lastNewline
  };
}


function createPositionTracker(sql) {
  const source = String(sql ?? '');

  let cursor = 0;
  let line = 1;
  let lineStart = 0;

  return function locate(offset = 0) {
    const numericOffset = Number(offset);

    const safeOffset = Number.isFinite(numericOffset)
      ? Math.min(
          source.length,
          Math.max(0, Math.floor(numericOffset))
        )
      : 0;

    // Preserve correctness if offsets arrive out of order.
    if (safeOffset < cursor) {
      return position(source, safeOffset);
    }

    while (cursor < safeOffset) {
      if (source.charCodeAt(cursor) === 10) {
        line++;
        lineStart = cursor + 1;
      }

      cursor++;
    }

    return {
      line,
      column: safeOffset - lineStart + 1
    };
  };
}


export function frameworkFor(file) {
  const p = file.replaceAll('\\', '/').toLowerCase();

  if (/(^|\/)prisma\/migrations\//.test(p)) {
    return 'prisma';
  }

  if (/(^|\/)drizzle\//.test(p)) {
    return 'drizzle';
  }

  if (/(^|\/)(?:sql\/)?(?:migrations\/)?(?:v[0-9][a-z0-9_.-]*__[^/]+|r__[^/]+)\.sql$/.test(p) || /(^|\/)db\/migration\/[^/]+\.sql$/.test(p)) {
    return 'flyway';
  }

  return 'sql';
}

function txType(stmt) {
  const kind = stmt.TransactionStmt?.kind;

  if (
    kind === 'TRANS_STMT_BEGIN' ||
    kind === 'TRANS_STMT_START'
  ) {
    return 'begin';
  }

  if ([
    'TRANS_STMT_COMMIT',
    'TRANS_STMT_ROLLBACK',
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

  if (!stmt.AlterTableStmt) {
    return issues;
  }

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

export async function analyzeFiles(
  entries,
  config = {},
  options = {}
) {
  const findings = [];
  const policy = normalizeSuppression(config.suppression);
  const audit = options.suppressionAudit;
  if (policy.enabled && !Array.isArray(audit)) throw new Error('Enabled suppression requires an audit sink');
  const seen = new Map();

  const version = config.postgresVersion ?? null;

  const files = [...entries].sort(
    (a, b) => a.file.localeCompare(b.file)
  );

  for (const { file, sql } of files) {
    const parsed = await parseSqlFile(sql, {
      details: true
    });

    const candidates = new Map();
    if (policy.enabled) {
      const result = await matchSuppressions(sql, parsed);
      if (result.scanError) audit.push({ file, status: 'scan-error', ...result.scanError });
      for (const rejected of result.rejected) audit.push({ file, status: 'rejected', ...rejected });
      for (const match of result.matches) {
        if (match.ruleIds.some(id => policy.protectedRules.includes(id))) {
          audit.push({ file, status: 'rejected', ...match, message: 'Directive includes a protected rule' });
        } else candidates.set(match.statementOffset, { match, used: new Set() });
      }
    }
    const framework = frameworkFor(file);
    const locate = createPositionTracker(sql);

    let inTransaction = false;

    for (const { stmt, offset } of parsed) {
      const loc = locate(offset);
      const transaction = txType(stmt);

      // Track explicit transaction boundaries.
      if (transaction === 'begin') {
        inTransaction = true;
      }

      // Findings generated by the main rule engine.
      const ruleIssues = lintStatements(
        [stmt],
        { postgresVersion: version }
      );

      // Additional compatibility and advisory findings.
      const extraIssues = extras(stmt, version);

      // PG025 provides more specific SET NOT NULL guidance.
      // Keep PG013 when PG025 is not generated.
      const hasPG025 = ruleIssues.some(
        issue => issue.ruleId === 'PG025'
      );

      const issues = [
        ...ruleIssues,
        ...extraIssues.filter(
          issue =>
            !(hasPG025 && issue.ruleId === 'PG013')
        )
      ];

      // Concurrent index operations cannot run inside
      // explicit PostgreSQL transactions.
      if (inTransaction && concurrently(stmt)) {
        issues.push({
          ruleId: 'PG008',
          message:
            'CONCURRENTLY cannot execute inside an explicit transaction block.',
          fix:
            'Run concurrent index operations outside BEGIN/COMMIT.'
        });
      }

      // Prisma-specific migration guidance.
      if (
        framework === 'prisma' &&
        concurrently(stmt)
      ) {
        issues.push({
          ruleId: 'PG015',
          message:
            'Prisma: use a standalone migration for CONCURRENTLY; combined SQL statements can fail in a transaction context.',
          fix:
            'Review the generated migration and execution strategy; PostgreSQL forbids CONCURRENTLY inside a transaction.'
        });
      }

      // Drizzle-specific migration guidance.
      if (
        framework === 'drizzle' &&
        concurrently(stmt)
      ) {
        issues.push({
          ruleId: 'PG016',
          message:
            'Drizzle node-postgres migrator uses a transaction in the tested version; CONCURRENTLY fails with PostgreSQL 25001.',
          fix:
            'Execute the concurrent index through a separately managed non-transactional path; do not use the standard transactional migrator.'
        });
      }

      // Flyway PostgreSQL migrations are normally transactional, unless the
      // deployment configuration opts out. This is advice, not a claim about
      // the actual runner's settings. Avoid inventing a new rule identifier.
      if (framework === 'flyway' && concurrently(stmt)) {
        issues.push({
          ruleId: 'PG017',
          message: 'Flyway: CONCURRENTLY requires non-transactional execution; verify executeInTransaction=false for this migration.',
          fix: 'Configure this migration for non-transactional execution, review mixed statements, and verify Flyway edition/version behavior.'
        });
      }

      const target = ddlTarget(stmt);

      // Detect potential cross-file dependencies.
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
            message:
              `Potential cross-file dependency: ${target} was modified earlier in ${previous.file}.`,
            fix:
              'Review migration order and deployed application compatibility; this is a heuristic, not proof of a conflict.'
          });
        }
      }

      if (target) {
        seen.set(target, { file });
      }

      // Convert rule findings into report findings.
      for (const issue of issues) {
        const isAdvisory = ADVISORY_RULES.has(
          issue.ruleId
        );

        const defaultSeverity = isAdvisory
          ? 'warning'
          : 'error';

        const severity =
          config.rules?.[issue.ruleId] ??
          (
            isAdvisory
              ? 'warning'
              : (config.severity ?? defaultSeverity)
          );

        if (severity === 'off') {
          continue;
        }

        const finding = {
          ...issue,
          severity,
          file,
          line: loc.line,
          column: loc.column,
          framework,
          lock: lockFor(stmt),
          ...(options.advisor
            ? {
                advisor: advise(issue, framework)
              }
            : {})
        };
        const candidate = candidates.get(offset);
        if (candidate?.match.ruleIds.includes(issue.ruleId)) {
          candidate.used.add(issue.ruleId);
          audit.push({ file, status: 'suppressed', directiveLine: candidate.match.line, reason: candidate.match.reason, finding });
        } else findings.push(finding);
      }

      // Close the explicit transaction after processing.
      if (transaction === 'end') {
        inTransaction = Boolean(stmt.TransactionStmt?.chain);
      }
    }
    for (const { match, used } of candidates.values()) {
      for (const ruleId of match.ruleIds) if (!used.has(ruleId)) audit.push({ file, status: 'unused', ruleId, directiveLine: match.line, reason: match.reason });
    }
  }

  return findings;
}
