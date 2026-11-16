export const dropColumnRule = {
  id: 'PG002', name: 'ban-direct-drop-column',
  check(stmt) {
    if (!stmt.AlterTableStmt) return [];
    const table = stmt.AlterTableStmt.relation?.relname || 'unknown_table';
    return (stmt.AlterTableStmt.cmds || []).filter(w => w.AlterTableCmd?.subtype === 'AT_DropColumn').map(w => ({
      ruleId: 'PG002', severity: 'ERROR',
      message: `Dropping column "${table}.${w.AlterTableCmd.name}" can break older application instances.`,
      fix: 'Stop referencing the column in all deployed application versions before dropping it in a later release.'
    }));
  }
};
