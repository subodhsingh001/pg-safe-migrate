# Week 3 Day 2 — CI gate validation and JSON output

- Rejects unknown and duplicate blocked rule IDs, invalid policy names and thresholds.
- Validates gate policy before scanning files; malformed policies fail closed with exit code 2.
- Adds `gate` to JSON output **only when** `--gate-policy` is provided; other JSON report shapes remain unchanged.
- Gate decision `PASS` or `BLOCK`, reasons, and limitations included in JSON.
- Exit codes: `0` passed, `1` lint severity or gate block, `2` configuration or execution error.
- Existing npm v2.4.0 and VS Code v0.5.0 versions remain unchanged.

Run `npm run test:unit`, `npm run test:release`, and inspect the JSON using:

```powershell
node bin/cli.js examples/unsafe.sql --gate-policy examples/week3-gate-policy.json --format json --fail-on none
Write-Host "Exit code: $LASTEXITCODE"
```

This patch is source-only; do not publish it until full verification passes.
