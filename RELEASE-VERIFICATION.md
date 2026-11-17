# v2.0.0 release verification

## Status (2026-11-17)

- Package version: `@subodh001/pg-safe-migrate@2.0.0` (maintainer reports published and externally installed).
- GitHub Actions: **passed**, as reported by the maintainer on 2026-11-17. This document does not embed the underlying CI run log.
- Real PostgreSQL 16 integration: **passed**, as shown by the maintainer's `npm run verify` output on 2026-11-17.
- Final local `npm test`, `node test/release-smoke.cjs`, and `npm pack --dry-run` on this updated archive: **not independently confirmed**. Re-run after extracting and installing dependencies.

## Verified ORM behavior

| Framework and execution path | Result |
| --- | --- |
| Prisma 6.19.x `migrate deploy`: create baseline table | Passed |
| Prisma 6.19.x `migrate deploy`: separate `CREATE INDEX CONCURRENTLY` migration | Passed; index existence checked |
| Drizzle ORM 0.44.x node-postgres migrator: `CREATE INDEX CONCURRENTLY` | Expected PostgreSQL `25001` rejection inside a transaction |
| Drizzle index existence after rejected migration | Verified absent |
| Disposable PostgreSQL schemas | Cleaned up |

**Interpretation:** The Prisma result requires the concurrent index to be in a separate migration file in this tested setup. The Drizzle result is specific to the tested standard node-postgres migrator; a separately managed non-transactional SQL execution path can behave differently. PG015 and PG016 remain advisory warnings by default because static analysis cannot determine every deployment runner's behavior.

## CI coverage reported by the maintainer

- Node 20/22/24 on Windows and Ubuntu: unit tests, CLI smoke, packaging.
- PostgreSQL 14/16/17: representative SQL fixture execution and concurrent-index transaction rejection.
- SARIF structural verification; code-scanning upload is optional and must be confirmed separately.

CI SQL fixtures are not the same as the opt-in real Prisma/Drizzle integration runner. The latter is not included in default `npm test` or CI.

## Local release checks

From the project root in PowerShell:

```powershell
npm ci
npm test
node test/release-smoke.cjs
node bin/cli.js examples/unsafe.sql --format sarif --output report.sarif --fail-on none
node test/verify-sarif.cjs report.sarif
npm pack --dry-run
```

To rerun the real ORM integration tests, see `scripts/orm-runner/README.md`. Use a disposable database only. Never run the integration script against production or shared databases.

## Limitations

These checks do not prove zero downtime, exhaustively cover PostgreSQL DDL, measure real-world false-positive rates, or validate every ORM version or runner configuration.
