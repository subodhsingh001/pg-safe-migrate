const plans = {
 PG026:['Review runner session settings.','Set a bounded lock timeout in the effective scope.','Test contention and retry behavior.'],
 PG027:['Estimate lifetime key allocations.','Review sequence and foreign key types.','Consider bigint for high-growth tables.'],
 PG028:['Separate concurrent index operations.','Verify Prisma execution grouping.','Test on staging.'],
 PG029:['Confirm length and time semantics.','Review application validation and conversions.','Avoid unnecessary type rewrites.'],
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
// Illustrative templates only: never execute or apply them automatically.
// Identifiers, constraints and data predicates must be reviewed for each schema.
const alternatives = {
  PG001: {
    title: 'Build the index without blocking ordinary writes',
    sql: '-- Run outside a transaction block; replace identifiers.\nCREATE INDEX CONCURRENTLY idx_orders_customer_id ON orders (customer_id);',
    caveat: 'Concurrent builds can take longer, wait for transactions, and leave an invalid index after failure. Check for an existing index first.'
  },
  PG003: {
    title: 'Use expand/backfill/contract for risky type changes',
    sql: '-- Illustrative only: adapt types, conversion and names.\nALTER TABLE orders ADD COLUMN amount_new numeric;\n-- Backfill in bounded batches, with application dual-write.\n-- Switch reads, validate, then retire the old column in a later release.',
    caveat: 'Column copying, conversion, triggers, application compatibility and constraints require a project-specific plan.'
  },
  PG004: {
    title: 'Introduce required columns in stages',
    sql: '-- Replace table/column/type and choose a real backfill policy.\nALTER TABLE customers ADD COLUMN region text;\n-- Backfill existing rows in bounded batches.\nALTER TABLE customers ADD CONSTRAINT customers_region_nn CHECK (region IS NOT NULL) NOT VALID;\nALTER TABLE customers VALIDATE CONSTRAINT customers_region_nn;\nALTER TABLE customers ALTER COLUMN region SET NOT NULL;',
    caveat: 'Ensure new writes populate the column before validation. Validate PostgreSQL-version behavior and lock requirements.'
  },
  PG005: {
    title: 'Add and validate a foreign key separately',
    sql: '-- Replace identifiers and verify referenced keys.\nALTER TABLE orders ADD CONSTRAINT orders_customer_fk FOREIGN KEY (customer_id) REFERENCES customers(id) NOT VALID;\nALTER TABLE orders VALIDATE CONSTRAINT orders_customer_fk;',
    caveat: 'NOT VALID skips checking existing rows at creation, not enforcement for new rows. Validation still consumes resources and locks.'
  },
  PG010: {
    title: 'Create unique index concurrently before attaching a constraint',
    sql: '-- Check duplicates first; run outside transaction.\nCREATE UNIQUE INDEX CONCURRENTLY users_email_unique_idx ON users (email);\n-- For eligible plain-column indexes only:\nALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE USING INDEX users_email_unique_idx;',
    caveat: 'Existing duplicates cause failure. Index eligibility, NULL semantics and transaction handling must be checked.'
  },
  PG012: {
    title: 'Validate CHECK constraints in a separate step',
    sql: '-- Replace predicate and identifiers.\nALTER TABLE orders ADD CONSTRAINT orders_total_nonnegative CHECK (total >= 0) NOT VALID;\nALTER TABLE orders VALIDATE CONSTRAINT orders_total_nonnegative;',
    caveat: 'New or updated rows are checked immediately; validation of existing rows may fail and consumes resources.'
  },
  PG013: {
    title: 'Prove non-null data before enforcing NOT NULL',
    sql: '-- Replace identifiers. Ensure new writes cannot introduce NULLs.\nALTER TABLE users ADD CONSTRAINT users_email_nn CHECK (email IS NOT NULL) NOT VALID;\nALTER TABLE users VALIDATE CONSTRAINT users_email_nn;\nALTER TABLE users ALTER COLUMN email SET NOT NULL;',
    caveat: 'On supported PostgreSQL versions, a validated CHECK may avoid a full scan for SET NOT NULL; lock requirements remain.'
  },
  PG025: {
    title: 'Validate a non-null invariant first',
    sql: '-- Replace identifiers. Backfill NULLs and prevent new NULLs first.\nALTER TABLE users ADD CONSTRAINT users_email_nn CHECK (email IS NOT NULL) NOT VALID;\nALTER TABLE users VALIDATE CONSTRAINT users_email_nn;\nALTER TABLE users ALTER COLUMN email SET NOT NULL;',
    caveat: 'SET NOT NULL can still require a strong lock. Check version, traffic, existing NULLs and constraint lifecycle.'
  },
  PG023: {
    title: 'Review destructive bulk removal',
    sql: '-- No generally safe automatic rewrite for TRUNCATE.\n-- Consider retention, backup, maintenance window and bounded DELETE batches if appropriate.',
    caveat: 'DELETE is not equivalent to TRUNCATE: triggers, identity sequences, foreign keys, MVCC and performance differ.'
  },
  PG024: {
    title: 'Remove constraint dependencies in a separate deployment',
    sql: '-- Review application and database dependencies first.\n-- Drop the constraint only after a compatible deployment and rollback plan.',
    caveat: 'Dropping constraints can permit invalid data and requires appropriate locks. No universal safe SQL replacement exists.'
  }
};

export function advise(issue,framework='sql') {
 const context = framework==='prisma' ? 'Prisma migration: review migration.sql and the deployment runner.' : framework==='drizzle' ? 'Drizzle migration: review generated SQL and runner transaction behavior.' : framework==='flyway' ? 'Flyway migration: verify executeInTransaction settings, naming conventions and transaction grouping.' : 'Raw SQL: verify the execution transaction policy.';
 return {ruleId:issue.ruleId,steps:plans[issue.ruleId] || ['Review SQL dependencies.','Test on staging.','Deploy with lock and statement timeouts.'],note:`${context} Guidance only; not validated against a live database.`,alternative: alternatives[issue.ruleId] ? {...alternatives[issue.ruleId], automatic: false} : null};
}
