# Week 3 final release checks

This patch removes Node DEP0190 from the readiness script by avoiding `shell: true`. On Windows it invokes `cmd.exe` with a strict allowlist of fixed npm commands. Do not introduce user-supplied arguments into the Windows command string.

## Install
Extract the patch into the repository root, replacing `scripts/week3-release-readiness.mjs`.

```powershell
node scripts/week3-release-readiness.mjs --output week3-release-readiness.md
Write-Host "Audit exit code: $LASTEXITCODE"
```

## Hosted pull-request verification

Do not test by committing directly to main. Create a branch, add a harmless SQL file containing a deliberately unsafe statement, and push it. The workflow should BLOCK. Then replace the SQL with a safe statement and push again; the workflow should PASS. The examples below create a disposable test file only.

```powershell
git switch main
git pull --ff-only
git switch -c test/week3-pr-gate
New-Item -ItemType Directory -Force migrations | Out-Null
'CREATE INDEX idx_week3_test_email ON users(email);' | Set-Content migrations/week3_gate_test.sql
git add migrations/week3_gate_test.sql
git commit -m "test: verify unsafe PR gate"
git push -u origin test/week3-pr-gate
```

Open a PR from `test/week3-pr-gate` to `main` on GitHub and inspect **PG Safe Migrate PR safety report**. Expected: `BLOCK` and failing check. Note: if the baseline already contains an identical finding for this exact file and SQL, the gate may pass; use a new file/statement in that case.

Then test the safe case:

```powershell
'CREATE INDEX CONCURRENTLY idx_week3_test_email ON users(email);' | Set-Content migrations/week3_gate_test.sql
git add migrations/week3_gate_test.sql
git commit -m "test: verify safe PR gate"
git push
```

Expected: `PASS` and a successful check. Do not merge this test PR; close it after checking both runs. The safe example is only for lint testing and should not be deployed to production without validating table/index names and transaction behavior.

## Extension and release review

Run extension packaging commands using the existing extension scripts (check `vscode-extension/package.json`). Install the resulting VSIX in an Extension Development Host or a test VS Code profile and confirm diagnostics/Quick Fix behavior. Verify CLI version, extension version, release notes, package contents, and GitHub Actions permissions before publishing.

The patch does not publish, push, or change package versions.
