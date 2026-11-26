// Explicit operator-reviewed context; never accept arbitrary SQL fragments.
const types = new Set(['text','integer','bigint','smallint','boolean','uuid','date','timestamp','timestamptz','numeric','real','double precision','bytea']);
export function reviewedType(value) {
 if(types.has(value)) return value;
 if(typeof value !== 'string') return null;
 const v=/^varchar\(([1-9][0-9]{0,7})\)$/.exec(value);
 if(v && Number(v[1])<=10485760) return value;
 const n=/^numeric\(([1-9][0-9]{0,3}),([0-9]{1,4})\)$/.exec(value);
 if(n && Number(n[1])<=1000 && Number(n[2])<=Number(n[1])) return value;
 return null;
}
function targetType(t) {
 if(!t || t.arrayBounds?.length || t.setof || t.pct_type) return null;
 const names=t.names?.map(n=>n.String?.sval);
 if(names?.length!==2 || names[0]!=='pg_catalog') return null;
 const base=({int2:'smallint',int4:'integer',int8:'bigint',varchar:'varchar',numeric:'numeric',text:'text'})[names[1]];
 if(!base) return null;
 const mods=t.typmods??[];
 if(!mods.length) return reviewedType(base);
 const values=mods.map(m=>m.A_Const?.ival?.ival);
 if(values.some(v=>!Number.isInteger(v))) return null;
 return reviewedType(`${base}(${values.join(',')})`);
}
export function identifier(s) {
 if(typeof s !== 'string' || !s || Buffer.byteLength(s)>63 || /[\x00-\x1f\x7f]/.test(s)) throw new Error('Invalid PostgreSQL identifier');
 return '"'+s.replaceAll('"','""')+'"';
}
export function validateContext(input) {
 if(!input || input.schemaVersion!==1 || !Array.isArray(input.tables) || input.tables.length>500) throw new Error('Expected schemaVersion 1 and tables array');
 const map=new Map();
 for(const t of input.tables) {
  identifier(t.schema); identifier(t.table);
  const key=JSON.stringify([t.schema,t.table]);
  if(map.has(key)||!Array.isArray(t.columns)||t.columns.length>1600) throw new Error('Invalid or duplicate table context');
  const columns=new Map();
  for(const c of t.columns) {
   identifier(c.name);
   if(columns.has(c.name)||!reviewedType(c.type)) throw new Error('Duplicate column or unsupported context type');
   columns.set(c.name,c.type);
  }
  if(t.notNullCheckName!==undefined) identifier(t.notNullCheckName);
  if(t.shadowColumn!==undefined) identifier(t.shadowColumn);
  map.set(key,{columns,notNullCheckName:t.notNullCheckName,shadowColumn:t.shadowColumn});
 }
 return map;
}
export function applyContext(plan, statements, input) {
 if(input===undefined) return plan;
 const map=validateContext(input);
 for(const op of plan.operations) {
  const stmt=statements[op.statement-1].stmt;
  const r=stmt.RenameStmt?.relation ?? stmt.AlterTableStmt?.relation;
  const ctx=r && map.get(JSON.stringify([r.schemaname,r.relname]));
  if(!ctx) continue;
  const table=[r.schemaname,r.relname].map(identifier).join('.');
  if(op.kind==='rename-column') {
   const {subname,newname}=stmt.RenameStmt;
   const type=ctx.columns.get(subname);
   if(!type || ctx.columns.has(newname)) continue;
   op.steps[0].sql=`ALTER TABLE ${table} ADD COLUMN ${identifier(newname)} ${type};`;
   op.steps[0].instruction+=' Template uses the supplied type only; verify live schema, collation, defaults and dependencies.';
  }
  if(op.kind==='alter-column-type') {
   const c=stmt.AlterTableStmt.cmds[0].AlterTableCmd;
   const source=ctx.columns.get(c.name), target=targetType(c.def?.ColumnDef?.typeName);
   const shadow=ctx.shadowColumn;
   const widening=(source==='smallint' && ['integer','bigint'].includes(target)) || (source==='integer' && target==='bigint');
   if(!widening || !shadow || ctx.columns.has(shadow) || c.def?.ColumnDef?.raw_default) {
    op.steps[0].instruction+=' No SQL template: conversion or shadow column requires manual review.';
   } else {
    op.steps[0].sql=`ALTER TABLE ${table} ADD COLUMN ${identifier(shadow)} ${target};`;
    op.steps[0].instruction+=' Review live types, defaults, foreign keys, indexes, triggers and application dependencies. No cast or data update is generated.';
   }
  }
  if(op.kind==='set-not-null') {
   const name=stmt.AlterTableStmt.cmds[0].AlterTableCmd.name;
   if(!ctx.columns.has(name)||!ctx.notNullCheckName) continue;
   const col=identifier(name), check=identifier(ctx.notNullCheckName);
   const pos=op.steps.findIndex(s=>s.phase==='constraint');
   op.steps.splice(pos,1,{phase:'constraint',instruction:'Verify constraint name is unused. Review and commit separately; NOT VALID still checks new writes.',sql:`ALTER TABLE ${table} ADD CONSTRAINT ${check} CHECK (${col} IS NOT NULL) NOT VALID;`},{phase:'validate-constraint',instruction:'Validate separately after backfill; review locks and concurrent workload.',sql:`ALTER TABLE ${table} VALIDATE CONSTRAINT ${check};`});
  }
 }
 plan.limitations.push('Schema context is operator supplied and not verified against a live database. Templates are not executable migration bundles.');
 return plan;
}
