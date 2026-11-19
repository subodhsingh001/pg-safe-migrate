// Conservative PostgreSQL table-lock inventory. These are planning hints, not
// predictions of wait time, lock duration, or production downtime.
function assessment(mode, impact, note, confidence = 'heuristic') {
  return { mode, confidence, impact, note };
}

export function lockFor(stmt) {
  if (stmt.TruncateStmt) return assessment('ACCESS EXCLUSIVE', 'reads-and-writes', 'TRUNCATE acquires ACCESS EXCLUSIVE on affected tables and can block readers and writers.', 'documented');
  if (stmt.AlterTableStmt) return assessment('ACCESS EXCLUSIVE', 'reads-and-writes', 'ALTER TABLE generally acquires ACCESS EXCLUSIVE; some subcommands use weaker locks. Check the specific operation.');
  if (stmt.DropStmt?.removeType === 'OBJECT_TABLE') return assessment('ACCESS EXCLUSIVE', 'reads-and-writes', 'DROP TABLE requires ACCESS EXCLUSIVE on the target table.', 'documented');
  if (stmt.RenameStmt) return assessment('ACCESS EXCLUSIVE', 'reads-and-writes', 'Rename operations can require strong locks; verify the specific object and operation.');
  if (stmt.IndexStmt) return stmt.IndexStmt.concurrent
    ? assessment('SHARE UPDATE EXCLUSIVE', 'ddl-and-maintenance', 'CREATE INDEX CONCURRENTLY permits ordinary writes but can wait for transactions and conflicts with some maintenance.', 'documented')
    : assessment('SHARE', 'writes', 'CREATE INDEX without CONCURRENTLY can block writes while the index is built.', 'documented');
  if (stmt.VacuumStmt) return assessment('SHARE UPDATE EXCLUSIVE', 'ddl-and-maintenance', 'Ordinary VACUUM uses SHARE UPDATE EXCLUSIVE; VACUUM FULL uses ACCESS EXCLUSIVE. Verify the options.');
  if (stmt.UpdateStmt || stmt.DeleteStmt || stmt.InsertStmt) return assessment('ROW EXCLUSIVE', 'conflicting-writers-and-ddl', 'DML acquires ROW EXCLUSIVE table locks; row-level contention and execution time are not assessed.', 'documented');
  return assessment('unknown', 'unknown', 'Lock mode not classified; do not assume this operation is lock-free.', 'unknown');
}
