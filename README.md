# PG Safe Migrate

**Catch risky PostgreSQL migrations before they reach production.**

Open-source, AST-based migration linting for Prisma, Drizzle, Flyway and raw SQL. Detect destructive changes, locking risks and transaction hazards before deployment.

[![npm version](https://img.shields.io/npm/v/pgsafe)](https://www.npmjs.com/package/pgsafe) [![VS Code](https://img.shields.io/visual-studio-marketplace/v/sukoaa.pg-safe-migrate-vscode)](https://marketplace.visualstudio.com/items?itemName=sukoaa.pg-safe-migrate-vscode) [![MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

[Product website](https://www.sukoaa.com/pg-safe-migrate) · [Rule reference](docs/RULES.md) · [VS Code](https://marketplace.visualstudio.com/items?itemName=sukoaa.pg-safe-migrate-vscode) · [Report an issue](https://github.com/subodhsingh001/pg-safe-migrate/issues)

![CLI demonstration](https://raw.githubusercontent.com/subodhsingh001/pg-safe-migrate/main/assets/pg-safe-migrate-demo.gif)

## Quick start

Requires Node.js 18 or later; use a maintained Node.js release for new installations.

```sh
npx pgsafe
```

Or install in your project:

```sh
npm install --save-dev pgsafe
npx --no-install pgsafe prisma/migrations --advisor
```

Use `drizzle`, `db/migrations` or a specific SQL file instead of `prisma/migrations`. With no path, the CLI detects common migration directories.

### Example

```sql
ALTER TABLE users DROP COLUMN email;
```

```text
unsafe.sql:1:1 [PG002] error: Dropping column "users.email" can break older application instances.
```

Remove application references before dropping the column in a later deployment. A passing lint check is not a guarantee of zero downtime.

### Existing installations

The standalone `pgsafe` package replaces the wrapper starting in 2.7.1. Existing scoped releases remain available. To migrate a project, uninstall `@subodh001/pg-safe-migrate` and install `pgsafe`; do not install both packages in the same project because both expose `pg-safe-migrate`. The legacy executable and configuration filename remain supported.

## GitHub Actions

Save as `.github/workflows/migration-lint.yml`:

```yaml
name: PostgreSQL migration safety
on:
  pull_request:
    paths:
      - '**/*.sql'
permissions:
  contents: read
jobs:
  migrations:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          persist-credentials: false
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - name: Check changed SQL
        env:
          BASE_REF: ${{ github.base_ref }}
        run: npx --yes pgsafe@2.7.1 --changed "origin/$BASE_REF" --fail-on error
```

Start with reporting-only mode (`--fail-on none`) if introducing linting into an existing project. Review findings before enforcing a gate. See the [adoption guide](docs/ADOPTION-GUIDE.md).

## What it detects

| ID | Diagnostic | Default | Guidance |
|---|---|---|---|
| PG001 | Non-concurrent index creation | error | Use CREATE INDEX CONCURRENTLY outside a transaction. |
| PG002 | Dropping a column | error | Deprecate consumers before removing the column. |
| PG003 | Changing a column type | error | Check binary compatibility; consider expand/backfill/contract. |
| PG004 | Adding NOT NULL column without default | error | Add nullable, backfill, then enforce NOT NULL. |
| PG005 | Adding validated foreign key | error | Add NOT VALID then VALIDATE CONSTRAINT separately. |
| PG006 | Renaming an object | error | Use an expand/contract deployment. |
| PG007 | Dropping index without CONCURRENTLY | error | Use DROP INDEX CONCURRENTLY where supported. |
| PG008 | Concurrent index operation inside transaction | error | Run outside BEGIN/COMMIT. |
| PG010 | Adding UNIQUE constraint | error | Consider a concurrent unique index and attach it where applicable. |
| PG011 | Dropping a table | error | Verify retention and application dependencies. |
| PG012 | Adding validated CHECK constraint | error | Add NOT VALID and validate separately. |
| PG013 | Legacy SET NOT NULL diagnostic (superseded by PG025) | error | Validate an equivalent CHECK constraint first. |
| PG014 | Adding column with default on PostgreSQL 10 | error | Use controlled backfill or evaluate upgrading PostgreSQL. |
| PG015 | Prisma concurrent index migration | warning | Use a separately managed nontransactional migration. |
| PG016 | Drizzle concurrent index migration | warning | Use a separately managed nontransactional migration. |
| PG017 | Potential cross-file dependency or Flyway transaction advisory | warning | Review migration order; this is a heuristic. |
| PG019 | MERGE requires PostgreSQL 15+ | error | Use a compatible INSERT ... ON CONFLICT pattern where applicable. |
| PG020 | UNIQUE NULLS NOT DISTINCT requires PostgreSQL 15+ | error | Use a version-compatible uniqueness strategy. |
| PG021 | Volatile default may rewrite table | error | Add column, backfill in batches, then set default. |
| PG022 | SET LOGGED rewrites table | error | Schedule controlled maintenance and evaluate alternatives. |
| PG023 | TRUNCATE removes table rows | error | Confirm retention, backups and downstream dependencies. |
| PG024 | Dropping a constraint | error | Review dependent queries and data-integrity requirements. |
| PG025 | SET NOT NULL may scan table | error | Backfill and validate a CHECK constraint first where appropriate. |

See the [full rule reference](docs/RULES.md) for defaults, version constraints and legacy identifiers. PG013 is superseded by PG025; PG009 and PG018 are unused.

## Reporting and configuration

Example configuration (`pg-safe-migrate.config.json`):

```json
{
  "severity": "error",
  "postgresVersion": 16,
  "rules": { "PG015": "warning", "PG016": "warning" },
  "exclude": ["archive"]
}
```

Report options: `--format text|json|sarif|markdown`, `--output <file>`, `--advisor`, `--postgres-version <major>`, and `--fail-on warning|error|none`.

Each finding includes a description of the risk and a suggested safer migration approach.

A passing result means no configured patterns were detected, not that a migration is guaranteed to be safe.


## Inline Rule Suppression

Introduced in v2.7.0, inline suppression allows teams to acknowledge reviewed migration risks without disabling an entire safety rule.

Suppression is disabled by default.

### Enable suppression

Create or update `pg-safe-migrate.config.json`:

```json
{
  "suppression": {
    "enabled": true,
    "requireReason": true,
    "reportSuppressed": true,
    "protectedRules": ["PG011", "PG023"]
  }
}
```

### Suppress a reviewed finding

```sql
-- pg-safe-migrate-disable-next-line PG002 -- reason: DBA approved after application compatibility review
ALTER TABLE users DROP COLUMN legacy_email;
```

The directive applies only to the immediately following SQL statement.

Multiple rule IDs can be specified using commas.

### Built-in safeguards

- Mandatory suppression reasons.
- PostgreSQL AST-based statement targeting.
- SQL-aware comment scanning.
- Protected rule enforcement.
- Unknown rule detection.
- Rejected and unused directive reporting.
- Fail-closed handling of ambiguous SQL scanning.
- Audit reporting in terminal, JSON, SARIF and Markdown.
- Suppression-aware VS Code diagnostics.

### Generate an audit report

```sh
npx --no-install pgsafe migrations \
  --config pg-safe-migrate.config.json \
  --format json \
  --output migration-report.json
```

Suppressed findings remain available in the audit report.

### Enterprise Migration Governance

Teams can enforce additional suppression restrictions using a trusted gate policy.

Example `enterprise-policy.json`:

```json
{
  "name": "Production Migration Safety",
  "maxRiskScore": 60,
  "maxWarnings": 5,
  "blockedRules": ["PG002", "PG011", "PG023"],
  "suppression": {
    "protectedRules": ["PG008", "PG011", "PG023"],
    "maxSuppressedFindings": 2,
    "failOnRejected": true,
    "failOnUnused": true
  }
}
```

Run the enterprise gate:

```sh
npx --no-install pgsafe migrations \
  --config pg-safe-migrate.config.json \
  --gate-policy enterprise-policy.json \
  --format json \
  --output migration-report.json
```

Enterprise enforcement:

- Prevents suppression of blocked and protected rules.
- Includes suppressed findings in risk calculations.
- Enforces suppression limits.
- Rejects project exclusions and severity-weakening overrides.
- Can block a migration even when `--fail-on none` is supplied.

Use a separate trusted configuration for enterprise gates. Do not reuse ordinary lint configurations containing exclusions or warning/off rule overrides.

The CLI, policy, configuration and CI workflow must come from trusted sources.

### VS Code Integration

The PG Safe Migrate extension supports inline suppression through workspace configuration.

- Suppressed findings are removed from active diagnostics.
- Protected findings remain visible.
- Suppression audit counts appear in the PG Safe Migrate Output channel.
- Disabling suppression restores the original findings.

### Limitations

- Suppression is not evidence of migration safety.
- Some combinations of suppression, risk baselines and combined simulation are not supported.
- Static analysis cannot guarantee zero downtime.

## Advanced capabilities

- [Advanced usage, simulation, database inspection and limitations](docs/advanced.md)
- [Adoption and CI troubleshooting](docs/ADOPTION-GUIDE.md)
- [Release history](CHANGELOG.md)
- [Verification commands](ALL-MILESTONES-TESTING.md)

## Development

```sh
npm ci
npm run test:release
npm pack --dry-run
```

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md). MIT licensed.

### Advanced rules (opt-in)

Enable individually in `pg-safe-migrate.config.json` under `rules` using `warning` or `error`. Existing presets do not enable these rules.

| Rule | Scope |
|---|---|
| PG026 | Visible positive lock_timeout before selected DDL; session and explicit transaction tracking is conservative. External settings, implicit runner transactions and dynamic SQL are not proven. |
| PG027 | Integer primary keys declared in CREATE TABLE; no existing schema or sequence inspection. |
| PG028 | Concurrent index operations in multi-statement Prisma migrations; advisory, not proof of transaction wrapping. |
| PG029 | Bounded varchar and timestamp without time zone in CREATE TABLE or ALTER column definitions; legitimate uses exist. |

Example: `{"rules":{"PG026":"warning","PG027":"warning","PG028":"warning","PG029":"warning"}}`.
