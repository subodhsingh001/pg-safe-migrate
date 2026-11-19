# Week 2 Day 5 — Framework compatibility

Adds Flyway migration detection for `db/migration/*.sql` and versioned/repeatable Flyway SQL names, with transaction guidance for `CREATE INDEX CONCURRENTLY` (PG017). Keeps Prisma PG015 and Drizzle PG016 handling unchanged. Expands default migration root discovery to Flyway paths. Adds regression tests.

This is a development snapshot, not a Marketplace release. Flyway transaction behavior depends on configuration/version; always verify your runner settings. No SQL is executed or rewritten.

## Test

```powershell
npm ci
npm run test:unit
npm test
```

To test the VS Code extension, use the existing standalone build and verify commands in `vscode-extension`.
