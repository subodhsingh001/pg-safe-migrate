## Catch risky PostgreSQL migrations before deployment

PG Safe Migrate analyzes PostgreSQL migration SQL and highlights potentially disruptive schema changes before deployment. Use the npm CLI locally or in CI, or review SQL files directly in VS Code.

**Install the CLI**

```bash
npm install --save-dev @subodh001/pg-safe-migrate
npx pg-safe-migrate --help
```

**Try the VS Code extension:** [PG Safe Migrate on the Marketplace](https://marketplace.visualstudio.com/items?itemName=sukoaa.pg-safe-migrate-vscode).

**Try an example:**

```sql
-- May block writes while building the index
CREATE INDEX idx_users_email ON users(email);

-- Often a less disruptive alternative, but must run outside a transaction block
CREATE INDEX CONCURRENTLY idx_users_email ON users(email);
```

**What it helps with:** PostgreSQL lock-risk guidance, migration lint rules, framework-aware advisories for Prisma/Drizzle/Flyway, explainable risk scoring, and machine-readable reporting for CI.

**Limitations:** Static analysis is not a guarantee of zero downtime. Review production table sizes, PostgreSQL version, concurrent workload, transaction behavior, and rollback plans before deployment.

[GitHub repository](https://github.com/subodhsingh001/pg-safe-migrate) · [npm CLI](https://www.npmjs.com/package/@subodh001/pg-safe-migrate) · [VS Code extension](https://marketplace.visualstudio.com/items?itemName=sukoaa.pg-safe-migrate-vscode)
