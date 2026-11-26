# PG Safe Migrate — adoption guide

PG Safe Migrate statically detects configured PostgreSQL migration risks. It does **not** run migrations, prove zero downtime, or replace a deployment review.

## 1. Try the published CLI

Requirements: Node.js 18+. Use the standalone CLI starting with v2.7.1.

```sh
npx --yes pgsafe@2.7.1 --help
npx --yes pgsafe@2.7.1 prisma/migrations
```

To evaluate policy functionality from a source checkout:

```sh
npm ci
node bin/cli.js examples/unsafe.sql --gate-policy examples/week3-gate-policy.json --fail-on none
```

Exit codes: `0` = no blocking result; `1` = configured blocking finding/gate; `2` = CLI/configuration error. A passing static check is not proof of production safety.

## 2. Adopt safely in an existing repository

1. Run static analysis without changing deployment permissions.
2. Review historical findings individually before generating or committing a risk baseline. A baseline is **not** blanket approval of risky SQL.
3. Add a team policy and test it against a known unsafe migration and a safe migration.
4. Use `--production-context` only with carefully reviewed, non-secret estimates. It does not connect to a production database.
5. Enable the Week 3 PR workflow on a feature branch. Inspect its **Actions job summary** and gate status in an actual pull request before making it a required check.
6. Make a blocking check required only after verifying expected behavior with your migration layout and policies.

## 3. What a PR report does

The development workflow `.github/workflows/week3-pr-safety.yml` analyzes changed SQL on pull requests. It optionally reads `examples/reviewed-risk-baseline.json` and `examples/week3-production-context.json` when present, and always applies `examples/week3-gate-policy.json`.

- New risks may block a PR under team policy.
- Reviewed baseline matches remain visible but can be excluded from new-risk enforcement.
- Production advisory context explains possible lock impact; it does not override gate decisions.
- The workflow writes a **GitHub Actions job summary**, not a pull-request comment.
- It needs only `contents: read` and does not connect to a database.

The workflow is triggered only for the paths in its `pull_request.paths` filter. Confirm those paths match your migration conventions. GitHub-hosted execution must be verified independently of local tests.

## 4. Example risk

```sql
CREATE INDEX idx_users_email ON users(email);
```

A regular `CREATE INDEX` can acquire a `SHARE` lock that blocks writes. A potential alternative is:

```sql
CREATE INDEX CONCURRENTLY idx_users_email ON users(email);
```

Concurrent index creation has its own operational requirements and cannot be run inside a transaction block. Validate framework transaction behavior and your rollout plan.

## 5. Common issues

| Symptom | Check |
| --- | --- |
| `Unknown option` for Week 3 flags | You are running published v2.4.0 rather than the development checkout |
| Gate blocks a previously reviewed finding | Confirm the baseline path, fingerprint, SQL content, and normalized migration path; changed files can be treated as new |
| Gate unexpectedly passes | Check whether `--fail-on none` is paired with a policy and whether the baseline excludes the finding |
| No PR workflow run | Check `.github/workflows/week3-pr-safety.yml` exists on the PR branch and the `paths` filter matches the changed files |
| Workflow has no report | Inspect the Analyze step, JSON output location, and job summary step |
| Production estimates seem wrong | Inspect the manually supplied JSON; no live production sampling occurs |
| VS Code extension does not lint | Check VS Code >=1.85, Node.js >=18 or `pgSafeMigrate.nodePath`, and that the file is `.sql` |

## 6. Trust and security

- Do not put database credentials or secrets in baseline or production-context JSON.
- Avoid uploading production SQL containing sensitive data to public issue trackers.
- Use staging and an approved deployment/rollback plan for real schema changes.
- File issues at https://github.com/subodhsingh001/pg-safe-migrate/issues with a minimal reproducible SQL example.
