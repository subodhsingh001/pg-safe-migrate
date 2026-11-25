> **Published npm CLI: v2.5.0.** **VS Code extension: v0.6.0.** Week 3 CI policy gates and risk-baseline features are included in the published CLI. Migration analysis does not guarantee zero downtime.

# pg-safe-migrate

**Catch risky PostgreSQL migrations before they reach production.**

An open-source, AST-based PostgreSQL migration risk linter for **Prisma, Drizzle, and raw SQL**.

Detect risky PostgreSQL DDL patterns and provide additional framework-specific migration advisories.

**Features:** PostgreSQL AST parsing · PG001–PG017 identifiers (see rule coverage below) · Git-diff mode · JSON/SARIF · configurable severity · optional advisor · GitHub Actions

> **Important:** This tool identifies configured migration risks. It does not guarantee zero downtime.

## Demo

See how `pg-safe-migrate` catches an unsafe PostgreSQL migration and suggests a safer alternative.

![pg-safe-migrate CLI demonstration](assets/pg-safe-migrate-demo.gif)

### Example

Unsafe migration:

```sql
CREATE INDEX idx_users_email ON users(email);
```

Detected issue:

```text
[PG001] CREATE INDEX on "users" acquires a SHARE lock and blocks writes.

Fix: Use CREATE INDEX CONCURRENTLY and execute outside a transaction block.

Found 1 blocking migration issue(s).
```

Safer alternative:

```sql
CREATE INDEX CONCURRENTLY idx_users_email ON users(email);
```

`CREATE INDEX CONCURRENTLY` must run outside a transaction block.


## Week 3: opt-in CI policy gate

Run a deterministic, policy-driven static lint check in CI:

```bash
node bin/cli.js db/migrations --gate-policy examples/week3-gate-policy.json --fail-on none
```

The gate can block selected `PGxxx` rules, excessive warnings, and heuristic risk scores. It reports a block to stderr and exits with code `1`; malformed configuration exits `2`. This feature is included in the published v2.5.0 CLI. See [Week 3 implementation notes](WEEK3-DAY1-IMPLEMENTED.md).

