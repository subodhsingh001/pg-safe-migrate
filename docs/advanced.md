# Advanced usage and limitations

## Limitations

`pg-safe-migrate` is a static AST-based PostgreSQL migration linter. Static linting is not a migration execution simulator.

### Parser and diagnostic capabilities

Version v2.6.0 includes:

- Unicode-aware diagnostic positions with UTF-16 editor coordinates.
- Windows CRLF and Unix LF compatibility.
- Single-line and nested block comment handling.
- Dollar-quoted and escaped string handling.
- Explicit transaction tracking, including savepoints and chained transactions.
- PostgreSQL syntax error detection.

These parser improvements are included in v2.6.0. Large SQL inputs can consume substantial memory; static analysis has no hard process memory cap.

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

The repository includes a curated SQL regression suite (`test/real-world-cases.test.js`) and an opt-in integration runner (`scripts/orm-runner/verify.mjs`) using a disposable PostgreSQL database. On 2026-11-17 the maintainer verified that Prisma 6.19.x `migrate deploy` applied a **standalone** `CREATE INDEX CONCURRENTLY` migration; the tested Drizzle ORM 0.44.x node-postgres migrator rejected the same operation inside its transaction with PostgreSQL error `25001`. The runner asserts both outcomes and checks that temporary schemas are cleaned up. See `scripts/orm-runner/README.md` and `docs/internal/RELEASE-VERIFICATION.md`. These observations are version- and runner-specific and do not establish a production false-positive rate.

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

See [ALL-MILESTONES-TESTING.md](../ALL-MILESTONES-TESTING.md) for exact commands and verification limitations. `--assess` combines lint findings, lock classifications, heuristic risk score, deployment advice, Docker execution, optional `--verify-sql` assertions, and optional `--team-policy` checks. The Docker matrix script covers PostgreSQL 14–18 when Docker is available. `vscode-extension/` provides a standalone VS Code extension; team policy is a local JSON configuration, **not** a hosted team management service.

## Markdown migration report (Week 2 Day 6)

Run `pg-safe-migrate migrations --format markdown --risk --output migration-report.md` to generate an actionable Markdown report with rule IDs, locations, recommended actions, and an optional heuristic risk breakdown. This does not predict production downtime.
