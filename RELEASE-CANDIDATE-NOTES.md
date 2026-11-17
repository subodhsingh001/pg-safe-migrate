# 2.2.0 development candidate — verification limits

- Example migrations corrected to avoid duplicate index names.
- Combined assessment now inventories every parsed SQL statement and its heuristic lock mode, including statements without lint findings.
- Duplicate index definitions in the selected migration batch are flagged as PG018 and Docker simulation is skipped. This does not detect collisions with pre-existing database objects.
- VS Code extension source is bundled but is not marketplace-ready or extension-host verified.
- Team policy is local JSON, not a hosted multi-user management service.
- PostgreSQL 14–18 live Docker matrix was reported passing on the user's Windows machine for the prior build. This updated candidate requires rerunning the matrix.
- Full test suite cannot be executed in this environment because libpg-query is not installed and npm registry access timed out.

Run on Windows CMD:

    npm ci
    npm test
    node scripts\test-pg-matrix.cjs
    node bin\cli.js --assess --migrations-dir examples\migrations --baseline examples\baseline.sql --verify-sql examples\verify.sql --postgres-version 16 --team-policy examples\team-policy.json --output assessment.json

Do not publish until all tests, extension-host tests and npm package contents are reviewed.
