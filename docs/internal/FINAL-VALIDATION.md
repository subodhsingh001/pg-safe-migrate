# Final validation instructions (v2.2.0)

## Confirmed in this build environment

- `node --test test/extension-host-mock.test.cjs`: PASS (1/1)
- `node --test test/combined.test.js`: PASS (3/3)
- `node --check vscode-extension/extension.cjs`: PASS
- Complete dependency installation unavailable (`registry.npmjs.org` DNS EAI_AGAIN).
- Consequently the new AST-based negative tests and full suite have **not** been executed here.
- VS Code extension-host integration has **not** been executed. The mock test checks command registration and diagnostic severity mapping only.

## Windows CMD: full tests

```cmd
npm ci
npm test
node scripts\test-pg-matrix.cjs
```

## Negative-path tests (important)

```cmd
node --test test\assessment-negative.test.js
```

These check that a migration which executes successfully but drops a table still fails the combined safety assessment, and that duplicate index definitions block Docker execution.

## VS Code extension host

1. Open the project root in VS Code.
2. Open the `vscode-extension` folder in a separate VS Code window.
3. Press F5 with an extension-host launch configuration, or use `code --extensionDevelopmentPath=<absolute path to vscode-extension> <absolute path to project root>`.
4. Open a `.sql` file in the project-root workspace and invoke **PG Safe Migrate: Lint Current SQL File** from the Command Palette.
5. Verify that error-level findings show as errors in Problems, warning-level findings as warnings, and that invalid CLI output produces an error message.

This extension is still a local prototype: it expects `bin/cli.js` at the workspace root, and is not a Marketplace-ready packaged extension.

## Release gate

Do not publish as fully validated until the complete test suite, five-version Docker matrix, new negative-path tests, and actual VS Code Extension Development Host tests pass.