[Install from npm](https://www.npmjs.com/package/@subodh001/pg-safe-migrate) · [Install the VS Code extension](https://marketplace.visualstudio.com/items?itemName=sukoaa.pg-safe-migrate-vscode) · [Report an issue](https://github.com/subodhsingh001/pg-safe-migrate/issues)

## Adoption and developer resources

- [Safe onboarding and CI troubleshooting](docs/ADOPTION-GUIDE.md)
- [Short demonstration recording script](docs/DEMO-SCRIPT.md)
- [Proposed npm and VS Code Marketplace copy](docs/MARKETPLACE-COPY.md)

**Release note:** The Week 3 policy, baseline, production-context, and PR reporting features are included in published npm v2.5.0. Review the policy and baseline before enabling blocking checks; passing a static gate is not a downtime guarantee.

## Installation

Install as a development dependency:

```bash
npm install --save-dev @subodh001/pg-safe-migrate
```

Or execute the published package without installing it in your project:

```bash
npx --yes --package=@subodh001/pg-safe-migrate@2.5.0 pg-safe-migrate --help
```

## Quick start

### Automatically detect migrations

```bash
npx pg-safe-migrate
```

The CLI searches these directories:

- `prisma/migrations`
- `drizzle`
- `migrations`
- `db/migrations`

### Prisma

```bash
npx pg-safe-migrate prisma/migrations
```

### Drizzle

```bash
npx pg-safe-migrate drizzle
```

### Raw SQL

```bash
npx pg-safe-migrate db/migrations
```

### Check a specific migration

```bash
npx pg-safe-migrate path/to/migration.sql
```

### Check changed migrations only

```bash
npx pg-safe-migrate --changed origin/main
```

Without a base reference, `--changed` checks staged, unstaged, and untracked SQL files. With a base reference, it additionally checks branch changes.

For pull requests, fetch the base branch first. Use `fetch-depth: 0` in GitHub Actions.

## PostgreSQL migration rules

| Rule | Detected pattern | Potential risk |
|---|---|---|
| **PG001** | CREATE INDEX without CONCURRENTLY | Blocks writes during index creation |
| **PG002** | DROP COLUMN | Breaks older application versions |
| **PG003** | ALTER COLUMN TYPE | Strong locks and possible table rewrites |
| **PG004** | ADD COLUMN NOT NULL without DEFAULT | Backfill and compatibility risks |
| **PG005** | ADD FOREIGN KEY without NOT VALID | Validation may block writes |
| **PG006** | RENAME | Breaks applications expecting old names |

Additional rule IDs in v2.0.0:

| Rule | Detected pattern | Interpretation |
|---|---|---|
| **PG007** | DROP INDEX without CONCURRENTLY | Potential blocking |
| **PG008** | CONCURRENTLY inside an explicit SQL transaction | PostgreSQL rejects this operation |
| **PG010** | ADD UNIQUE constraint | Potential blocking index build |
| **PG011** | DROP TABLE | Destructive change |
| **PG012** | Validated CHECK constraint | May scan existing rows |
| **PG013** | SET NOT NULL | Strong lock and potential scan |
| **PG014** | ADD COLUMN with DEFAULT on PostgreSQL 10 | Version-specific rewrite risk |
| **PG015** | Prisma CONCURRENTLY | Advisory: use a standalone migration; verified with Prisma 6.19.x `migrate deploy` |
| **PG016** | Drizzle CONCURRENTLY | Advisory: tested Drizzle 0.44.x node-postgres migrator wraps migrations in a transaction, preventing this operation |
| **PG017** | Cross-file rename/drop dependency | Heuristic advisory |

PG009 is not implemented; rule identifiers are not contiguous. PG015–PG017 default to warnings, including when the standard global severity is `error`. Override an individual advisory with `rules.PG015`, `rules.PG016`, or `rules.PG017` in the configuration. `--fail-on error` only determines the CLI exit threshold, not rule classification.

Example configuration (`pg-safe-migrate.config.json`):

```json
{
  "severity": "error",
  "postgresVersion": 16,
  "rules": { "PG015": "warning", "PG016": "warning" },
  "exclude": ["archive"]
}
```

Report options: `--format text|json|sarif`, `--output <file>`, `--advisor`, `--postgres-version <major>`, and `--fail-on warning|error|none`.

Each finding includes a description of the risk and a suggested safer migration approach.

A passing result means no configured patterns were detected, not that a migration is guaranteed to be safe.

## GitHub Actions integration

Automatically check migration files during pull requests.

Copy the [example consumer workflow](https://github.com/subodhsingh001/pg-safe-migrate/blob/main/examples/consumer-workflow.yml) into your application's repository:

```text
.github/workflows/pg-safe-migrate.yml
```

The workflow checks changed SQL migrations so teams can adopt the linter without immediately rewriting historical migrations.

For reproducible builds, pin the package to a reviewed version and upgrade deliberately.

## Verify the published CLI

From a clean directory, run:

```bash
npx --yes --package=@subodh001/pg-safe-migrate@2.5.0 pg-safe-migrate --help
```

Create a file named `unsafe.sql`:

```sql
CREATE INDEX idx_users_email ON users(email);
```

Then execute:

```bash
npx --yes --package=@subodh001/pg-safe-migrate@2.0.0 pg-safe-migrate unsafe.sql
```

Expected behavior: PG001 is reported and the CLI exits with code `1`.

The included `examples/safe.sql` demonstrates concurrent index creation and should pass PG001.

## Development

Clone the repository:

```bash
git clone https://github.com/subodhsingh001/pg-safe-migrate.git
cd pg-safe-migrate
```

Install dependencies:

```bash
npm ci
```

Run tests:

```bash
npm test
```

Test the rule engine:

```bash
node bin/cli.js test/unsafe_migration.sql
```

Check the npm package:

```bash
npm pack --dry-run
```

## Current release

**v2.0.0**

- Expanded PostgreSQL migration risk checks and framework advisories
- PostgreSQL AST-based parsing
- Prisma and Drizzle migration directory detection
- Git-diff mode
- GitHub Actions support
- JSON/SARIF reports and optional advisor
- Configurable severity, exclusions, and PostgreSQL-version guidance
- Actionable migration recommendations

[View npm package](https://www.npmjs.com/package/@subodh001/pg-safe-migrate) · [View GitHub releases](https://github.com/subodhsingh001/pg-safe-migrate/releases) · [Report an issue](https://github.com/subodhsingh001/pg-safe-migrate/issues)

## Limitations

`pg-safe-migrate` is a static AST-based PostgreSQL migration linter. Static linting is not a migration execution simulator.

### Parser and diagnostic capabilities

The current development version includes:

- Unicode-aware diagnostic positions with UTF-16 editor coordinates.
- Windows CRLF and Unix LF compatibility.
- Single-line and nested block comment handling.
- Dollar-quoted and escaped string handling.
- Explicit transaction tracking, including savepoints and chained transactions.
- PostgreSQL syntax error detection.

These parser improvements are development changes and are not yet included in the published npm v2.5.0 release.

### Static analysis boundaries

Static linting does not:

- Connect to your production database.
- Estimate actual lock waiting times.
- Validate rollback procedures.
- Inspect live database schemas.
- Comprehensively analyze SQL inside PL/pgSQL functions, stored procedures or anonymous DO blocks.
- Resolve dynamically generated SQL.
- Analyze SQL embedded inside JavaScript or TypeScript files.
- Detect every application-managed or ORM-managed transaction.
- Guarantee zero downtime or production migration safety.

Some flagged operations may be acceptable under controlled conditions. Some unflagged operations may still cause downtime.

Optional database inspection and disposable PostgreSQL simulation are separate capabilities with their own limitations.

Always consider PostgreSQL version, table size, transaction behavior, lock timeouts, long-running transactions and application deployment sequencing.

Validate migrations against a representative PostgreSQL environment before production deployment.

## Validation and real ORM runners

The repository includes a curated SQL regression suite (`test/real-world-cases.test.js`) and an opt-in integration runner (`scripts/orm-runner/verify.mjs`) using a disposable PostgreSQL database. On 2026-11-17 the maintainer verified that Prisma 6.19.x `migrate deploy` applied a **standalone** `CREATE INDEX CONCURRENTLY` migration; the tested Drizzle ORM 0.44.x node-postgres migrator rejected the same operation inside its transaction with PostgreSQL error `25001`. The runner asserts both outcomes and checks that temporary schemas are cleaned up. See `scripts/orm-runner/README.md` and `RELEASE-VERIFICATION.md`. These observations are version- and runner-specific and do not establish a production false-positive rate.

## Contributing

Contributions, bug reports, PostgreSQL edge cases, and suggestions for additional safety rules are welcome.

Open an issue or submit a pull request on GitHub.

## License

MIT License.

## v2.0 features

- `--postgres-version 10` enables PostgreSQL-10-specific default-column rewrite warnings; version 11+ does not trigger that rule. This is a targeted version check, not complete PostgreSQL-version simulation.
- `--advisor` gives Prisma/Drizzle/raw-SQL-aware deployment guidance. Recommendations are advisory and do not inspect the live database.
- Cross-file analysis checks files in lexicographic order and warns on selected operations involving tables changed earlier. This is a heuristic, not a dependency graph.
- Transaction analysis uses parsed SQL statements, avoiding comment/string false positives from keyword matching. It cannot know whether an external ORM runner wraps a migration in a transaction.
- JSON and SARIF outputs include source locations when the PostgreSQL parser supplies statement offsets.
- `examples/consumer-workflow.yml` illustrates GitHub code-scanning SARIF upload and policy enforcement. GitHub code-scanning availability and permissions depend on repository settings and plan.

### Examples

```bash
node bin/cli.js prisma/migrations --postgres-version 16 --advisor
node bin/cli.js db/migrations --format json --output report.json
node bin/cli.js --changed origin/main --format sarif --output report.sarif --fail-on none
```

### Known gaps

The analyzer does not connect to PostgreSQL, determine real table sizes, model application compatibility, or prove migrations are safe. Prisma and Drizzle transaction behavior depends on the actual runner and configuration. SARIF code-scanning upload is optional and needs GitHub security permissions.

### Experimental: read-only database catalog snapshot

The opt-in `--inspect-db` mode returns PostgreSQL major version, approximate table row counts and table sizes as JSON. It **does not execute migrations** or assess production safety. Install the optional `pg` dependency in your project and provide a least-privilege connection URL:

```powershell
npm install pg
$env:DATABASE_URL = 'postgresql://readonly_user:password@127.0.0.1:5432/testdb'
node bin/cli.js --inspect-db
```

This mode uses a read-only transaction, catalog queries, a five-second statement timeout and a 50-table default limit. Do not use privileged production credentials. Real-database integration testing remains outstanding.

### Experimental disposable PostgreSQL simulation

To check whether a SQL migration executes against an **empty disposable PostgreSQL database** (requires local Docker and a locally available PostgreSQL image):

```sh
node bin/cli.js --simulate examples/safe.sql --postgres-version 16
node bin/cli.js --simulate examples/unsafe.sql --postgres-version 16 --simulate-timeout 60
```

The simulator launches a new `postgres:14` through `postgres:18` container, disables its network, limits memory/CPU/processes, does not mount host files or use `DATABASE_URL`, runs SQL via `docker exec -i`, and forcibly removes the container afterward. Docker images may be downloaded automatically. **Do not use it as a sandbox for hostile code:** Docker isolation is not a hardened security boundary. Run only migrations from trusted contributors, preferably on a dedicated CI runner. Simulation against an empty database cannot predict production locks, data-dependent failures, rollback success, or downtime. It never runs against a real database. A nonzero exit code indicates SQL execution failure (1) or a tool/runtime error (2).

### Docker simulator with baseline and ordered migrations (experimental)

The simulator starts a disposable PostgreSQL container without published ports or external networking.
Use a baseline to create tables that a migration expects:

```cmd
node bin/cli.js --simulate examples/safe.sql --baseline examples/baseline.sql --postgres-version 16
node bin/cli.js --simulate examples/unsafe.sql --baseline examples/baseline.sql --postgres-version 16
```

Run all top-level `.sql` files in a folder in lexicographic filename order:

```cmd
node bin/cli.js --migrations-dir path/to/migrations --baseline examples/baseline.sql --postgres-version 16
```

Each JSON result contains a `steps` array with distinct `baseline` and `migration` stages. Execution stops on the first failure, and the disposable container is removed. This is a functional smoke test, **not** a guarantee of production safety, downtime, data preservation, or rollback. A successful `unsafe.sql` simulation does not mean the migration is safe.

The directory mode processes only top-level `.sql` files (maximum 100); nested ORM-specific migration directories are not automatically traversed.

## Consolidated experimental development capabilities

See [ALL-MILESTONES-TESTING.md](ALL-MILESTONES-TESTING.md) for exact commands and verification limitations. `--assess` combines lint findings, lock classifications, heuristic risk score, deployment advice, Docker execution, optional `--verify-sql` assertions, and optional `--team-policy` checks. The Docker matrix script covers PostgreSQL 14–18 when Docker is available. `vscode-extension/` is a local VS Code extension prototype; team policy is a local JSON configuration, **not** a hosted team management service.

## Markdown migration report (Week 2 Day 6)

Run `pg-safe-migrate migrations --format markdown --risk --output migration-report.md` to generate an actionable Markdown report with rule IDs, locations, recommended actions, and an optional heuristic risk breakdown. This does not predict production downtime.
