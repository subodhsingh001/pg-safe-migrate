# v2.0.0-rc.1 — development candidate (NOT production verified)

This candidate builds on the supplied v1.1.2 project and adds:
- Config file with per-rule off/warning/error, excludes, and PostgreSQL version metadata.
- JSON and SARIF reporting, output file, fail threshold and optional migration advisor.
- Two additional AST rules (PG007, PG011) and PG008 explicit transaction detection.
- Tests for configuration, reporting and advisor.

## Important limitations
- PostgreSQL version is stored but **not yet applied** to rule semantics.
- Transaction scanning uses a token matcher and may match comments/strings; it is not a reliable transaction-aware AST analysis.
- Locations in AST rule findings are fallback 1:1 and **not exact**.
- No cross-file analysis, GitHub PR annotation publisher, Prisma/Drizzle-specific guidance, or sandbox verification yet.
- Existing six rules are retained; no comprehensive false-positive benchmark has been performed.
- Dependency installation and full test suite could not be verified in this environment.

Do NOT publish this release candidate to npm or merge it to main without running tests and reviewing the limitations.

## Commands
```
npm ci
npm test
node bin/cli.js examples/unsafe.sql --format json
node bin/cli.js examples/unsafe.sql --format sarif --output report.sarif
node bin/cli.js examples/unsafe.sql --advisor
```
