# Week 2 Day 4 — Explainable risk scoring

`src/risk.js` now returns a bounded breakdown for severity, destructive operations, strongest classified lock, optional transaction flag and optional supplied table statistics. `combinedAssessment` passes its operation inventory into scoring. No database queries are added. Scores remain heuristic and confidence stays low. Existing `summarizeRisk(findings)` calls remain supported.

Run `npm ci`, `npm run test:unit`, and `npm test` with Docker running. Do not publish v0.5.0 until full verification.
