# Optional real ORM migration verification

This integration test runs **actual Prisma Migrate and Drizzle ORM migration runners** against a disposable PostgreSQL database. It is separate from the package's default `npm test` and GitHub Actions workflow.

## Prerequisites

- Node.js and npm
- Docker with an available local PostgreSQL port, or another **disposable** PostgreSQL database
- Dependencies installed in `scripts/orm-runner` with `npm install`

## Windows PowerShell

From the repository root:

```powershell
docker run -d --name pg-safe-orm-test -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=pg_safe_local_test_2026 -e POSTGRES_DB=pg_safe_migrate_test -p 127.0.0.1:55432:5432 postgres:16
$env:DATABASE_URL = "postgresql://postgres:pg_safe_local_test_2026@127.0.0.1:55432/pg_safe_migrate_test"
cd scripts/orm-runner
npm install
npm run verify
```

The Docker container command is for an isolated local test only. If the container already exists, start it with `docker start pg-safe-orm-test` instead of creating another one. Stop and remove it when finished with `docker rm -f pg-safe-orm-test`.

## Expected checks

1. Prisma applies a baseline table migration.
2. Prisma applies a **separate** concurrent-index migration and the index exists.
3. The tested Drizzle node-postgres migrator rejects `CREATE INDEX CONCURRENTLY` inside its transaction with PostgreSQL `25001`.
4. The rejected Drizzle index is absent.
5. Temporary database schemas and local temporary files are cleaned up.

`KEEP_TEST_SCHEMAS=1` retains test schemas for inspection; do not set it during normal verification.

**Safety:** This script creates and drops schemas. Run it only against a disposable test database, never a production or shared database. Results depend on the exact Prisma, Drizzle, PostgreSQL, and runner versions installed.
