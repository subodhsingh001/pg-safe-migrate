# PG Safe Migrate — VS Code Extension

Standalone PostgreSQL migration linting for `.sql` files, powered by the bundled PG Safe Migrate CLI.

## Features

* Automatically lint SQL files when opened or saved (enabled by default).
* Show PostgreSQL migration findings in VS Code's Problems panel, including rule IDs such as PG011.
* Use the editor's lightbulb / Quick Fix menu to view guidance; SQL is not automatically rewritten.
* Manually run **PG Safe Migrate: Lint Current SQL File** from the Command Palette.

## Requirements

* VS Code 1.85 or newer.
* Node.js 18 or newer available on PATH, or set `pgSafeMigrate.nodePath` to its executable.
* No separate CLI installation or CLI source checkout is required for the packaged standalone extension.

## Settings

* `pgSafeMigrate.autoLint` (default `true`): lint on open and save.
* `pgSafeMigrate.debounceMs` (default `350`): debounce in milliseconds.
* `pgSafeMigrate.nodePath` (default `node`): Node.js executable.

### v0.7.0 safeguards

- `pgSafeMigrate.timeoutMs`: 30000 ms (1000–120000).
- `pgSafeMigrate.maxConcurrentLints`: 1 (1–4 per extension host).
- `pgSafeMigrate.maxFileSizeMB`: 2 MiB (1–16); not a memory cap.
- CLI output limits: 16 MiB stdout and 1 MiB stderr.
- Restricted workspaces are unsupported; executable selection is machine-scoped.
- Check Output → PG Safe Migrate when diagnostics are missing. A skipped or failed lint is not a safe result.

## Build and verify from source

From the repository's `vscode-extension` directory:

```sh
npm run build:standalone
npm run verify:standalone
npm run package:standalone
```

`build:standalone` copies the sibling CLI project into `runtime/` and installs its production dependencies. The packaging command rebuilds and verifies the runtime before packaging with VSCE 4.1.1. The resulting VSIX bundles the CLI and parser WASM, so it can lint SQL files in unrelated workspaces.

## Install locally

In VS Code, open **Extensions → ... → Install from VSIX** and select the generated `pg-safe-migrate-vscode-0.7.0.vsix`.

Open any `.sql` file, enter `DROP TABLE users;`, save it, and check **Problems** for PG011. Check the lightbulb guidance as well.

## Before Marketplace publication

Verify the publisher `sukoaa` is owned by your Marketplace account; inspect VSIX contents, install in a fresh VS Code profile, and confirm the extension README and license are accurate. Marketplace publication requires separate authentication.

## Example: migration diagnostics

```sql
TRUNCATE TABLE customers;                 -- PG023: destructive TRUNCATE
ALTER TABLE users ALTER COLUMN email SET NOT NULL; -- PG025: validate/backfill first
ALTER TABLE orders DROP CONSTRAINT orders_customer_id_fkey; -- PG024: integrity risk
```

PG025 supersedes the older PG013 warning for the same `SET NOT NULL` statement. Diagnostics point to the beginning of the relevant SQL statement. The tool does **not** execute migrations or apply fixes automatically.

## Release workflow

The release workflow builds and verifies a VSIX. A `vscode-v*` tag or manual dispatch from main with a nonempty `publish_version` can trigger Marketplace OIDC publication, subject to environment protections and authentication. Leave the input empty for build-only manual dispatch. Do not push release tags until approved.

## Safety limitations

Large SQL inputs can consume substantial memory even below the file size limit. Concurrency and timeout settings are not hard process memory limits.

Linting and disposable-database simulations cannot guarantee production safety, zero downtime, or automatic rollback. Review migration plans and backups before deploying changes.

### Migration plan preview (development)
Rebuild the standalone runtime before testing. Open a saved SQL file in a trusted workspace and select **PGSAFE: Generate Migration Plan** from the command palette or editor context menu. Select framework, optional reviewed JSON context, and Markdown or JSON. The report opens as an untitled text document; use normal VS Code Copy and Save As to export it. No SQL is executed and no migration is edited. The preview is editable text, not an approved migration. Only one generator request runs at a time, with a 30-second timeout and 4 MiB output limit.
