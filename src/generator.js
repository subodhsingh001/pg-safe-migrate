// Review-only plans. Never execute SQL or infer existing column types.
const quote = s => { if(typeof s !== 'string' || !s || /[\x00-\x1f\x7f]/.test(s)) throw new Error('Unsupported identifier'); return '"'+s.replaceAll('"','""')+'"'; };
const table = r => { if(!r?.schemaname || !r.relname) throw new Error('Use a schema-qualified table'); return [r.schemaname,r.relname].map(quote).join('.'); };
const step = (phase, instruction, sql = null) => ({phase,instruction,sql});
export function planStatements(statements) {
 const operations = statements.map(({stmt},i) => {
  const rename=stmt.RenameStmt, alter=stmt.AlterTableStmt;
  if(rename?.renameType==='OBJECT_COLUMN') {
   const t=table(rename.relation), old=quote(rename.subname), next=quote(rename.newname);
   return {statement:i+1,kind:'rename-column',steps:[
    step('expand',`Inspect the exact type, defaults, constraints and dependencies of ${t}.${old}. Add ${next} as a nullable column with the reviewed type.`),
    step('compatibility','Deploy dual writes; verify all writers, including jobs and integrations.'),
    step('backfill','Backfill using a stable unique key, bounded transactions and retryable batches. Resolve concurrent writes before proceeding.'),
    step('validate','Review mismatches; this query is applicable only after both columns exist and support equality.',`SELECT count(*) FROM ${t} WHERE ${old} IS DISTINCT FROM ${next};`),
    step('switch','Switch reads after validation; retain dual writes during the rollback window.'),
    step('contract','Only after old clients are retired, review dependencies and separately approve removal of the old column. No destructive SQL generated.')],rollback:'Before contract, restore old reads while maintaining synchronized writes. After contract, recovery requires a separately tested restoration plan.'};
  }
  const idx=stmt.IndexStmt;
  if(idx && !idx.concurrent) {
   const simple=idx.idxname && idx.relation?.schemaname && idx.relation?.relname && (!idx.accessMethod || idx.accessMethod==='btree') && !idx.unique && !idx.primary && !idx.isconstraint && !idx.whereClause && !idx.indexIncludingParams?.length && !idx.options?.length && !idx.tableSpace && !idx.excludeOpNames?.length && !idx.if_not_exists && idx.indexParams?.length && idx.indexParams.every(p=>{const e=p.IndexElem;return e?.name && !e.expr && !e.collation?.length && !e.opclass?.length && !e.opclassopts?.length && (!e.ordering || e.ordering==='SORTBY_DEFAULT') && (!e.nulls_ordering || e.nulls_ordering==='SORTBY_NULLS_DEFAULT');});
   const sql=simple?`CREATE INDEX CONCURRENTLY ${quote(idx.idxname)} ON ${table(idx.relation)} (${idx.indexParams.map(p=>quote(p.IndexElem.name)).join(', ')});`:null;
   return {statement:i+1,kind:'create-index',steps:[step('review','Verify table is not partitioned, index name is unused, columns exist, and runner executes outside a transaction. Complex indexes require manual review.',sql)],rollback:'Inspect invalid indexes after failure; review cleanup separately. No destructive SQL generated.'};
  }
  if(alter?.cmds?.length===1) {
   const c=alter.cmds[0].AlterTableCmd;
   if(c?.subtype==='AT_SetNotNull') {
    const t=table(alter.relation), col=quote(c.name);
    return {statement:i+1,kind:'set-not-null',steps:[step('compatibility','Prevent new NULL values in all writers.'),step('backfill','Choose a business-approved replacement for existing NULLs; update in bounded batches.'),step('validate','Check remaining NULL values; a zero count alone is not proof against concurrent writes.',`SELECT count(*) FROM ${t} WHERE ${col} IS NULL;`),step('constraint','Review adding a uniquely named CHECK constraint NOT VALID, then VALIDATE CONSTRAINT separately.'),step('contract','Review SET NOT NULL and lock timeout; PostgreSQL version and validated constraint determine scan avoidance.')],rollback:'Review dropping the new constraint if necessary; backfilled data is not automatically reversible.'};
   }
   if(c?.subtype==='AT_AlterColumnType') {
    const t=table(alter.relation), col=quote(c.name);
    return {statement:i+1,kind:'alter-column-type',steps:[step('expand',`Inspect ${t}.${col}, target type, casts and dependencies. Add a separately named nullable shadow column.`),step('compatibility','Deploy dual writes with explicit conversion and error handling.'),step('backfill','Use bounded batches and a stable unique key; quarantine failed conversions.'),step('validate','Verify converted values, precision, constraints and indexes against application requirements.'),step('switch','Switch reads after validation and retain synchronized old data.'),step('contract','Review dependencies and separately approve removal or renaming of old columns.')],rollback:'Retain old data and compatible writers until rollback is no longer required.'};
   }
  }
  return {statement:i+1,kind:'unsupported',steps:[step('review','No automatic plan for this statement. Review manually; do not omit it from the migration.')],rollback:'Manual review required.'};
 });
 return {schemaVersion:1,status:'review-required',operations,limitations:['No SQL is executed. SQL snippets are review-only.','Plans do not establish production safety, lock duration or rollback correctness.','Review statement dependencies and application deployments together.']};
}
export function renderPlan(plan,format='text') {
 if(format==='json') return JSON.stringify(plan,null,2);
 if(!['text','markdown'].includes(format)) throw new Error('format must be text, markdown or json');
 return ['# Migration plan — review required',...plan.limitations,...plan.operations.flatMap(o=>['',`## Statement ${o.statement}: ${o.kind}`,...o.steps.flatMap(s=>[`${s.phase}: ${s.instruction}`,...(s.sql?['```sql',s.sql,'```']:[])]),`Rollback: ${o.rollback}`,...(o.validation?[`Validation status: ${o.validation.status}`,...o.validation.checks.flatMap(c=>[`${c.phase}: ${c.expectation}`,'```sql',c.sql,'```']),...o.validation.manual,...o.recovery.map(r=>`Recovery (${r.stage}): ${r.action}`)]:[])])].join('\n');
}
