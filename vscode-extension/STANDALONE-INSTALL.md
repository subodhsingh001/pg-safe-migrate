# PG Safe Migrate VS Code standalone extension (0.3.0 candidate)

The `vscode-extension.zip` source was supplied by the user. This update bundles the CLI's `bin/`, `src/` and locked production dependencies into `vscode-extension/runtime/` during the build. The extension prefers this runtime, then falls back to the local development CLI.

## Windows CMD (from the main project folder)

```bat
cd /d C:\subodh\pg-safe-migrate-fixed\pg-safe-migrate\vscode-extension
npm run build:standalone
npm run verify:standalone
npx @vscode/vsce ls --no-dependencies
npm run package:standalone
```

**Before packaging:** Confirm the `vsce ls` output includes `runtime/bin/cli.js`, `runtime/src/analysis.js` and `runtime/node_modules/libpg-query/` files. If any are missing, STOP: do not distribute the VSIX. `npm run package:standalone` repeats the dependency installation and requires internet/npm access.

Install the generated `pg-safe-migrate-vscode-0.3.0.vsix` using **Extensions > ... > Install from VSIX**. Restart VS Code. Test with a separate, unrelated folder containing `unsafe.sql` with `DROP TABLE users;`. PG011 must appear on save without the main pg-safe-migrate folder being open. Use `Ctrl + .` for guidance. If old copies are active, uninstall/disable the older extension and reload.

The extension still requires Node.js >=18 on the user's PATH (or set `pgSafeMigrate.nodePath`). This is a standalone **CLI-dependency bundle**, not a Node.js runtime bundle. The build installs dependencies on the build machine; verify packaging on your target Windows architecture, and test on other operating systems before claiming cross-platform compatibility. This package has not been published to the Marketplace.

No automatic SQL rewriting is performed. The linter is heuristic; no production downtime guarantee.
