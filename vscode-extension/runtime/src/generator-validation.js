// Read-only catalog checks and stage-specific recovery guidance. No execution.
const literal = s => "'" + s.replaceAll("'", "''") + "'";
const ident = s => { if(typeof s !== 'string'||!s||Buffer.byteLength(s)>63||s.includes(String.fromCharCode(92))||/[\x00-\x1f\x7f]/.test(s)) throw new Error('Invalid validation identifier'); return s; };
const check = (phase, expectation, sql) => ({phase, expectation, sql});
export function addValidation(plan, statements, context) {
 const tables = new Map((context?.tables ?? []).map(t=>[JSON.stringify([t.schema,t.table]),t]));
 for(const op of plan.operations) {
  const stmt=statements[op.statement-1].stmt;
  const r=stmt.RenameStmt?.relation??stmt.AlterTableStmt?.relation??stmt.IndexStmt?.relation;
  const checks=[];
  const recovery=[{stage:'before-change',action:'Review backup restoration, application compatibility and lock budget before proceeding.'}];
  const manual=['Confirm all writers, privileges, row-level security, triggers and workload assumptions.','Review query results manually; no readiness decision is inferred.'];
  if(r?.schemaname && r.relname && op.kind!=='unsupported') {
   const schema=literal(ident(r.schemaname)), name=literal(ident(r.relname));
   const rel=`n.nspname = ${schema} AND c.relname = ${name}`;
   const from='pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace';
   checks.push(check('preflight','Exactly one ordinary table; review inheritance, partitioning and RLS separately.',`SELECT c.relkind, c.relrowsecurity, c.relispartition FROM ${from} WHERE ${rel};`));
   checks.push(check('preflight','Review column types, defaults and nullability against supplied context.',`SELECT a.attname, pg_catalog.format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull, pg_catalog.pg_get_expr(d.adbin,d.adrelid) AS default_expr FROM ${from} JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE ${rel} AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum;`));
   checks.push(check('preflight','Review direct catalog dependencies; this is not a complete application dependency graph.',`SELECT pg_catalog.pg_describe_object(d.classid,d.objid,d.objsubid) AS dependent, d.refobjsubid, d.deptype FROM ${from} JOIN pg_catalog.pg_depend d ON d.refclassid='pg_catalog.pg_class'::pg_catalog.regclass AND d.refobjid=c.oid WHERE ${rel};`));
   const ctx=tables.get(JSON.stringify([r.schemaname,r.relname]));
   if(op.kind==='rename-column'||op.kind==='alter-column-type') {
    const v=op.steps.find(s=>s.phase==='validate');
    if(v?.sql) checks.push(check('post-backfill','Zero mismatches under reconciled writers; snapshot alone is insufficient.',v.sql));
    recovery.push({stage:'after-expand',action:'Keep old column authoritative; stop new backfill workers before changing write strategy.'},{stage:'after-switch',action:'Restore old reads only after verifying old values remain synchronized and compatible.'},{stage:'after-contract',action:'Potentially irreversible; restore from tested backup or separately reviewed recovery migration.'});
   } else if(op.kind==='set-not-null') {
    const v=op.steps.find(s=>s.phase==='validate');
    if(v?.sql) checks.push(check('post-backfill','Zero NULL rows; verify concurrent writers enforce the invariant.',v.sql));
    if(ctx?.notNullCheckName && op.steps.some(s=>s.phase==='validate-constraint'&&s.sql)) checks.push(check('post-constraint','Exactly one expected CHECK with convalidated true; inspect its definition.',`SELECT k.convalidated, pg_catalog.pg_get_constraintdef(k.oid) AS definition FROM ${from} JOIN pg_catalog.pg_constraint k ON k.conrelid=c.oid WHERE ${rel} AND k.contype='c' AND k.conname=${literal(ident(ctx.notNullCheckName))};`));
    recovery.push({stage:'after-backfill',action:'Replacement values are not automatically reversible; recover original values only from reviewed evidence.'},{stage:'after-constraint',action:'Review relaxing the constraint and application assumptions separately; no DROP SQL generated.'});
   } else if(op.kind==='create-index' && op.steps[0].sql) {
    const idx=literal(ident(stmt.IndexStmt.idxname));
    checks.push(check('preflight','No existing relation with proposed index name in target schema.',`SELECT c.relkind FROM ${from} WHERE n.nspname=${schema} AND c.relname=${idx};`));
    checks.push(check('post-index','Exactly one expected index, indisvalid and indisready true; inspect definition.',`SELECT i.indisvalid, i.indisready, pg_catalog.pg_get_indexdef(i.indexrelid) AS definition FROM ${from} JOIN pg_catalog.pg_index i ON i.indrelid=c.oid JOIN pg_catalog.pg_class x ON x.oid=i.indexrelid WHERE ${rel} AND x.relname=${idx};`));
    recovery.push({stage:'after-index-failure',action:'Inspect invalid index state and active builds; separately approve cleanup or retry outside a transaction.'});
   }
  }
  if(op.kind==='unsupported') recovery.push({stage:'manual-review',action:'Unknown reversibility; treat as potentially irreversible until reviewed.'});
  op.validation={status:'not-executed',checks,manual};
  op.recovery=recovery;
 }
 plan.limitations.push('Validation queries are unexecuted; catalog visibility and snapshot consistency depend on the database role and workload. No automatic rollback or readiness approval.');
 return plan;
}
