import { getVersionCompatibility } from './versionCatalog.js';

/** Static PostgreSQL feature compatibility checks; they do not execute SQL. */
export const versionRules = {
  id: 'PG019',
  name: 'postgres-version-compatibility',
  check(stmt, context = {}) {
    const version = context.postgresVersion;
    if (version == null) return [];
    const major = Number(version);
    if (!Number.isInteger(major) || major < 10 || major > 99) return [];

    const issues = [];
    if (stmt.MergeStmt && !getVersionCompatibility('merge', major).supported) {
      issues.push({
        ruleId: 'PG019',
        message: `MERGE requires PostgreSQL 15 or later; target version is ${major}.`,
        fix: 'Use a version-compatible INSERT ... ON CONFLICT or UPDATE/INSERT strategy, or upgrade PostgreSQL.'
      });
    }

    // libpg-query versions may use snake_case or camelCase AST fields.
    const hasNullsNotDistinct = (node) =>
      node?.nullsNotDistinct === true || node?.nulls_not_distinct === true;
    const isUnique = (node) => node?.contype === 'CONSTR_UNIQUE';

    const uniqueIndex = stmt.IndexStmt;
    const uniqueConstraint = stmt.AlterTableStmt?.cmds?.some(cmd => {
      const constraint = cmd.AlterTableCmd?.def?.Constraint;
      return isUnique(constraint) && hasNullsNotDistinct(constraint);
    }) ?? false;
    const createTableConstraint = stmt.CreateStmt?.tableElts?.some(el => {
      const constraint = el.Constraint;
      return isUnique(constraint) && hasNullsNotDistinct(constraint);
    }) ?? false;
    const usesNullsNotDistinct =
      (uniqueIndex?.unique === true && hasNullsNotDistinct(uniqueIndex)) ||
      uniqueConstraint || createTableConstraint;

    if (usesNullsNotDistinct && !getVersionCompatibility('nullsNotDistinct', major).supported) {
      issues.push({
        ruleId: 'PG020',
        message: `UNIQUE NULLS NOT DISTINCT requires PostgreSQL 15 or later; target version is ${major}.`,
        fix: 'Use a PostgreSQL 14-compatible uniqueness strategy after reviewing NULL semantics, or upgrade PostgreSQL.'
      });
    }
    return issues;
  }
};
