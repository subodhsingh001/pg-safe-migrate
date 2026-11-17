const plans = {
 PG001:['Confirm the runner is non-transactional.','Create the index CONCURRENTLY.','Monitor and clean up invalid indexes after failure.'],
 PG002:['Deploy code that no longer reads or writes the old column.','Verify all old application instances are retired.','Drop the column in a later deployment.'],
 PG003:['Assess type conversion and rewrite requirements.','Consider a replacement column with batched backfill.','Switch readers and writers before retiring the old column.'],
 PG004:['Add a nullable column first.','Backfill in batches.','Validate before applying NOT NULL.'],
 PG005:['Add the foreign key NOT VALID.','Validate in a separate migration.','Monitor lock duration.'],
 PG006:['Introduce a compatible replacement.','Deploy applications supporting both names.','Remove the old name after a compatibility window.'],
 PG007:['Verify index usage and dependencies.','Use DROP INDEX CONCURRENTLY outside transactions if appropriate.','Confirm the operation is supported without CASCADE.'],
 PG008:['Split transactional and non-transactional migrations.','Run concurrent index DDL outside explicit transactions.','Verify migration runner behavior.'],
 PG010:['Consider CREATE UNIQUE INDEX CONCURRENTLY.','Attach the index to the constraint if supported.','Validate uniqueness and existing duplicates.'],
 PG011:['Check all application dependencies.','Archive required data.','Remove the table only after compatible code is deployed.'],
 PG012:['Consider adding the CHECK constraint NOT VALID.','Validate it separately.','Monitor scan and lock impact.'],
 PG013:['Review PostgreSQL version and proof of existing non-null values.','Consider a validated CHECK constraint strategy.','Apply SET NOT NULL during a controlled deployment.'],
 PG014:['Avoid adding a default in the same step on PostgreSQL 10.','Backfill gradually.','Apply defaults and constraints in later migrations.'],
 PG015:['Check the Prisma migration runner transaction strategy.','Execute CONCURRENTLY outside a transaction.','Verify the deployed migration in staging.'],
 PG016:['Check Drizzle runner transaction wrapping.','Execute CONCURRENTLY outside a transaction.','Verify the deployed migration in staging.'],
 PG017:['Inspect the earlier migration and dependency graph.','Confirm the final schema and deployment order.','Test the ordered migrations on staging.']
};
export function advise(issue,framework='sql') {
 const context = framework==='prisma' ? 'Prisma migration: review migration.sql and the deployment runner.' : framework==='drizzle' ? 'Drizzle migration: review generated SQL and runner transaction behavior.' : 'Raw SQL: verify the execution transaction policy.';
 return {ruleId:issue.ruleId,steps:plans[issue.ruleId] || ['Review SQL dependencies.','Test on staging.','Deploy with lock and statement timeouts.'],note:`${context} Guidance only; not validated against a live database.`};
}
