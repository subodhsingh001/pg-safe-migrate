/** Conservative, schema-independent data-loss and constraint checks. */
export const dataIntegrityRules = {
  id: 'PG023-PG025',
  name: 'data-integrity-safeguards',
  check(stmt) {
    const issues = [];
    if (stmt.TruncateStmt) {
      const tables = (stmt.TruncateStmt.relations || [])
        .map(entry => entry.RangeVar?.relname)
        .filter(Boolean);
      issues.push({
        ruleId: 'PG023', severity: 'ERROR',
        message: `TRUNCATE${tables.length ? ` on ${tables.join(', ')}` : ''} removes all rows and takes an ACCESS EXCLUSIVE lock.`,
        fix: 'Require an explicit data-retention approval and backup/recovery plan; use a reviewed, bounded DELETE only when appropriate.'
      });
    }
    const alter = stmt.AlterTableStmt;
    if (!alter) return issues;
    const table = alter.relation?.relname || 'unknown_table';
    for (const wrapper of alter.cmds || []) {
      const cmd = wrapper.AlterTableCmd;
      if (!cmd) continue;
      if (cmd.subtype === 'AT_DropConstraint') {
        issues.push({
          ruleId: 'PG024', severity: 'WARNING',
          message: `Dropping constraint "${cmd.name || 'unknown'}" on "${table}" may remove a data-integrity guarantee or dependent objects.`,
          fix: 'Review constraint dependencies, application validation, and the replacement constraint before dropping it.'
        });
      }
      if (cmd.subtype === 'AT_SetNotNull') {
        issues.push({
          ruleId: 'PG025', severity: 'WARNING',
          message: `Setting column "${cmd.name || 'unknown'}" NOT NULL on "${table}" may scan existing rows and fail if NULL values remain; a validated proving CHECK constraint can avoid the scan on supported versions.`,
          fix: 'Backfill NULLs in batches, validate a CHECK (column IS NOT NULL) constraint, then SET NOT NULL; verify version and lock requirements.'
        });
      }
    }
    return issues;
  }
};
