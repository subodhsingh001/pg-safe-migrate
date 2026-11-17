import path from 'node:path';
import { parseSqlFile } from './parser.js';
import { lintStatements } from './engine.js';
import { advise } from './advisor.js';

export function position(sql, offset = 0) {
  const prefix = sql.slice(0, Math.max(0, offset));
  const lines = prefix.split('\n');
  return { line: lines.length, column: lines.at(-1).length + 1 };
}
export function frameworkFor(file) {
  const p = file.replaceAll('\\', '/');
  if (/(^|\/)prisma\/migrations\//.test(p)) return 'prisma';
  if (/(^|\/)drizzle\//.test(p)) return 'drizzle';
  return 'sql';
}
const node = stmt => Object.values(stmt || {})[0] || {};
const relation = stmt => node(stmt)?.relation?.relname || node(stmt)?.relation?.schemaname || null;
const key = stmt => {
  if (stmt.AlterTableStmt) return stmt.AlterTableStmt.relation?.relname;
  if (stmt.RenameStmt) return stmt.RenameStmt.relation?.relname;
  if (stmt.IndexStmt) return stmt.IndexStmt.relation?.relname;
  return null;
};
function txType(stmt) {
  const kind = stmt.TransactionStmt?.kind;
  if (kind === 'TRANS_STMT_BEGIN' || kind === 'TRANS_STMT_START') return 'begin';
  if (['TRANS_STMT_COMMIT', 'TRANS_STMT_ROLLBACK', 'TRANS_STMT_ROLLBACK_TO', 'TRANS_STMT_PREPARE'].includes(kind)) return 'end';
  return null;
}
function concurrently(stmt) { return Boolean(stmt.IndexStmt?.concurrent || (stmt.DropStmt?.removeType === 'OBJECT_INDEX' && stmt.DropStmt.concurrent)); }
function ddlTarget(stmt) {
  if (stmt.AlterTableStmt) return stmt.AlterTableStmt.relation?.relname;
  if (stmt.RenameStmt) return stmt.RenameStmt.relation?.relname;
  if (stmt.DropStmt?.removeType === 'OBJECT_TABLE') return stmt.DropStmt.objects?.[0]?.List?.items?.map(x=>x.String?.sval).join('.');
  return null;
}
function extras(stmt, postgresVersion) {
  const issues=[];
  const add = (ruleId, message, fix) => issues.push({ruleId,message,fix});
  if (stmt.AlterTableStmt) {
    for (const w of stmt.AlterTableStmt.cmds || []) {
      const c=w.AlterTableCmd;
      if (!c) continue;
      if (c.subtype === 'AT_SetNotNull') add('PG013','SET NOT NULL may scan a large table and requires a strong lock.','Validate an equivalent CHECK constraint first where supported; test on your PostgreSQL version.');
      if (c.subtype === 'AT_AddConstraint' && c.def?.Constraint?.contype === 'CONSTR_CHECK' && !c.def.Constraint.skip_validation) add('PG012','Adding a validated CHECK constraint may scan existing rows.','Consider NOT VALID followed by a separately scheduled VALIDATE CONSTRAINT.');
      if (c.subtype === 'AT_AddConstraint' && c.def?.Constraint?.contype === 'CONSTR_UNIQUE') add('PG010','Adding a UNIQUE constraint can require a blocking index build.','Consider CREATE UNIQUE INDEX CONCURRENTLY then attach the index using a constraint, where applicable.');
      if (c.subtype === 'AT_AddColumn' && postgresVersion != null && postgresVersion < 11) {
        const def=c.def?.ColumnDef;
        if (def?.constraints?.some(x=>x.Constraint?.contype==='CONSTR_DEFAULT')) add('PG014','On PostgreSQL 10, adding a column with a default may rewrite the table.','Use a nullable column and controlled backfill, or evaluate upgrading PostgreSQL.');
      }
    }
  }
  return issues;
}
export async function analyzeFiles(entries, config = {}, options = {}) {
  const findings=[];
  const seen=new Map();
  const version=config.postgresVersion ?? null;
  const files = [...entries].sort((a,b)=>a.file.localeCompare(b.file));
  for (const {file,sql} of files) {
    // Parse once, preserving parser statement byte/character offsets when supplied.
    const parsed=await parseSqlFile(sql, { details:true });
    let inTransaction=false;
    const framework=frameworkFor(file);
    for (const {stmt, offset} of parsed) {
      const loc=position(sql,offset);
      const transaction=txType(stmt);
      if (transaction==='begin') inTransaction=true;
      const issues=[...lintStatements([stmt]),...extras(stmt,version)];
      if (inTransaction && concurrently(stmt)) issues.push({ruleId:'PG008',message:'CONCURRENTLY cannot execute inside an explicit transaction block.',fix:'Run concurrent index operations outside BEGIN/COMMIT.'});
      if (framework==='prisma' && concurrently(stmt)) issues.push({ruleId:'PG015',message:'Verify that the Prisma migration execution path does not wrap CONCURRENTLY in a transaction.',fix:'Review the generated migration and execution strategy; PostgreSQL forbids CONCURRENTLY inside a transaction.'});
      if (framework==='drizzle' && concurrently(stmt)) issues.push({ruleId:'PG016',message:'Verify the Drizzle migration runner transaction behavior for CONCURRENTLY.',fix:'Use a non-transactional execution path for concurrent index operations.'});
      const target=ddlTarget(stmt);
      if (target && seen.has(target) && (stmt.RenameStmt || stmt.DropStmt?.removeType==='OBJECT_TABLE')) {
        const prev=seen.get(target);
        if (prev.file!==file) issues.push({ruleId:'PG017',message:`Potential cross-file dependency: ${target} was modified earlier in ${prev.file}.`,fix:'Review migration order and deployed application compatibility; this is a heuristic, not proof of a conflict.'});
      }
      if (target) seen.set(target,{file});
      for (const issue of issues) {
        const severity=config.rules?.[issue.ruleId] ?? config.severity ?? 'error';
        if (severity==='off') continue;
        findings.push({...issue,severity,file,line:loc.line,column:loc.column,framework, ...(options.advisor?{advisor:advise(issue,framework)}:{})});
      }
      if (transaction==='end') inTransaction=false;
    }
  }
  return findings;
}
