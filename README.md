# pg-safe-migrate

AST-based PostgreSQL migration **risk** linter for Prisma, Drizzle and SQL folders. Static checks do **not** guarantee zero downtime. PostgreSQL version, table size, locks, transaction boundaries and deployment order matter.

## Usage

```bash
npm install
npm test
node bin/cli.js test/unsafe_migration.sql
node bin/cli.js --changed
node bin/cli.js --changed origin/main
```

`--changed` includes staged, unstaged and untracked SQL files; with a base ref it also includes added/modified/renamed SQL files from the branch diff. Fetch the base ref in CI. When no argument is supplied the CLI scans all recognized migration directories.

## Rules

- PG001: CREATE INDEX without CONCURRENTLY (blocks writes)
- PG002: DROP COLUMN (application compatibility)
- PG003: ALTER COLUMN TYPE (locking/rewrite risk, depending on change)
- PG004: ADD NOT NULL column without DEFAULT (backfill/deployment risk)
- PG005: ADD FOREIGN KEY without NOT VALID (validation lock risk)
- PG006: RENAME (application compatibility)

Exit code 1 indicates issues or an error; 0 means no configured issues detected. Review changes with a DBA before production use. Some safe migration sequences still require lock_timeout, retries, explicit nontransactional execution and coordination across app versions.

## Publishing

Set the repository URL in package.json, then run `npm ci && npm test && npm pack --dry-run`. Confirm the npm package name is available and publish only after reviewing the package contents.
