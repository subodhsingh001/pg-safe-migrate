# PG Safe Migrate - Week 2 Day 7 / VS Code v0.5.0

## Changes in this patch
- Extension manifest version: 0.5.0 (CLI remains 2.3.0).
- Restores a separate tag-only publish job using Marketplace Trusted Publishing via OIDC.
- Validates tag version against extension manifest before publishing.
- Keeps manual workflow_dispatch for verification/packaging only; manual dispatch does not publish.
- Installs root dependencies with npm ci; does not run npm ci in vscode-extension.

## Before applying
Back up your working tree, including untracked Week 2 tests. This patch overwrites only:
- vscode-extension/package.json
- .github/workflows/vscode-extension-release.yml

## Apply in PowerShell from project root
Expand-Archive -LiteralPath 'C:\path\to\pg-safe-migrate-v0.5.0-release-patch.zip' -DestinationPath "$env:TEMP\pg-safe-migrate-v050" -Force
Copy-Item "$env:TEMP\pg-safe-migrate-v050\vscode-extension\package.json" '.\vscode-extension\package.json' -Force
Copy-Item "$env:TEMP\pg-safe-migrate-v050\.github\workflows\vscode-extension-release.yml" '.\.github\workflows\vscode-extension-release.yml' -Force

## Verification (project root)
npm ci
npm run test:unit
npm test
cd vscode-extension
npm run build:standalone
npm run verify:standalone
npx --yes @vscode/vsce@4.1.1 package --no-dependencies
Get-ChildItem '*0.5.0.vsix'
cd ..

Review the VSIX locally and test PG025 preview without changing the source SQL.
Confirm Marketplace Trusted Publishing remains active for publisher sukoaa, repository subodhsingh001/pg-safe-migrate, workflow vscode-extension-release.yml.

## Commit and release ONLY after all checks pass
Stage the intended source, tests, docs and two release files. Exclude generated reports, .vsix, node_modules and local backups. Inspect `git diff --cached --stat` and `git diff --cached` before committing.

git push origin main
# Once the reviewed release commit is on main:
git tag vscode-v0.5.0
git push origin vscode-v0.5.0

The tag triggers GitHub Actions and, after verification, the OIDC publish job. Do not recreate or move the existing vscode-v0.4.1 tag.
