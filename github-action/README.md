# PGSAFE GitHub Action — development foundation

Day 1 is a validation module, not an installable GitHub Action. No action.yml or published action exists yet.

Inputs: postgres-version (10–99, default 16; same range as CLI static analysis), fail-on (error/warning/none), advisor (true/false), preset (recommended/strict), mode (changed/all). All values are strings. Defaults apply to omitted values, not invalid empty strings. The future action adapter must map omitted inputs to defaults.

## Security architecture

Use a pinned trusted engine and action revision. Analyze PR SQL as data in an unprivileged job with contents: read, no secrets, no persisted checkout credentials. Do not run PR package scripts or load executable PR configuration. Changed mode must use verified base/head commits, bounded regular SQL files and reject symlinks/path escapes. All mode must have explicit bounded discovery. Do not reuse the current CLI changed-file helper unchanged for this boundary: it includes working-tree changes and follows file symlinks. Use trusted policy/configuration for enforced gates; PR-controlled policy cannot be an independent gate.

The later comment publisher must run trusted code only, validate report schema, size, origin, repository, PR and head SHA, sanitize Markdown, and use minimal pull-requests write permission. Never checkout or execute PR code in a privileged workflow. Reports are advisory; no downtime guarantee. A missing or invalid report must not become a pass. No comment publishing, discovery, execution, or security isolation is implemented by this patch.

## Test

`node --test test/github-action-inputs.test.js`

## Day 4 publisher (development module)

`publishReport({repository, pr, head, report, authorId, token, dryRun})` accepts a report from a trusted caller, augmented with repository and PR number. The caller must establish artifact provenance, supply the authenticated bot's numeric user ID from trusted configuration, and serialize jobs per PR. The publisher checks the live PR head twice, skips forks, selects only comments belonging to that bot, and never retries POST. Dry run returns rendered Markdown without network access. HTTP permission failures throw; they are not successful publication. GitHub.com only.

This module is not an installable action. Trusted workflow wiring, authenticated identity establishment, artifact provenance verification and live GitHub integration tests remain required. Do not pass untrusted artifacts directly to this module or run PR code with a write token. A head update between the last check and the write remains possible; the report identifies the analyzed commit.

Test: `node --test test/github-action-publish.test.js test/github-action-report.test.js`.
