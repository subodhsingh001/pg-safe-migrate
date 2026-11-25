# Week 3 Day 1: opt-in static CI gate (development candidate)

New `--gate-policy path.json` accepts the existing team-policy JSON schema for **static lint mode only**.

- Blocks selected rule IDs (`blockedRules`), excessive warning counts (`maxWarnings`), or a heuristic risk score above `maxRiskScore`.
- Existing `--fail-on` behavior still applies. Gate blocks exit 1; invalid policy exits 2; successful check exits 0.
- Policy results go to stderr so JSON/SARIF/Markdown stdout schemas stay unchanged.
- `requireSimulation: true` is rejected in static mode. Use the existing `--assess --team-policy` path to require a real simulation.
- Does not guarantee safety, absence of blocking locks, or absence of downtime.

## Try locally

```sh
node bin/cli.js examples/unsafe.sql --gate-policy examples/week3-gate-policy.json --fail-on none
node bin/cli.js examples/safe.sql --gate-policy examples/week3-gate-policy.json --fail-on none
npm run test:unit
```

The GitHub Actions file `pg-safe-migrate-example.yml` is an **example for consumer repositories**; it is not automatically enabled as a publishing workflow.

## Growth work included

- Package and extension metadata already contain relevant PostgreSQL search terms; versions remain unchanged.
- README release information corrected and quick-start links added.
- Existing CLI functionality and release workflows retained.

## Verification limits

Four new gate unit tests pass in isolation. Full unit suite was attempted in the container but its dependencies were not available; install with `npm ci` and rerun locally. Do not publish until all checks pass.
