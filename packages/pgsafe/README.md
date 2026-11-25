# pgsafe

PostgreSQL migration safety linter and risk advisor.

## Quick Start

```bash

npx pgsafe

```

Analyze a migration:

```bash

npx pgsafe migrations/

```

Get migration safety advice:

```bash

npx pgsafe migrations/ --advisor

```

Check changed migrations:

```bash

npx pgsafe --changed origin/main

```

Generate SARIF reports:

```bash

npx pgsafe migrations/ --format sarif --output report.sarif

```

## Features

- AST-based PostgreSQL migration analysis

- Destructive operation detection

- Migration safety advisor

- Auditable inline rule suppression

- Enterprise policy enforcement

- JSON, Markdown and SARIF reports

- Prisma and Drizzle migration detection

- CI/CD integration

- VS Code extension

## About

This package provides a shorter command for the official `@subodh001/pg-safe-migrate` engine.

Migration analysis helps identify risks but does not guarantee zero downtime.

- Website: https://www.sukoaa.com/pg-safe-migrate

- GitHub: https://github.com/subodhsingh001/pg-safe-migrate

## License

MIT
