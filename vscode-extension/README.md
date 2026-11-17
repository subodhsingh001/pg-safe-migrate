# PG Safe Migrate — VS Code Extension

Standalone PostgreSQL migration linting for `.sql` files, powered by the bundled `@subodh001/pg-safe-migrate` CLI.

## Features

- Automatically lint SQL files when opened or saved (enabled by default).
- Show PostgreSQL migration findings in VS Code's Problems panel, including rule IDs such as PG011.
- Use the editor's lightbulb / Quick Fix menu to view guidance; SQL is not automatically rewritten.
- Manually run **PG Safe Migrate: Lint Current SQL File** from the Command Palette.

## Requirements

- VS Code 1.85 or newer.
- Node.js 18 or newer available on PATH, or set `pgSafeMigrate.nodePath` to its executable.
- No separate CLI installation or CLI source checkout is required for the packaged standalone extension.

## Settings

- `pgSafeMigrate.autoLint` (default `true`): lint on open and save.
- `pgSafeMigrate.debounceMs` (default `350`): debounce in milliseconds.
- `pgSafeMigrate.nodePath` (default `node`): Node.js executable.

## Build and verify from source

From the repository's `vscode-extension` directory:

```sh
npm run build:standalone
npm run verify:standalone
npm run package:standalone
```

`build:standalone` copies the sibling CLI project into `runtime/` and installs its production dependencies. The resulting VSIX bundles the CLI and parser WASM, so it can lint SQL files in unrelated workspaces.

## Install locally

In VS Code, open **Extensions → ... → Install from VSIX** and select the generated `pg-safe-migrate-vscode-0.3.0.vsix`.

Open any `.sql` file, enter `DROP TABLE users;`, save it, and check **Problems** for PG011. Check the lightbulb guidance as well.

## Before Marketplace publication

Verify the publisher `subodh001` is owned by your Marketplace account; inspect VSIX contents, install in a fresh VS Code profile, and confirm the extension README and license are accurate. Marketplace publication requires separate authentication.

## Safety limitations

Linting and disposable-database simulations cannot guarantee production safety, zero downtime, or automatic rollback. Review migration plans and backups before deploying changes.
