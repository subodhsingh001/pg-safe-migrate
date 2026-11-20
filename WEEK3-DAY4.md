# Week 3 Day 4: production-aware advisory context

This is an **optional, offline, read-only** analysis based on user-provided estimates. It never connects to a production database or changes policy-gate enforcement.

## Usage

```powershell
node bin/cli.js examples/unsafe.sql --production-context examples/week3-production-context.json --gate-policy examples/week3-gate-policy.json --format json --fail-on none
Write-Host "Exit code: $LASTEXITCODE"
npm run test:unit
npm run test:release
```

Expect `production.assessments`, a `BLOCK` gate for PG001 and exit code `1`. With a safe migration, expect no assessments and gate `PASS`. Invalid production context returns exit code `2`.

## Production context schema

Use `schemaVersion: 1`, `tables` with `schema`, `table`, and optional `estimatedRows`, `bytes`, `writeQueriesPerSecond`, plus optional `lockTimeoutMs` and `statementTimeoutMs`. Estimates are supplied by the operator and **not verified**. The tool does not accept credentials in this file. Do not put secrets in the JSON. Review any committed production estimates for information sensitivity.

## Limitations

Table extraction from finding messages is heuristic, ambiguous names are ignored, and advisory attention levels are not downtime probabilities. Existing policy and risk baseline behavior are preserved. No network access is added.

## Release discipline

Keep npm 2.4.0 and VS Code 0.5.0 until full local regression verification and planned release.
