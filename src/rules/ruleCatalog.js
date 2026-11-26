/** Public metadata for implemented safety diagnostics. This does not change lint behavior. */
const definitions = [
  ['PG001','Non-concurrent index creation','locking','ERROR',null,'Use CREATE INDEX CONCURRENTLY outside a transaction.'],
  ['PG002','Dropping a column','data-loss','ERROR',null,'Deprecate consumers before removing the column.'],
  ['PG003','Changing a column type','rewrite','ERROR',null,'Check binary compatibility; consider expand/backfill/contract.'],
  ['PG004','Adding NOT NULL column without default','constraint','ERROR',null,'Add nullable, backfill, then enforce NOT NULL.'],
  ['PG005','Adding validated foreign key','locking','ERROR',null,'Add NOT VALID then VALIDATE CONSTRAINT separately.'],
  ['PG006','Renaming an object','compatibility','ERROR',null,'Use an expand/contract deployment.'],
  ['PG007','Dropping index without CONCURRENTLY','locking','ERROR',null,'Use DROP INDEX CONCURRENTLY where supported.'],
  ['PG008','Concurrent index operation inside transaction','compatibility','ERROR',null,'Run outside BEGIN/COMMIT.'],
  ['PG010','Adding UNIQUE constraint','locking','ERROR',null,'Consider a concurrent unique index and attach it where applicable.'],
  ['PG011','Dropping a table','data-loss','ERROR',null,'Verify retention and application dependencies.'],
  ['PG012','Adding validated CHECK constraint','constraint','ERROR',null,'Add NOT VALID and validate separately.'],
  ['PG013','Legacy SET NOT NULL diagnostic (superseded by PG025)','constraint','ERROR',null,'Validate an equivalent CHECK constraint first.'],
  ['PG014','Adding column with default on PostgreSQL 10','rewrite','ERROR',null,'Use controlled backfill or evaluate upgrading PostgreSQL.'],
  ['PG015','Prisma concurrent index migration','integration','WARNING',null,'Use a separately managed nontransactional migration.'],
  ['PG016','Drizzle concurrent index migration','integration','WARNING',null,'Use a separately managed nontransactional migration.'],
  ['PG017','Potential cross-file dependency or Flyway transaction advisory','dependency','WARNING',null,'Review migration order; this is a heuristic.'],
  ['PG019','MERGE requires PostgreSQL 15+','version','ERROR',15,'Use a compatible INSERT ... ON CONFLICT pattern where applicable.'],
  ['PG020','UNIQUE NULLS NOT DISTINCT requires PostgreSQL 15+','version','ERROR',15,'Use a version-compatible uniqueness strategy.'],
  ['PG021','Volatile default may rewrite table','rewrite','ERROR',null,'Add column, backfill in batches, then set default.'],
  ['PG022','SET LOGGED rewrites table','rewrite','ERROR',null,'Schedule controlled maintenance and evaluate alternatives.'],
  ['PG023','TRUNCATE removes table rows','data-loss','ERROR',null,'Confirm retention, backups and downstream dependencies.'],
  ['PG024','Dropping a constraint','constraint','WARNING',null,'Review dependent queries and data-integrity requirements.'],
  ['PG025','SET NOT NULL may scan table','constraint','WARNING',null,'Backfill and validate a CHECK constraint first where appropriate.'],
  ['PG026','Lock timeout scope advisory','locking','WARNING',null,'Verify a positive lock_timeout in the execution session.'],
  ['PG027','Integer primary key capacity','capacity','WARNING',null,'Estimate growth and consider bigint.'],
  ['PG028','Mixed Prisma concurrent index migration','integration','WARNING',null,'Verify standalone nontransactional execution.'],
  ['PG029','Column type semantics advisory','compatibility','WARNING',null,'Review length constraints and time semantics.']
];

export const RULE_CATALOG = Object.freeze(definitions.map(([id,title,category,defaultSeverity,minPostgresVersion,recommendation]) => Object.freeze({id,title,category,defaultSeverity,defaultCliSeverity: ['PG024','PG025'].includes(id) ? 'ERROR' : defaultSeverity,minPostgresVersion,recommendation, ...(['PG026','PG027','PG028','PG029'].includes(id) ? { optIn: true } : {})})));

export function getRule(id) {
  return RULE_CATALOG.find(rule => rule.id === String(id).toUpperCase()) ?? null;
}

export function searchRules(query = '') {
  const needle = String(query).trim().toLowerCase();
  return RULE_CATALOG.filter(rule => Object.values(rule).some(value => value != null && String(value).toLowerCase().includes(needle)));
}
