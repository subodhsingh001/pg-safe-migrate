export const concurrentIndexRule = {
  id: 'PG001',
  name: 'require-concurrent-index',
  check(stmt) {
    if (!stmt.IndexStmt) return null;

    if (!stmt.IndexStmt.concurrent) {
      const tableName = stmt.IndexStmt.relation?.relname || 'unknown_table';
      return {
        ruleId: this.id,
        severity: 'ERROR',
        message: `CREATE INDEX on "${tableName}" acquires a SHARE lock and blocks writes.`,
        fix: `Use CREATE INDEX CONCURRENTLY and execute outside a transaction block.`
      };
    }
    return null;
  }
};
