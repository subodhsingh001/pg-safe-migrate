# Week 2 Day 6 — Diagnostics and reporting

Added opt-in `--format markdown` with rule, severity, file, line, finding and recommended action. Supports optional `--risk` heuristic breakdown and clearly states its limitations. Existing text, JSON, SARIF, `--github` and `--summary` output are preserved.

Example:

```powershell
node bin/cli.js migrations --format markdown --risk --output migration-report.md
```

Run `npm ci`, `npm run test:unit`, and `npm test` (Docker Desktop required for the PostgreSQL matrix). Do not release until the complete suite and VS Code smoke checks pass.
