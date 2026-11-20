# Marketplace and npm copy — proposed, not published

## npm short description

Detect risky PostgreSQL migrations before deployment with AST-based linting, lock guidance, CI reporting, and Prisma/Drizzle/Flyway support.

## GitHub repository description

PostgreSQL migration risk linter: detect unsafe DDL, explain lock impact, and review SQL changes in CI.

## VS Code Marketplace short description

PostgreSQL migration risk diagnostics and Quick Fix guidance directly in VS Code, powered by PG Safe Migrate.

## Marketplace highlights

- See SQL migration findings in the Problems panel.
- Lint `.sql` files on open/save and via Command Palette.
- Read guidance from the editor lightbulb; the extension does **not** automatically rewrite SQL.
- Bundled CLI runtime in the standalone extension; Node.js 18+ required.

## Screenshot plan

1. SQL editor showing a real PG001 diagnostic and Problems panel.
2. Quick Fix menu displaying guidance (not an automatic fix).
3. Settings for `pgSafeMigrate.autoLint` and `pgSafeMigrate.nodePath`.

Capture screenshots from the actual installed extension; do not create simulated UI screenshots and present them as real.

## Accurate version labeling

Published npm: v2.4.0. Previously reported VS Code release: v0.5.0; confirm live Marketplace listing before updating marketing materials. Week 3 Day 1–5 features are development candidates until separately released and verified.

## Discovery keywords

PostgreSQL migration, Prisma migration, Drizzle migration, SQL lint, migration safety, PostgreSQL locks, CI migration checks, schema change review.

Avoid promises of guaranteed zero downtime, automated remediation, live production measurements, or fully automatic safe deployment.
