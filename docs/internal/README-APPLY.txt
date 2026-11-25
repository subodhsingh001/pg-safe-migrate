PG SAFE MIGRATE — GROWTH + WEEK 3 STARTER

This patch is ADDITIVE and deliberately does not overwrite your repository with an older snapshot.

1. Extract this ZIP anywhere.
2. Copy apply-growth.mjs into your repository root.
3. In PowerShell:
   cd C:\subodh\pg-safe-migrate-fixed\pg-safe-migrate
   node .\apply-growth.mjs
   npm install --package-lock-only --ignore-scripts
   npm run test:unit
   npm run test:release
   git diff -- package.json package-lock.json vscode-extension/package.json
4. Review GROWTH-README-SECTION.md and manually append it to the root README.md and, if useful, the extension README.md. Do not replace existing README files.
5. Use WEEK3-PLAN.md as the Week 3 implementation and acceptance plan.
6. Commit/push changes after review. Metadata updates alone do not appear on npm or Marketplace until a new version is published.

IMPORTANT: This starter implements metadata improvements only. Week 3 feature code is NOT included; development begins with the safety-gate plan.
