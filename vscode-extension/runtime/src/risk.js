// A bounded, explainable heuristic; not a prediction of outage duration.
const weights = { error: 20, warning: 5 };
const lockWeights = { 'ACCESS EXCLUSIVE': 15, 'EXCLUSIVE': 12, 'SHARE ROW EXCLUSIVE': 10, 'SHARE': 8, 'SHARE UPDATE EXCLUSIVE': 4, 'ROW EXCLUSIVE': 2 };
const destructiveRules = new Set(['PG001', 'PG002', 'PG003', 'PG023', 'PG024']);
const clamp = n => Math.max(0, Math.min(100, n));

export function summarizeRisk(findings = [], context = {}) {
  const operations = Array.isArray(context.operations) ? context.operations : [];
  const severityPoints = findings.reduce((sum, f) => sum + (weights[f.severity] || 0), 0);
  // Only count distinct rule/location combinations to avoid inflated scores.
  const destructive = new Set(findings.filter(f => destructiveRules.has(f.ruleId)).map(f => `${f.file || ''}:${f.line || 0}:${f.ruleId}`));
  const destructivePoints = Math.min(20, destructive.size * 5);
  // Maximum lock impact, rather than summing every statement in a large migration.
  const lockPoints = operations.reduce((max, operation) => Math.max(max, lockWeights[operation?.lock?.mode] || 0), 0);
  const unknownLocks = operations.some(operation => !operation?.lock?.mode || operation.lock.mode === 'unknown');
  const transactionPoints = context.transactionRisk === true ? 10 : 0;
  // Optional metadata is advisory only: never infer table size from SQL text.
  const stats = context.tableStats;
  const tableSizePoints = stats && Number.isFinite(stats.estimatedRows) && stats.estimatedRows >= 1000000 ? 10 : 0;
  const score = clamp(severityPoints + destructivePoints + lockPoints + transactionPoints + tableSizePoints);
  return {
    score, band: score >= 60 ? 'high' : score >= 20 ? 'moderate' : 'low',
    confidence: 'low',
    basis: 'Bounded heuristic based on lint severity, destructive operations, strongest classified table lock, optional transaction flag and supplied table statistics. Not a prediction of downtime.',
    breakdown: { severity: clamp(severityPoints), destructive: destructivePoints, lock: lockPoints, transaction: transactionPoints, tableSize: tableSizePoints },
    unknownLocks,
    limitations: ['No production workload or lock wait measurements', 'Table statistics are optional estimates', 'Lock classifications may be conservative']
  };
}
