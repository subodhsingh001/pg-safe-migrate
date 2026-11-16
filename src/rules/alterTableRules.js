export const alterTableRules = {
  id: 'PG003-PG005',
  name: 'safe-alter-table',
  check(stmt) {
    if (!stmt.AlterTableStmt) return [];
    const tableName = stmt.AlterTableStmt.relation?.relname || 'unknown_table';
    const issues = [];

    for (const cmdWrapper of stmt.AlterTableStmt.cmds || []) {
      const cmd = cmdWrapper.AlterTableCmd;
      if (!cmd) continue;

      if (cmd.subtype === 'AT_AlterColumnType') {
        issues.push({
          ruleId: 'PG003',
          severity: 'ERROR',
          message: `Changing column type on "${tableName}" may rewrite the table and requires an ACCESS EXCLUSIVE lock; some type changes avoid a rewrite.`,
          fix: `Create a new column, dual-write in app code, backfill rows, then swap columns.`
        });
      }

      if (cmd.subtype === 'AT_AddColumn' && cmd.def?.ColumnDef) {
        const constraints = cmd.def.ColumnDef.constraints || [];
        const isNotNull = constraints.some((c) => c.Constraint?.contype === 'CONSTR_NOTNULL');
        const hasDefault = constraints.some((c) => c.Constraint?.contype === 'CONSTR_DEFAULT');

        if (isNotNull && !hasDefault) {
          issues.push({
            ruleId: 'PG004',
            severity: 'ERROR',
            message: `Adding NOT NULL column "${cmd.def.ColumnDef.colname}" without DEFAULT can fail on non-empty tables and requires a careful backfill.`,
            fix: `Add column as nullable, backfill values in batches, then add a NOT NULL constraint.`
          });
        }
      }

      if (cmd.subtype === 'AT_AddConstraint' && cmd.def?.Constraint?.contype === 'CONSTR_FOREIGN') {
        if (!cmd.def.Constraint.skip_validation) {
          issues.push({
            ruleId: 'PG005',
            severity: 'ERROR',
            message: `Adding FOREIGN KEY on "${tableName}" without NOT VALID blocks writes while validating existing rows.`,
            fix: `Add "NOT VALID" to the constraint, then run ALTER TABLE ... VALIDATE CONSTRAINT separately.`
          });
        }
      }
    }
    return issues;
  }
};

export const renameRule = {
  id: 'PG006',
  name: 'ban-rename',
  check(stmt) {
    if (!stmt.RenameStmt) return null;
    const target = stmt.RenameStmt.subname || stmt.RenameStmt.relation?.relname || 'object';
    return {
      ruleId: 'PG006',
      severity: 'ERROR',
      message: `Renaming "${target}" can break deployed application instances expecting the old name.`,
      fix: `Add a new column/table, dual-write or sync via trigger, and drop the old one in a later release.`
    };
  }
};
