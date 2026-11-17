# pg-safe-migrate

An AST-based PostgreSQL migration **risk** linter for Prisma, Drizzle, and raw SQL. It flags six common migration patterns that may cause blocking locks or application compatibility failures. **It does not guarantee zero downtime.**

## Demo

Catch risky PostgreSQL migrations before deployment.

![pg-safe-migrate CLI demo](assets/pg-safe-migrate-demo.gif)

### Install

```bash
npm install -D @subodh001/pg-safe-migrate
```

### Run

```bash
npx pg-safe-migrate
```

## Quick start

```sh
npx --yes --package=@subodh001/pg-safe-migrate@1.1.1 pg-safe-migrate --help
npm install --save-dev @subodh001/pg-safe-migrate
npx pg-safe-migrate prisma/migrations
npx pg-safe-migrate drizzle
npx pg-safe-migrate db/migrations
npx pg-safe-migrate --changed origin/main
```

The default scan searches `prisma/migrations`, `drizzle`, `migrations`, and `db/migrations`. For any other directory, provide its path. `--changed` without a base checks staged, unstaged and untracked SQL; with a base, it additionally checks branch changes. For pull requests, fetch the base branch first (`fetch-depth: 0` in GitHub Actions).

## Rules

| Rule  | Flagged pattern                     | Reason                           |
| ----- | ----------------------------------- | -------------------------------- |
| PG001 | CREATE INDEX without CONCURRENTLY   | Blocks writes during index build |
| PG002 | DROP COLUMN                         | May break old app versions       |
| PG003 | ALTER COLUMN TYPE                   | Strong lock and possible rewrite |
| PG004 | ADD COLUMN NOT NULL without DEFAULT | Backfill/compatibility risk      |
| PG005 | ADD FOREIGN KEY without NOT VALID   | Validation can block writes      |
| PG006 | RENAME                              | May break old app versions       |

A passing result means **no configured patterns were found**, not that a migration is production-safe. Evaluate PostgreSQL version, lock timeout, data volume, long-running transactions, ORM transaction wrapping, and deployment sequencing separately.

## GitHub Actions

Copy [`examples/consumer-workflow.yml`](examples/consumer-workflow.yml) into your application's `.github/workflows/pg-safe-migrate.yml`. It checks SQL files changed in a PR and doesn't require fixing historical migrations. Pin the package to an audited version, and upgrade deliberately.

## Verify the published CLI

From a clean directory:

```sh
npx --yes --package=@subodh001/pg-safe-migrate@1.1.1 pg-safe-migrate --help
```

Create `unsafe.sql` containing `CREATE INDEX idx_users_email ON users(email);`, then run:

```sh
npx --yes --package=@subodh001/pg-safe-migrate@1.1.1 pg-safe-migrate unsafe.sql
```

Expect `PG001` and exit code 1. The sample `examples/safe.sql` uses `CONCURRENTLY` and should pass PG001; it must run outside a transaction.

## Development

```sh
npm install
npm test
node bin/cli.js test/unsafe_migration.sql
npm pack --dry-run
```

For reproducible CI, commit the generated `package-lock.json` and replace `npm install` in the project's CI with `npm ci`.

## Limitations

This is a static AST linter, not a database execution simulator. It does not connect to production, estimate lock wait time, validate migration rollback, or understand the live schema. `--changed` checks changed SQL files, not SQL inside changed JavaScript/TypeScript files. Some flagged operations can be acceptable under controlled conditions, and some unflagged operations can still cause downtime.

MIT licensed. Issues and edge-case reproductions welcome.
