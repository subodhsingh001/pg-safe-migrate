# PG Safe Migrate: extension release setup

## Current status

- Publisher: `sukoaa`; extension ID: `sukoaa.pg-safe-migrate-vscode`.
- Marketplace version at the time of this update: 0.4.0 (reported published by owner).
- `.github/workflows/vscode-extension-release.yml` is a **release-candidate build**, not a Marketplace publish workflow.

## Create a verified release candidate

1. Commit source changes and push to `subodhsingh001/pg-safe-migrate`.
2. In GitHub Actions, run **VS Code extension release candidate** using `workflow_dispatch`.
3. Download the `pg-safe-migrate-vscode-vsix` artifact and inspect it.
4. Update the **existing** extension in https://marketplace.visualstudio.com/manage/publishers/ (do not create a new extension).
5. Increase the extension version in `vscode-extension/package.json` before a subsequent Marketplace update; do not republish an identical version.

## Trusted Publishing

1. In Marketplace publisher management select `sukoaa` > **Trusted Publishing**.
2. Review the available provider, repository, workflow and identity fields. Use the exact GitHub owner/repository/workflow values required by the portal.
3. Check current official Microsoft documentation and `@vscode/vsce` version for supported OIDC publishing commands and required GitHub `id-token: write` permission. Do not assume a CLI option without checking it.
4. Only after a dry-run verification, add a separate, protected publish job/environment and explicitly approve its first release.
5. Never commit PATs or paste credentials into issue comments or chat.

The user's earlier Azure tenant error (`AADSTS16000`) does not prevent manual Marketplace updates under the existing publisher owner account.

## Release checklist

- [ ] `npm run test:unit` passes
- [ ] PostgreSQL Docker matrix passes in an environment with Docker
- [ ] `npm run build:standalone` and `npm run verify:standalone` pass
- [ ] Verify PG023 line 1, PG025 line 3, PG024 line 6; no duplicate PG013
- [ ] Confirm extension version increment and VSIX contents
- [ ] Upload to existing Marketplace extension, verify public version
