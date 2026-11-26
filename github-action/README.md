# PGSAFE GitHub Action — development foundation

Day 1 is a validation module, not an installable GitHub Action. No action.yml or published action exists yet.

Inputs: postgres-version (10–99, default 16; same range as CLI static analysis), fail-on (error/warning/none), advisor (true/false), preset (recommended/strict), mode (changed/all). All values are strings. Defaults apply to omitted values, not invalid empty strings. The future action adapter must map omitted inputs to defaults.

## Security architecture

Use a pinned trusted engine and action revision. Analyze PR SQL as data in an unprivileged job with contents: read, no secrets, no persisted checkout credentials. Do not run PR package scripts or load executable PR configuration. Changed mode must use verified base/head commits, bounded regular SQL files and reject symlinks/path escapes. All mode must have explicit bounded discovery. Do not reuse the current CLI changed-file helper unchanged for this boundary: it includes working-tree changes and follows file symlinks. Use trusted policy/configuration for enforced gates; PR-controlled policy cannot be an independent gate.

The later comment publisher must run trusted code only, validate report schema, size, origin, repository, PR and head SHA, sanitize Markdown, and use minimal pull-requests write permission. Never checkout or execute PR code in a privileged workflow. Reports are advisory; no downtime guarantee. A missing or invalid report must not become a pass. No comment publishing, discovery, execution, or security isolation is implemented by this patch.

## Test

`node --test test/github-action-inputs.test.js`
