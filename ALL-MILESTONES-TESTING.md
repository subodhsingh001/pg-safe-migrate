# Consolidated development build — testing guide

This is a development candidate, **not** a verified production release. Package version stays at 2.1.0.

## Combined report (Windows CMD, Docker running)

```cmd
npm ci
npm test
node bin/cli.js --assess --migrations-dir examples/migrations --baseline examples/baseline.sql --verify-sql examples/verify.sql --postgres-version 16 --team-policy examples/team-policy.json --output assessment.json
```

The `assessment.json` contains execution steps, static lint findings, heuristic locks, advice, risk scoring, and local team-policy outcome. A migration that executes successfully may still fail static lint or policy. `--verify-sql` runs after migrations; write assertions that raise PostgreSQL errors on unexpected state.

## PostgreSQL 14–18 matrix

```cmd
node scripts/test-pg-matrix.cjs
```

This starts five separate disposable Docker containers in sequence. Requires local Docker images or permission to pull them. A passing matrix on one computer does not guarantee performance or production safety on all server versions.

## Failure case

Create a migration with invalid SQL or a post-migration assertion that raises an exception. Expect nonzero exit status and a failed `execution` stage. Docker container cleanup should be verified with `docker ps -a --filter name=pg-safe-sim`.

## VS Code extension (local development)

The `vscode-extension/` folder is an **unpackaged local prototype**. Open it as a VS Code extension development project and run an Extension Development Host; open the pg-safe-migrate project folder in that host, open a `.sql` file, and run **PG Safe Migrate: Lint Current SQL File** from the Command Palette. It calls the project's local CLI and shows diagnostics. It does not yet include VSIX packaging, automated extension-host tests, marketplace publication, or remote CLI discovery.

## Team policies

`examples/team-policy.json` shows supported local constraints: `maxRiskScore`, `maxWarnings`, `blockedRules`, `requireSimulation`. These are file-based policies, not centralized administration, authentication, dashboards, or multi-tenant reporting.

## Verification status

- 10 simulator/policy focused tests passed in the build environment.
- JavaScript syntax and npm pack dry run passed.
- Full suite could not run here because `libpg-query` tarball was unavailable offline.
- PostgreSQL 14–18 Docker matrix not executed here.
- VS Code extension host not executed here.
