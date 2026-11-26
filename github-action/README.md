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

## Day 5 candidate: installable composite action

The earlier development-only statements above describe Days 1–4. The root action.yml now wires the modules together. Use only a reviewed immutable action commit, a trusted pull_request_target workflow, a clean GitHub-hosted runner with Node 22, and a checkout of the trusted base (never the PR head). Fetch PR Git objects without checking them out. See examples/trusted-action-workflow.yml; replace the placeholder SHA before use. Do not execute PR scripts or use PR-controlled configuration. The example is read-only and comments are disabled by default. To enable same-repository comments, add job permission pull-requests: write, pass comment: 'true', token: ${{ github.token }}, and author-id from trusted repository configuration (the verified bot numeric ID). Serialize per PR. Forks receive summaries only. Do not use secrets or other privileged steps in this workflow. A separate unprivileged analysis job is recommended before broad production adoption; this candidate does not implement cross-job artifact provenance. Treat the parser as an untrusted-input attack surface. No live GitHub validation has been performed. The action exits 1 for a blocked gate and 2 for execution errors. Run node --test test/github-action-run.test.js and npm test before release.

## Day 6: separated workflow candidate

For this repository, copy `examples/separated-action-workflow.yml` into `.github/workflows/pgsafe-separated.yml` after merging the implementation into the trusted base branch. This example uses the repository's own engine, not an external consumer action. The analysis job has read-only permissions and reads PR Git objects without checkout. The publisher runs on a fresh runner with no npm install and receives a bounded, canonical report through same-run job outputs. Repository, PR, base/head SHA, run ID and attempt must match the event. This is workflow provenance, not a cryptographic attestation or protection against a compromised analysis runner. Do not enable comments until the workflow and trusted base branch are reviewed. Set repository variables PGSAFE_ENABLE_COMMENTS=true and PGSAFE_BOT_ID to the verified numeric bot ID to opt in. Forks remain summary-only. The gate fails on missing output or analysis failure; blocked reports can still be published. Rerun all jobs rather than only failed jobs because attempt matching rejects old outputs. Oversized reports fail closed. Do not require the optional publisher job as the migration gate. A pull_request_target check may not attach to the PR head for branch protection; validate this separately before relying on it as a required check. The older composite action remains available but its combined publishing mode is not recommended for production.

The ORM verification workflow runs actual Prisma and Drizzle migrations on disposable PostgreSQL 16 with no write permissions. Run it in GitHub Actions to verify live behavior. No production database is required. Neither the live workflow nor ORM execution has been verified in the packaging environment.
