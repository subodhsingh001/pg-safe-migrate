
import { getVersionCompatibility } from './versionCatalog.js';

/**
 * Static PostgreSQL feature compatibility checks.
 * These rules analyze SQL syntax without executing SQL.
 */

// Support both camelCase and snake_case AST properties.
const hasNullsNotDistinct = (node) =>
  node?.nullsNotDistinct === true ||
  node?.nulls_not_distinct === true;

// Support PostgreSQL AST enum representations.
const isUniqueConstraint = (constraint) =>
  constraint?.contype === 'CONSTR_UNIQUE';

export const versionRules = {
  id: 'PG019',
  name: 'postgres-version-compatibility',

  check(stmt, context = {}) {
    const version = context.postgresVersion;

    if (version == null) {
      return [];
    }

    const major = Number(version);

    if (!Number.isInteger(major) || major < 10 || major > 99) {
      return [];
    }

    const issues = [];

    // PG019: MERGE requires PostgreSQL 15+
    if (
      stmt.MergeStmt &&
      !getVersionCompatibility('merge', major).supported
    ) {
      issues.push({
        ruleId: 'PG019',
        message: `MERGE requires PostgreSQL 15 or later; target version is ${major}.`,
        fix: 'Use a version-compatible INSERT ... ON CONFLICT or UPDATE/INSERT strategy, or upgrade PostgreSQL.'
      });
    }

    // PG020: UNIQUE NULLS NOT DISTINCT requires PostgreSQL 15+

    // CREATE UNIQUE INDEX
    const uniqueIndex = stmt.IndexStmt;

    const indexUsesNullsNotDistinct =
      uniqueIndex?.unique === true &&
      hasNullsNotDistinct(uniqueIndex);

    // ALTER TABLE ... ADD CONSTRAINT ... UNIQUE NULLS NOT DISTINCT
    const alterTableUsesNullsNotDistinct =
      stmt.AlterTableStmt?.cmds?.some((cmd) => {
        const constraint = cmd.AlterTableCmd?.def?.Constraint;

        return (
          isUniqueConstraint(constraint) &&
          hasNullsNotDistinct(constraint)
        );
      }) ?? false;

    // CREATE TABLE (... UNIQUE NULLS NOT DISTINCT ...)
    const createTableUsesNullsNotDistinct =
      stmt.CreateStmt?.tableElts?.some((element) => {
        const constraint = element.Constraint;

        return (
          isUniqueConstraint(constraint) &&
          hasNullsNotDistinct(constraint)
        );
      }) ?? false;

    const usesNullsNotDistinct =
      indexUsesNullsNotDistinct ||
      alterTableUsesNullsNotDistinct ||
      createTableUsesNullsNotDistinct;

    if (
      usesNullsNotDistinct &&
      !getVersionCompatibility('nullsNotDistinct', major).supported
    ) {
      issues.push({
        ruleId: 'PG020',
        message: `UNIQUE NULLS NOT DISTINCT requires PostgreSQL 15 or later; target version is ${major}.`,
        fix: 'Use a PostgreSQL 14-compatible uniqueness strategy after reviewing NULL semantics, or upgrade PostgreSQL.'
      });
    }

    return issues;
  }
};
