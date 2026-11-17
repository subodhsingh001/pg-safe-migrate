export function migrationPlan(finding) {
  const plans = {
    PG001: ['Add a replacement column.', 'Backfill in small batches.', 'Deploy application dual-read/dual-write or compatibility logic.', 'Switch reads and writes.', 'Remove the old column in a later release.'],
    PG013: ['Add an equivalent NOT VALID CHECK constraint.', 'Validate the constraint in a separate deployment.', 'Apply SET NOT NULL only after validating compatibility and lock behavior.'],
    PG015: ['Create the table or column in an earlier migration.', 'Create the concurrent index in a standalone migration.', 'Verify runner transaction behavior on disposable PostgreSQL.'],
    PG016: ['Apply ordinary schema changes with Drizzle migrator.', 'Run CREATE INDEX CONCURRENTLY separately outside a transaction.', 'Record the operation in deployment runbooks and verify the index.']
  };
  return { ruleId: finding.ruleId, steps: plans[finding.ruleId] || ['Review lock impact.', 'Test on a disposable copy.', 'Plan rollback and application compatibility.'], automated: false, reviewRequired: true };
}
