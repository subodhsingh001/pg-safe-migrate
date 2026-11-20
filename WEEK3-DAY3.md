# Week 3 Day 3 — Migration risk baselines

Generate a baseline **only after reviewing historical risks**:

```powershell
node bin/cli.js examples/unsafe.sql --write-risk-baseline examples/reviewed-risk-baseline.json --fail-on none
```

Compare against it and enforce only new violations:

```powershell
node bin/cli.js examples/unsafe.sql --risk-baseline examples/reviewed-risk-baseline.json --gate-policy examples/week3-gate-policy.json --format json --fail-on none
Write-Host "Exit code: $LASTEXITCODE"
```

The baseline stores SHA-256 fingerprints, not SQL. A fingerprint includes the normalized migration path, rule ID, severity and a normalized statement text approximation. This is a heuristic: SQL containing semicolons inside strings, procedural blocks, or complex comments can yield unstable statement boundaries. A file rename is intentionally treated as a new finding; do not auto-approve baselines in CI. Duplicate findings are counted separately. Baseline files should be reviewed like other policy changes.

With `--risk-baseline`, the gate and `--fail-on` apply to **new findings only**; the full report still includes all findings. JSON includes `baseline.newCount`, `existingCount`, `resolvedCount`, and `newFindings`. A missing or malformed baseline returns exit code 2. Existing behavior without baseline flags is unchanged.

Run `npm run test:unit` and `npm run test:release` after applying. Published versions are unchanged.
