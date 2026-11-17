// Conservative, statement-type classification. Does not model lock duration or contention.
export function lockFor(stmt) {
  if (stmt.AlterTableStmt || stmt.DropStmt?.removeType === 'OBJECT_TABLE' || stmt.RenameStmt) return { mode: 'ACCESS EXCLUSIVE', confidence: 'heuristic', note: 'May block readers/writers; exact mode varies by subcommand.' };
  if (stmt.IndexStmt) return stmt.IndexStmt.concurrent
    ? { mode: 'SHARE UPDATE EXCLUSIVE', confidence: 'heuristic', note: 'Concurrent index builds still acquire locks and can wait.' }
    : { mode: 'SHARE', confidence: 'heuristic', note: 'Ordinary index creation can block writes.' };
  return { mode: 'unknown', confidence: 'unknown', note: 'Not classified.' };
}
