# Release verification for v2.0.0-rc.2

This is a release-verification candidate, not evidence that GitHub Actions or PostgreSQL jobs have passed. The new workflow must run on GitHub before declaring readiness.

## Checks

- Windows 2022 / Ubuntu 24.04, Node 20/22/24: `npm ci`, unit tests, CLI smoke checks, packaging.
- PostgreSQL 14/16/17 services: execute representative Prisma and Drizzle SQL fixtures against a real database, confirm resulting schema, confirm an unsafe index is blocked by CLI, and verify PostgreSQL rejects `CREATE INDEX CONCURRENTLY` inside `BEGIN`.
- SARIF: generate and structurally verify a finding, then attempt upload through GitHub code scanning. Upload is deliberately non-blocking because repository code-scanning availability and PR token permissions vary; **inspect the upload outcome and Code scanning UI** before marking that check complete.
- CLI smoke: exit codes 0/1/2, config severity, JSON output and missing-file behavior.

## Limitations

- Prisma/Drizzle tests use representative generated SQL layouts, not full ORM migration runners. Test real `prisma migrate deploy` and `drizzle-kit migrate` in a separate example application before claiming end-to-end ORM compatibility.
- Database tests cover selected scenarios, not every PostgreSQL version or DDL variant. Lock contention and zero-downtime behavior are not proven.
- Code scanning SARIF upload may require repository settings or appropriate permissions; a successful report generation does not imply successful GitHub upload.
- The workflow has not been executed in GitHub Actions by this package build.

## Run locally

```powershell
npm ci
npm test
node test/release-smoke.cjs
node bin/cli.js examples/unsafe.sql --format sarif --output report.sarif --fail-on none
node test/verify-sarif.cjs report.sarif
npm pack --dry-run
```

Push the `.github/workflows/release-verification.yml` file and inspect every matrix job under GitHub Actions. Do not publish stable 2.0.0 until they pass or exceptions are documented and accepted.
