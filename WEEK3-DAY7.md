# Week 3 Day 7 — Release-readiness verification

This patch adds a **non-publishing**, read-only audit script. It does not change the CLI, extension, migration rules, baseline, or policy gate. It does not run a database migration.

## Install and run (PowerShell)

Extract into the repository root, keeping `scripts/` and `WEEK3-DAY7.md` paths. Commit or back up local changes first.

```powershell
cd C:\subodh\pg-safe-migrate-fixed\pg-safe-migrate
npm ci
node scripts/week3-release-readiness.mjs --output week3-release-readiness.md
Write-Host "Audit exit code: $LASTEXITCODE"
```

The script checks Day 1–6 files, CLI and VS Code metadata, unit and release smoke tests, npm package dry run, Day 5 report tests, and verifies unsafe SQL produces a `BLOCK` gate and exit code 1. It returns exit 1 if any local check fails; exit 0 otherwise. It writes the optional report file only when `--output` is supplied.

## Mandatory manual release gates

1. Open a **real pull request** to `main` containing a migration change. Verify `.github/workflows/week3-pr-safety.yml` runs, publishes a job summary, and fails for a newly introduced blocked risk. Confirm a safe PR passes. Verify the baseline is explicitly reviewed and does not mask new findings.
2. Review `npm pack --dry-run --json` to confirm all runtime files needed by the CLI are included. Pay special attention to new `src/` modules and example files.
3. Build and smoke-test the VS Code extension using its existing extension workflow and verify diagnostics/Quick Fix behavior on a SQL file. The audit only validates extension metadata, **not** extension functionality.
4. Review docs, changelog, version bump, branch protections, repository secrets, workflow permissions, and release notes. Do not publish if any required gate is unresolved.
5. Publish npm and the VS Code extension **separately**, only after the release candidate is approved. Do not run publishing commands as part of this audit.

## Notes

- `examples/reviewed-risk-baseline.json` and `examples/week3-production-context.json` are demonstration inputs; they are not production approvals or live measurements.
- Passing a static policy gate is not a downtime guarantee.
- Release candidate version numbers are not changed by this patch.
