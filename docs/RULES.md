# Rule reference (development branch)

23 catalog identifiers, including legacy PG013; PG009 and PG018 are unused. PG013 is suppressed when PG025 is emitted. PG019 and PG020 require a target version below 15; PG014 targets PostgreSQL 10. Defaults below describe CLI reporting, not raw engine metadata. Catalog `defaultSeverity` preserves raw rule metadata; `defaultCliSeverity` describes default CLI reporting. PG024 and PG025 are raw warnings but CLI errors by default.

| ID | Diagnostic | Default | Guidance |
|---|---|---|---|
| PG001 | Non-concurrent index creation | error | Use CREATE INDEX CONCURRENTLY outside a transaction. |
| PG002 | Dropping a column | error | Deprecate consumers before removing the column. |
| PG003 | Changing a column type | error | Check binary compatibility; consider expand/backfill/contract. |
| PG004 | Adding NOT NULL column without default | error | Add nullable, backfill, then enforce NOT NULL. |
| PG005 | Adding validated foreign key | error | Add NOT VALID then VALIDATE CONSTRAINT separately. |
| PG006 | Renaming an object | error | Use an expand/contract deployment. |
| PG007 | Dropping index without CONCURRENTLY | error | Use DROP INDEX CONCURRENTLY where supported. |
| PG008 | Concurrent index operation inside transaction | error | Run outside BEGIN/COMMIT. |
| PG010 | Adding UNIQUE constraint | error | Consider a concurrent unique index and attach it where applicable. |
| PG011 | Dropping a table | error | Verify retention and application dependencies. |
| PG012 | Adding validated CHECK constraint | error | Add NOT VALID and validate separately. |
| PG013 | Legacy SET NOT NULL diagnostic (superseded by PG025) | error | Validate an equivalent CHECK constraint first. |
| PG014 | Adding column with default on PostgreSQL 10 | error | Use controlled backfill or evaluate upgrading PostgreSQL. |
| PG015 | Prisma concurrent index migration | warning | Use a separately managed nontransactional migration. |
| PG016 | Drizzle concurrent index migration | warning | Use a separately managed nontransactional migration. |
| PG017 | Potential cross-file dependency or Flyway transaction advisory | warning | Review migration order; this is a heuristic. |
| PG019 | MERGE requires PostgreSQL 15+ | error | Use a compatible INSERT ... ON CONFLICT pattern where applicable. |
| PG020 | UNIQUE NULLS NOT DISTINCT requires PostgreSQL 15+ | error | Use a version-compatible uniqueness strategy. |
| PG021 | Volatile default may rewrite table | error | Add column, backfill in batches, then set default. |
| PG022 | SET LOGGED rewrites table | error | Schedule controlled maintenance and evaluate alternatives. |
| PG023 | TRUNCATE removes table rows | error | Confirm retention, backups and downstream dependencies. |
| PG024 | Dropping a constraint | error | Review dependent queries and data-integrity requirements. |
| PG025 | SET NOT NULL may scan table | error | Backfill and validate a CHECK constraint first where appropriate. |

PG017 also covers Flyway nontransactional execution advice. Rules are configurable using `rules` with `off`, `warning`, or `error`. Static findings are not a downtime guarantee.
