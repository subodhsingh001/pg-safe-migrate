// Operator-reviewed metadata only. No database connection or execution.
export function validateBackfill(value, columns) {
 if(value===undefined) return null;
 if(!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).some(k=>!['primaryKey','batchSize','stableKey','dualWritesReady'].includes(k))) throw new Error('Invalid backfill context');
 const {primaryKey,batchSize=1000,stableKey,dualWritesReady}=value;
 if(!Array.isArray(primaryKey)||!primaryKey.length||primaryKey.length>8||new Set(primaryKey).size!==primaryKey.length||primaryKey.some(k=>!columns.has(k))) throw new Error('Backfill requires known distinct primary key columns');
 if(!Number.isInteger(batchSize)||batchSize<1||batchSize>10000) throw new Error('Backfill batchSize must be 1..10000');
 if(typeof stableKey!=='boolean'||typeof dualWritesReady!=='boolean') throw new Error('Backfill requires explicit stableKey and dualWritesReady flags');
 return {primaryKey:[...primaryKey],batchSize,stableKey,dualWritesReady};
}
export function addBackfill(op,stmt,ctx,table,quote,targetType) {
 const b=ctx.backfill;
 if(!b||!['rename-column','alter-column-type'].includes(op.kind)||!op.steps[0].sql) return;
 const step=op.steps.find(s=>s.phase==='backfill');
 if(!b.stableKey||!b.dualWritesReady){step.instruction+=' No batch SQL: confirm stable primary key and synchronized writers first.';return;}
 const c=stmt.AlterTableStmt?.cmds[0].AlterTableCmd;
 const source=stmt.RenameStmt?.subname??c?.name;
 const dest=stmt.RenameStmt?.newname??ctx.shadowColumn;
 const type=ctx.columns.get(source);
 // Restrict equality semantics to a small reviewed subset; custom collations still require review.
 if(!['smallint','integer','bigint','uuid','boolean','text'].includes(type)||b.primaryKey.includes(dest)){step.instruction+=' No batch SQL: unsupported equality or destination key.';return;}
 const src=quote(source), dst=quote(dest), keys=b.primaryKey.map(quote);
 const cast=op.kind==='alter-column-type'?`::pg_catalog.${({smallint:'int2',integer:'int4',bigint:'int8'})[targetType(c.def.ColumnDef.typeName)]}`:'';
 const mismatch=(alias)=>`${alias}.${dst} IS DISTINCT FROM ${alias}.${src}${cast}`;
 step.sql=`WITH batch AS (\n  SELECT ${keys.map(k=>`s.${k}`).join(', ')} FROM ${table} AS s\n  WHERE ${mismatch('s')}\n  ORDER BY ${keys.map(k=>`s.${k}`).join(', ')}\n  LIMIT ${b.batchSize} FOR UPDATE OF s SKIP LOCKED\n)\nUPDATE ${table} AS u SET ${dst} = u.${src}${cast}\nFROM batch AS b WHERE ${keys.map(k=>`u.${k} = b.${k}`).join(' AND ')}\n  AND ${mismatch('u')};`;
 step.instruction+=' Review actual primary key uniqueness, immutability, triggers, equality semantics and synchronized writers. Run one batch per short READ COMMITTED transaction; commit, throttle and retry transient failures with bounded backoff. Source is authoritative; do not use after switching authority. Zero updated rows may mean locked rows were skipped. Resume by repeating the mismatch predicate; verify remaining rows independently.';
 const v=op.steps.find(s=>s.phase==='validate');
 v.sql=`SELECT count(*) FROM ${table} AS u WHERE ${mismatch('u')};`;
 v.instruction+=' Count mismatches without SKIP LOCKED; a snapshot count alone does not prove completion. Reconcile writers before switching.';
}
