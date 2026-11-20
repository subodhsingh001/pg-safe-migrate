# Week 3 Day 5 — GitHub Actions pull-request safety report

Additive workflow `.github/workflows/week3-pr-safety.yml` (existing release workflows are not modified). On PRs, it checks changed SQL with the current CLI, applies `examples/week3-gate-policy.json`, optionally compares the reviewed baseline and adds production advisory context. The workflow posts a GitHub Actions **job summary**; it does not post a PR comment or require a write token. Gate BLOCK exits 1; CLI errors exit 2.

## Install and verify (PowerShell)

Extract this patch into the repository root, preserving paths. Then:

```powershell
npm run test:unit
npm run test:release
node --test test/week3-day5.test.js
node bin/cli.js examples/unsafe.sql --gate-policy examples/week3-gate-policy.json --format json --output day5-report.json --fail-on none
$env:REPORT_PATH = (Resolve-Path day5-report.json).Path
$env:ANALYSIS_STATUS = '1'
node scripts/week3-pr-summary.mjs
Remove-Item Env:REPORT_PATH, Env:ANALYSIS_STATUS
Remove-Item day5-report.json
```

Push the new workflow on a feature branch and open a PR. View the **Summary** tab of the `migration-risk` job. Existing workflows may also run; their status is independent. `workflow_dispatch` checks the default migration discovery scope instead of a PR diff. Do not treat the sample baseline or production-context estimates as real approval of production changes: review them before committing. The workflow does not access a production database.
