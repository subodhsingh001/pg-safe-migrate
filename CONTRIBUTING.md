# Contributing

Fork the repository and create a focused branch. Install dependencies with `npm ci`. Add regression tests for rule changes and preserve stable diagnostic IDs. Run `npm run test:release` and `git diff --check`. For extension changes run `npm run build:standalone` and `npm run verify:standalone` in `vscode-extension`. Document limitations and include sanitized SQL reproductions. Do not commit secrets, generated VSIX files or local logs. Open a pull request describing the change and test results. Security reports should follow SECURITY.md.
