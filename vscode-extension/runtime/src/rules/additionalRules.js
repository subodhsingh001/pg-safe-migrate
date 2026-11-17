export const additionalRules = {
  id: 'PG007-PG011',
  check(stmt) {
    const issues = [];
    if (stmt.DropStmt?.removeType === 'OBJECT_INDEX' && !stmt.DropStmt.concurrent) issues.push({ ruleId: 'PG007', severity: 'ERROR', message: 'DROP INDEX without CONCURRENTLY can block concurrent operations.', fix: 'Consider DROP INDEX CONCURRENTLY outside a transaction (not supported with CASCADE).' });
    if (stmt.DropStmt?.removeType === 'OBJECT_TABLE') issues.push({ ruleId: 'PG011', severity: 'ERROR', message: 'DROP TABLE is destructive and may break running application versions.', fix: 'Remove application dependencies first and verify data retention requirements.' });
    return issues;
  }
};
