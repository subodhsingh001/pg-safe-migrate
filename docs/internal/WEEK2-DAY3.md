# Week 2 Day 3 — VS Code Quick Fix guidance

- CLI is invoked with `--advisor` so diagnostics retain Day 2 staged SQL examples.
- SQL diagnostics expose a `Quick Fix` action to view contextual deployment guidance.
- Where an illustrative SQL template exists, users can explicitly copy it to clipboard.
- No automatic edits or database operations are performed.
- Guidance is discarded when a document changes; stale lint results are ignored.

## Verify

`npm ci` then `npm run test:unit` and `npm test` (Docker Desktop required for the full matrix).

This is development work, not a Marketplace release.
