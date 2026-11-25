# Changelog

## [0.8.0]

### Added

- Statement-level inline rule suppression.

- Workspace suppression configuration support.

- Suppression-aware SQL diagnostics.

- Suppression audit reporting in the Output panel.

- Protected rule enforcement.

- Reporting of rejected and unused suppression directives.

### Improved

- Bundled CLI runtime updated to v2.7.0.

- Compatibility with enterprise migration safety policies.

- Regression coverage and standalone runtime verification.

### Notes

- Suppression is disabled by default.

- Suppression is not evidence of migration safety.

- Existing diagnostics, cancellation, timeout and workspace trust protections remain available.

## [0.7.0]

* Bounded lint scheduling, cancellation, timeout and output safeguards.
* Saved SQL file size limit and configurable concurrency.
* Unicode-aware diagnostics and improved transaction tracking.
* Restricted workspace support disabled; machine-scoped Node executable; no workspace ancestor CLI discovery.
* Expanded isolated runtime verification.

## 0.6.0

* Standalone bundled CLI and SQL diagnostics with advisory quick fixes.
