/** Version-specific SQL compatibility checks. These are static checks, not execution guarantees. */
export const versionRules = {
  id: 'PG019',
  name: 'postgres-version-compatibility',
  check(stmt, context = {}) {
    const version = context.postgresVersion;
    if (version == null) return [];
    const major = Number(version);
    if (!Number.isInteger(major) || major < 10) return [];
    const issues = [];
    if (stmt.MergeStmt && major < 15) {
      issues.push({
        ruleId: 'PG019',
        message: `MERGE requires PostgreSQL 15 or later; target version is ${major}.`,
        fix: 'Use a version-compatible INSERT ... ON CONFLICT or UPDATE/INSERT strategy, or upgrade PostgreSQL.'
      });
    }
    return issues;
  }
};
