# Consolidated roadmap — implementation status

This archive is a **v2.1.0 development candidate**, not a published release and not a completed v3.0 platform. Do not publish without passing the full suite and integration checks.

## Implemented in this candidate
- v2.0.1: CLI version is read from package metadata; consistency test added; GitHub workflow included.
- v2.1: GitHub workflow annotations, Markdown summaries, recommended/strict CI presets, tested Prisma/Drizzle advisory copy, regression tests.
- v2.2 foundations: conservative statement lock classification, heuristic risk score with explicit low confidence, cross-file PG017 already present, migration-plan suggestions.

## Not implemented / not verified
- PostgreSQL 14–18 **version-specific** semantics for all rules; existing PG014 only handles an older-version case.
- Complete cross-file dependency graph and migration ordering across all tools.
- Production-grade safe expand-and-contract plans with schema-aware SQL generation.
- Disposable PostgreSQL **simulation** of arbitrary migrations with rollback/timeout/isolation; current real ORM runner only tests specific fixtures.
- Optional read-only production database context (credentials, permissions, safe query budgets).
- Packaged/published VS Code extension.
- Team service, policy management, historical reporting and audit dashboard.
- GitHub PR comment publishing (annotations and step summary are implemented, not persistent bot comments).

## Important testing limits
Run `npm ci && npm test && node test/release-smoke.cjs && npm pack --dry-run` on a network-enabled machine. Run `npm run verify` from `scripts/orm-runner` against a disposable PostgreSQL instance. Confirm CI on GitHub. The risk score is not a prediction of downtime.

## Try the consolidated candidate

```powershell
npm ci
npm test
node test/release-smoke.cjs
npm pack --dry-run
node bin/cli.js --version
node bin/cli.js --preset strict --github --risk --advisor examples/unsafe.sql
```

GitHub Actions: copy `.github/workflows/migration-safety.yml` into your repository. The workflow only analyzes migrations when conventional migration directories exist. Check SARIF upload permissions in your repository. No automatic push, release, or npm publish has been performed.

## Continuation: optional read-only database catalog inspection
- Added `--inspect-db` for an explicitly opted-in database catalog snapshot. It reads PostgreSQL version, estimated row counts, and table sizes, capped at 50 tables by default.
- Requires `DATABASE_URL` and separately installed `pg` (`npm install pg`). No credentials are stored in reports.
- Uses a read-only transaction and five-second statement timeout. **Not a substitute for a least-privilege database role.** Prefer a disposable or replica database, and never use a privileged production URL.
- Added two isolated unit tests. Real PostgreSQL inspection and security review are still pending.
- This is a foundation for v3.0 database context, not a completed database-aware migration risk engine.

## Latest development: experimental disposable Docker simulator
- Added `--simulate <sqlFile>`, `--postgres-version 14..18`, and `--simulate-timeout <seconds>`.
- Runs migration SQL in a new isolated PostgreSQL Docker container, without publishing ports, network access, host file mounts, or production database credentials.
- Adds three unit tests covering container invocation, failed SQL, cleanup, and argument validation.
- **Not yet verified against a live Docker daemon in this environment.** Does not test production downtime or lock contention; does not support multi-file migration state, seed data, or a hardened sandbox.

## Consolidated experimental development update

- Combined static lint + Docker execution JSON: implemented, live integration pending.
- PostgreSQL 14–18: executable Docker matrix script added, matrix not yet run here.
- Failure handling and database state: baseline and migration steps plus optional SQL verification assertions; more real-world fixtures pending.
- VS Code: local diagnostic command prototype, extension host/package tests pending.
- Team policy: local JSON evaluation and report included; no hosted dashboard, auth or audit service.
- Do not call this a complete v3.0 release. See ALL-MILESTONES-TESTING.md.
