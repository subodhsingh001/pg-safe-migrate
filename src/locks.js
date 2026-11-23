
// PostgreSQL table-lock planning hints.
// These are not predictions of wait time, duration, or downtime.

function assessment(mode, impact, note, confidence = 'heuristic') {
  return { mode, confidence, impact, note };
}

function alterTableLock(alter) {
  const commands = (alter.cmds || [])
    .map(wrapper => wrapper.AlterTableCmd)
    .filter(Boolean);

  // A statement may contain multiple subcommands.
  // Do not classify a mixed statement using only its weakest lock.
  if (commands.length === 0) {
    return assessment(
      'ACCESS EXCLUSIVE',
      'reads-and-writes',
      'ALTER TABLE lock requirements depend on its subcommands.'
    );
  }

  const modes = commands.map(cmd => {
    if (
      cmd.subtype === 'AT_AddConstraint' &&
      cmd.def?.Constraint?.contype === 'CONSTR_FOREIGN'
    ) {
      return 'SHARE ROW EXCLUSIVE';
    }

    if (cmd.subtype === 'AT_ValidateConstraint') {
      return 'SHARE UPDATE EXCLUSIVE';
    }

    return 'ACCESS EXCLUSIVE';
  });

  if (modes.every(mode => mode === 'SHARE ROW EXCLUSIVE')) {
    return assessment(
      'SHARE ROW EXCLUSIVE',
      'writes',
      'ADD FOREIGN KEY acquires SHARE ROW EXCLUSIVE on both referencing and referenced tables. NOT VALID avoids the initial scan but not the lock.',
      'documented'
    );
  }

  if (modes.every(mode => mode === 'SHARE UPDATE EXCLUSIVE')) {
    return assessment(
      'SHARE UPDATE EXCLUSIVE',
      'ddl-and-maintenance',
      'VALIDATE CONSTRAINT generally uses SHARE UPDATE EXCLUSIVE on the altered table. Foreign-key validation can also lock the referenced table.',
      'documented'
    );
  }

  return assessment(
    'ACCESS EXCLUSIVE',
    'reads-and-writes',
    'ALTER TABLE contains a subcommand requiring ACCESS EXCLUSIVE, or a subcommand whose lock has not been specifically classified.'
  );
}

export function lockFor(stmt) {
  if (stmt.TruncateStmt) {
    return assessment(
      'ACCESS EXCLUSIVE',
      'reads-and-writes',
      'TRUNCATE acquires ACCESS EXCLUSIVE on affected tables and can block readers and writers.',
      'documented'
    );
  }

  if (stmt.AlterTableStmt) {
    return alterTableLock(stmt.AlterTableStmt);
  }

  if (stmt.DropStmt?.removeType === 'OBJECT_TABLE') {
    return assessment(
      'ACCESS EXCLUSIVE',
      'reads-and-writes',
      'DROP TABLE requires ACCESS EXCLUSIVE on the target table.',
      'documented'
    );
  }

  if (stmt.RenameStmt) {
    return assessment(
      'ACCESS EXCLUSIVE',
      'reads-and-writes',
      'Rename operations can require strong locks; verify the specific object and operation.'
    );
  }

  if (stmt.IndexStmt) {
    return stmt.IndexStmt.concurrent
      ? assessment(
          'SHARE UPDATE EXCLUSIVE',
          'ddl-and-maintenance',
          'CREATE INDEX CONCURRENTLY permits ordinary writes but can wait for transactions and conflict with some maintenance.',
          'documented'
        )
      : assessment(
          'SHARE',
          'writes',
          'CREATE INDEX without CONCURRENTLY can block writes while the index is built.',
          'documented'
        );
  }

  if (stmt.VacuumStmt) {
    return assessment(
      'SHARE UPDATE EXCLUSIVE',
      'ddl-and-maintenance',
      'Ordinary VACUUM uses SHARE UPDATE EXCLUSIVE; VACUUM FULL uses ACCESS EXCLUSIVE. Verify the options.'
    );
  }

  if (stmt.UpdateStmt || stmt.DeleteStmt || stmt.InsertStmt) {
    return assessment(
      'ROW EXCLUSIVE',
      'conflicting-writers-and-ddl',
      'DML acquires ROW EXCLUSIVE table locks; row-level contention and execution time are not assessed.',
      'documented'
    );
  }

  return assessment(
    'unknown',
    'unknown',
    'Lock mode not classified; do not assume this operation is lock-free.',
    'unknown'
  );
}
