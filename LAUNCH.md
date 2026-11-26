# Launch copy (post only after GitHub URL and CI are verified)

## Show HN

**Title:** Show HN: pg-safe-migrate – PostgreSQL migration risk checks for Prisma and Drizzle

I built a small open-source CLI that parses PostgreSQL SQL migrations using libpg-query and flags risky migration patterns before deployment: non-concurrent indexes, dropped columns, type changes, non-null additions without defaults, foreign keys without NOT VALID, and renames.

It supports Prisma, Drizzle, raw SQL folders, and `--changed` to lint SQL files changed in a PR. It returns a nonzero exit code in CI and offers suggested mitigations. This is a static risk check, not a guarantee of zero downtime.

Try: `npx --yes pgsafe@2.7.1 --help`

GitHub: https://github.com/subodhsingh001/pg-safe-migrate (verify the link before posting)

I'd welcome examples of real migrations it misclassifies.

## Reddit / Dev.to

**Title:** I made an AST-based PostgreSQL migration linter for Prisma, Drizzle, and SQL

A seemingly simple migration can block writes or break older app versions. I built `pg-safe-migrate` to catch common risky patterns before they reach production. It uses PostgreSQL AST parsing rather than regex, supports `--changed` in PRs, and prints specific remediation guidance.

Install: `npm i -D pgsafe`

It's deliberately conservative, and passing does not guarantee safety. Feedback on PostgreSQL edge cases and ORM behavior is especially welcome.

GitHub: https://github.com/subodhsingh001/pg-safe-migrate (verify the link before posting)
