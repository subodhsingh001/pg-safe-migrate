# v2.0.0 release verification

The maintainer reported all GitHub Actions checks green on 2026-11-17, and confirmed a successful fresh npm installation and CLI invocation on Windows. These are maintainer-reported results; this document is not an independently archived CI log.

## Covered checks

- Node 20/22/24 on Windows and Ubuntu: unit tests, CLI smoke, packaging.
- PostgreSQL 14/16/17: execute representative Prisma/Drizzle-style SQL with `psql`, check resulting schema, verify unsafe migration linting, and confirm PostgreSQL rejects CONCURRENTLY inside BEGIN.
- SARIF: structural verification; GitHub Code scanning upload is non-blocking and requires separate confirmation.

## Important distinctions

- SQL fixtures through `psql` do not verify Prisma Migrate or Drizzle ORM migration runners.
- `test/orm-runner/` contains optional baseline real-runner checks, not executed in the default CI pipeline and not yet verified here.
- Synthetic regression cases do not quantify real-world false-positive rates.
- No guarantee of zero downtime or coverage of all PostgreSQL DDL variants.

## Local checks

```powershell
npm ci
npm test
node test/release-smoke.cjs
node bin/cli.js examples/unsafe.sql --format sarif --output report.sarif --fail-on none
node test/verify-sarif.cjs report.sarif
npm pack --dry-run
```
