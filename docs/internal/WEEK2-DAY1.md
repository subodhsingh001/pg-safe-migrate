# Week 2, Day 1: PostgreSQL lock-risk inventory

Adds conservative lock classifications and impact categories to the existing
`lockFor()` API, used by migration analysis and combined assessments.

Covered: TRUNCATE, ALTER TABLE, DROP TABLE, rename, regular/concurrent index
creation, VACUUM (conservatively), INSERT, UPDATE and DELETE. Unclassified
operations remain `unknown`, not safe.

These are table-level lock planning hints, not downtime predictions. PostgreSQL
lock modes, duration, conflicts, row-level contention and behavior vary with
subcommands, transaction boundaries and workload. In particular, VACUUM FULL
requires a stronger lock than ordinary VACUUM and should be reviewed manually.

Run `npm ci` and `npm run test:unit` locally. Run the full `npm test` with Docker
Desktop running before merging or publishing. This change is development-only;
do not release as v0.5.0 until the complete Week 2 work is verified.
