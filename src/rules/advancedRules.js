// Opt-in advisories: static evidence only, never a production safety guarantee.
const names = t => (t?.names || []).map(n => n.String?.sval);
function builtin(t, types) {
  const n = names(t);
  return !t?.arrayBounds?.length && (n.length === 1 || (n.length === 2 && n[0] === 'pg_catalog')) && types.includes(n.at(-1));
}
const issue = (ruleId,message,fix) => ({ruleId,severity:'WARNING',message,fix});
function positiveTimeout(arg) {
  const c = arg?.A_Const;
  if (c?.ival) return Number.isInteger(c.ival.ival) && c.ival.ival > 0 && c.ival.ival <= 2147483647;
  const s = c?.sval?.sval;
  if (typeof s !== 'string') return false;
  const m = /^\s*(\d+)\s*(ms|s|min|h|d)?\s*$/.exec(s);
  if (!m) return false;
  const ms = Number(m[1]) * ({ms:1,s:1000,min:60000,h:3600000,d:86400000}[m[2] || 'ms']);
  return ms > 0 && ms <= 2147483647;
}
export function advancedChecks(parsed, framework, rules = {}) {
  const enabled = id => ['warning','error'].includes(rules[id]);
  const result = new Map();
  if (!['PG026','PG027','PG028','PG029'].some(enabled)) return result;
  let session = false, local = null, tx = false, before = false;
  for (const {stmt,offset} of parsed) {
    const out = [];
    const kind = stmt.TransactionStmt?.kind;
    if (['TRANS_STMT_BEGIN','TRANS_STMT_START'].includes(kind) && !tx) { before=session; tx=true; local=null; }
    if (['TRANS_STMT_ROLLBACK_TO','TRANS_STMT_PREPARE'].includes(kind)) { session=false; local=null; before=false; }
    if (['TRANS_STMT_COMMIT','TRANS_STMT_ROLLBACK','TRANS_STMT_PREPARE'].includes(kind)) {
      if (kind === 'TRANS_STMT_ROLLBACK' && tx) session=before;
      tx=Boolean(stmt.TransactionStmt.chain); before=session; local=null;
    }
    const v=stmt.VariableSetStmt;
    if (v && (v.name === 'lock_timeout' || v.kind === 'VAR_RESET_ALL')) {
      const positive=v.kind === 'VAR_SET_VALUE' && v.args?.length === 1 && positiveTimeout(v.args[0]);
      if (v.is_local) { if(tx) local=positive; }
      else { session=positive; local=null; }
    }
    // Dynamic SQL and arbitrary calls can change settings; invalidate evidence.
    if (stmt.DoStmt || stmt.CallStmt || stmt.SelectStmt || stmt.DiscardStmt) { session=false; local=null; before=false; }
    const concurrent=stmt.IndexStmt?.concurrent || (stmt.DropStmt?.removeType==='OBJECT_INDEX' && stmt.DropStmt.concurrent);
    const risky=stmt.AlterTableStmt || stmt.TruncateStmt || stmt.RenameStmt || stmt.IndexStmt || ['OBJECT_TABLE','OBJECT_INDEX'].includes(stmt.DropStmt?.removeType);
    if (enabled('PG026') && risky && !(local ?? session)) out.push(issue('PG026','No positive lock_timeout established in the visible SQL scope. Runner/session settings are unknown.','Set an appropriate lock_timeout in the actual execution session; verify transaction scope and runner behavior.'));
    if (enabled('PG028') && framework==='prisma' && concurrent && parsed.length>1) out.push(issue('PG028','Prisma migration mixes CONCURRENTLY with other SQL statements; execution grouping may cause a transaction error.','Use a standalone concurrent index migration and verify the deployed Prisma runner.'));
    const elements=stmt.CreateStmt?.tableElts || [];
    const columns=elements.flatMap(e=>e.ColumnDef?[e.ColumnDef]:[]);
    const keys=new Set(elements.flatMap(e=>e.Constraint?.contype==='CONSTR_PRIMARY'?(e.Constraint.keys||[]).map(k=>k.String?.sval):[]));
    for (const c of columns) {
      if (enabled('PG027') && builtin(c.typeName,['int2','int4','smallint','integer','int','smallserial','serial','serial2','serial4']) && (keys.has(c.colname)||c.constraints?.some(x=>x.Constraint?.contype==='CONSTR_PRIMARY'))) out.push(issue('PG027',`Integer primary key ${c.colname} has finite capacity; growth and sequence usage are unknown.`,'Estimate lifetime key allocation; consider bigint for high-growth tables.'));
    }
    const changed=(stmt.AlterTableStmt?.cmds||[]).flatMap(x=>['AT_AddColumn','AT_AlterColumnType'].includes(x.AlterTableCmd?.subtype)&&x.AlterTableCmd.def?.ColumnDef?[x.AlterTableCmd.def.ColumnDef]:[]);
    for (const c of [...columns,...changed]) {
      const name=c.colname || 'column';
      if (enabled('PG029') && builtin(c.typeName,['varchar']) && c.typeName.typmods?.length) out.push(issue('PG029',`Bounded VARCHAR on ${name}: review whether the length limit is a business requirement.`,'Use text or unbounded varchar only if a length constraint is unnecessary.'));
      if (enabled('PG029') && builtin(c.typeName,['timestamp'])) out.push(issue('PG029',`Timestamp without time zone on ${name}: verify whether this represents local wall time or an instant.`,'Use timestamptz for instants when appropriate; retain local timestamps for wall-clock semantics.'));
    }
    if(out.length) result.set(offset,out);
  }
  return result;
}
