# PG Safe Migrate — Week 3, safety-first roadmap

This is a development plan, not a claim that these features have shipped.

## Day 1: Baseline and CI safety-gate design
- Preserve existing rule IDs and severity defaults; avoid introducing false blocking failures.
- Define a machine-readable policy for advisory vs blocking diagnostics.
- Add tests covering severity overrides, unknown lock classifications, transaction restrictions and CLI exit codes.
- Confirm existing JSON and SARIF outputs remain backward compatible.

## Day 2: Policy-gate implementation
- Add opt-in CI gate for selected rules and severity thresholds.
- Return stable, documented exit codes for blocked, advisory-only, and invalid-config cases.

## Day 3: Change-aware review
- Improve migration selection for pull requests and newly changed SQL files.
- Verify staged, unstaged, and branch-diff behavior on Windows and Linux.

## Day 4: Operational context
- Extend advisory risk interpretation with explicitly provided table size and PostgreSQL version.
- Never label unknown data as proven safe.

## Day 5: Developer experience
- Surface policy-gate explanations in CLI output and VS Code diagnostics.
- Keep Quick Fix guidance non-destructive and opt-in.

## Day 6: Documentation and CI examples
- Add copy-paste GitHub Actions examples, troubleshooting, and realistic failure samples.

## Day 7: Release readiness
- Run unit tests, release smoke tests, Docker PostgreSQL matrix and VSIX standalone verification.
- Publish only after reviewing package contents and confirming versions/tags.

## Growth track in parallel
- Update package metadata without changing published version numbers.
- Add a concise README section, screenshots, a real demo and a Sukoaa landing page.
- Measure real users/feedback separately from automated npm downloads.
