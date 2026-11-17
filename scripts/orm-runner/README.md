# Optional real ORM migration-runner checks

The existing PostgreSQL CI jobs execute representative Prisma and Drizzle SQL with `psql`. This directory adds **opt-in checks that invoke actual migration runners**. They require a disposable PostgreSQL database and are not part of `npm test` or the release-verification workflow.

## Requirements

- Node.js 20+ and npm
- A running disposable PostgreSQL database with permissions to create tables and schemas
- Network access to install pinned development dependencies
- `DATABASE_URL` set to a **disposable database**, never production

From the repository root:

```powershell
cd test/orm-runner
npm install
$env:DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/pg_safe_migrate_orm_test'
npm run verify
```

The script creates separate PostgreSQL schemas for Prisma and Drizzle to avoid collisions. It runs a small non-concurrent baseline migration with each runner, checks the resulting tables, and records success. It does **not** prove that either runner supports `CREATE INDEX CONCURRENTLY`; PG015 and PG016 remain advisories until that behavior is verified against the exact framework version and execution strategy used by consumers.

Do not point this script at a production or shared database. Review the fixture SQL before running. Database cleanup is not automatic.
