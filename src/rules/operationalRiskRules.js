/** Conservative AST-based operational risk checks. No database access. */
const VOLATILE_DEFAULT_FUNCTIONS = new Set([
  'random', 'clock_timestamp', 'timeofday', 'nextval',
  'gen_random_uuid', 'uuid_generate_v4'
]);

function functionNames(node, names = new Set()) {
  if (!node || typeof node !== 'object') return names;
  if (Array.isArray(node)) {
    for (const item of node) functionNames(item, names);
    return names;
  }
  const call = node.FuncCall;
  if (call?.funcname) {
    const parts = call.funcname.map(x => x.String?.sval).filter(Boolean);
    if (parts.length) names.add(parts.at(-1).toLowerCase());
  }
  for (const value of Object.values(node)) functionNames(value, names);
  return names;
}

export const operationalRiskRules = {
  id: 'PG021-PG022',
  name: 'operational-lock-and-rewrite-risk',
  check(stmt) {
    const alter = stmt.AlterTableStmt;
    if (!alter) return [];
    const table = alter.relation?.relname || 'unknown_table';
    const issues = [];
    for (const wrapper of alter.cmds || []) {
      const cmd = wrapper.AlterTableCmd;
      if (!cmd) continue;
      if (cmd.subtype === 'AT_AddColumn' && cmd.def?.ColumnDef) {
        const column = cmd.def.ColumnDef;
        const defaults = (column.constraints || []).filter(x => x.Constraint?.contype === 'CONSTR_DEFAULT');
        const functions = new Set();
        for (const def of defaults) functionNames(def.Constraint.raw_expr, functions);
        const matched = [...functions].filter(x => VOLATILE_DEFAULT_FUNCTIONS.has(x));
        if (matched.length) {
          issues.push({
            ruleId: 'PG021', severity: 'ERROR',
            message: `Adding column "${column.colname}" on "${table}" with volatile DEFAULT (${matched.join(', ')}) may rewrite existing rows and hold an ACCESS EXCLUSIVE lock.`,
            fix: 'Add the column without a volatile default, backfill in controlled batches, then set the default for new rows.'
          });
        }
      }
      if (cmd.subtype === 'AT_SetLogged') {
        issues.push({
          ruleId: 'PG022', severity: 'ERROR',
          message: `ALTER TABLE "${table}" SET LOGGED rewrites the table and requires an ACCESS EXCLUSIVE lock.`,
          fix: 'Schedule a maintenance window or use a carefully validated replacement-table and cutover plan.'
        });
      }
    }
    return issues;
  }
};
