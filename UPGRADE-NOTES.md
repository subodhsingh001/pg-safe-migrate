# Upgrade notes: v1.1.2 to v2.0.0

v2.0.0 is published on npm as `@subodh001/pg-safe-migrate@2.0.0`.

## What changed

- Additional PostgreSQL DDL checks and framework advisories (see README rule table; PG009 is not implemented).
- Configurable rule severity, exclusions, and PostgreSQL major-version metadata.
- JSON and SARIF output (`--format`), optional file output (`--output`), `--fail-on` exit threshold, and `--advisor`.
- Explicit transaction AST checks, source positions, and cross-file dependency heuristics.
- Release verification covering Node 20/22/24 on Windows/Ubuntu and PostgreSQL 14/16/17 SQL fixtures (reported green by the maintainer on 2026-11-17).

## Severity and compatibility

PG015 (Prisma runner transaction uncertainty), PG016 (Drizzle runner transaction uncertainty), and PG017 (cross-file heuristic) default to `warning` even with the standard global `severity: error`. Explicit per-rule configuration can promote them to errors or turn them off. PG008 (CONCURRENTLY inside explicit SQL transaction) remains an error.

`--fail-on error` returns a nonzero exit code for error-severity findings; `--fail-on warning` also fails for warnings. Review existing CI expectations before upgrading.

## Limitations

- Static SQL AST checks are not a zero-downtime guarantee or a production lock simulator.
- Prisma and Drizzle SQL fixtures executed by `psql` are not equivalent to running the actual ORM migration tools.
- Optional baseline runner checks are provided in `test/orm-runner/`; they require a disposable PostgreSQL database and separate dependencies. They have not been executed as part of this package update.
- PostgreSQL-version-specific behavior is only partially modeled. Cross-file checks are heuristic, and source locations may depend on parser offsets.
- SARIF report generation and upload availability are separate concerns; inspect repository Code scanning settings and upload results.
- The curated regression corpus is synthetic; real-world false-positive and false-negative rates have not been measured.

## Verify locally

```powershell
npm ci
npm test
node test/release-smoke.cjs
npm pack --dry-run
```

For optional ORM-runner tests, see `test/orm-runner/README.md`.
