# Day 3 guidance preview fix

The uploaded source does not use WorkspaceEdit or applyEdit; its Quick Fix shows a modal and optionally copies a template to the clipboard. It does not automatically insert SQL into the active migration. The reported mixed SQL cannot be conclusively attributed to this code alone.

The fix changes the modal to offer **Open separate SQL preview**, which creates an unsaved, untitled SQL document with explicit advisory comments. **Copy example SQL** remains opt-in. The source migration is not modified.

The example SQL remains illustrative, may require backfills and schema-specific changes, and must never be executed without review. PG024 has a non-executable advisory template.

## Verify

1. `npm ci`
2. `npm run test:unit`
3. `npm test` (Docker Desktop required for integration tests)
4. `cd vscode-extension` then `npm run build:standalone`, `npm run verify:standalone`, and `npm run package:standalone`.
5. Install the resulting local VSIX and use Ctrl+. on PG023/PG025/PG024. Choose **Open separate SQL preview**. Confirm the original migration file is unchanged.

Do not publish this as an update until tests and manual editor behavior pass.
