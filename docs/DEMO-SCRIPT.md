# 60–90 second product demonstration script

Use a disposable example, not customer migrations.

**0–15s — Problem.** Show `CREATE INDEX idx_users_email ON users(email);` and explain that a non-concurrent index build can block writes.

**15–35s — Detect.** Run `node bin/cli.js examples/unsafe.sql --fail-on none` from the development checkout. Point to PG001 and the suggested alternative.

**35–55s — Gate.** Run `node bin/cli.js examples/unsafe.sql --gate-policy examples/week3-gate-policy.json --format json --fail-on none`; show `BLOCK` and exit 1.

**55–75s — Context.** Add `--production-context examples/week3-production-context.json` and show `production.assessments` explaining possible write impact. State that numbers are supplied estimates, not measured downtime.

**75–90s — PR.** Show an actual GitHub Actions job summary **only after** the workflow has run in a test PR. Explain that reviewed baselines can keep historical risks visible while surfacing new risks.

**Closing:** "Static migration review for PostgreSQL teams. No zero-downtime guarantee."

Recording checklist: legible terminal font; show actual commands and exit codes; blur personal paths/tokens; avoid unsupported claims; caption that Week 3 features are not yet published.
