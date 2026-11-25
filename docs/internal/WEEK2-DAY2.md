# Week 2 Day 2 — safer migration recommendations

The `advise()` result now optionally includes an `alternative` object containing
`title`, `sql`, `caveat` and `automatic: false`. Existing `ruleId`, `steps`,
and `note` fields are preserved for compatibility.

Templates cover PG001, PG003, PG004, PG005, PG010, PG012, PG013, PG023,
PG024 and PG025. They are illustrative and **must not be executed directly**:
identifiers and data policies are placeholders. The extension and CLI never
apply these templates automatically. PostgreSQL version, application writes,
locks, runner transactions, constraint eligibility and data quality matter.

Run `npm ci`, `npm run test:unit`, and (with Docker running) `npm test`.
Do not publish until the full suite passes and a release is approved.
