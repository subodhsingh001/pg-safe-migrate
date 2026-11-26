# Changelog

## [2.9.0] — development candidate (not published)

- Add opt-in PG026–PG029 static advisories.
- Invoke npm CLI directly without a shell in release verification.
- Existing default rule behavior remains unchanged.


## [2.8.0] — release candidate (not published)

- Add installable repository-hosted GitHub Action with bounded Git-object analysis, PR reporting and optional comment publishing.
- Add separated publishing example and ORM verification workflow.
- Add release manifest checks. Live GitHub verification is required before stable release.


## [2.7.1]

- Make `pgsafe` the standalone npm engine instead of a wrapper.
- Preserve the `pg-safe-migrate` executable and configuration filename.
- Update installation documentation and consumer CI example.
- No changes to SQL analysis rules.

## [2.7.0]

### Added

- SQL-aware inline rule suppression.

- AST-based suppression targeting for individual SQL statements.

- Mandatory suppression reasons for auditability.

- Configurable protected migration safety rules.

- Suppression audit reporting in terminal, JSON, SARIF and Markdown formats.

- Enterprise suppression policies with configurable limits.

- Detection of rejected, unused and invalid suppression directives.

- Suppression-aware VS Code diagnostics and audit reporting.

### Security

- Protected rules cannot be suppressed through ordinary inline directives.

- Enterprise gates reject project exclusions and severity-weakening overrides.

- Suppressed findings remain included in enterprise risk calculations.

- Ambiguous SQL scanning fails closed.

### Verification

- 363 automated regression tests passed.

- Compatibility verified on Node.js 18, 20, 22 and 24.

- Repeated memory retention testing across 200,000 measured SQL statements.

- Performance benchmarks covering up to 10,000 SQL statements per workload.

### Compatibility and limitations

- Inline suppression is disabled by default.

- Enterprise gates now reject configurations that weaken rule severity or exclude files.

- Some combinations of suppression, risk baselines and combined simulation are not supported.

- Enterprise enforcement requires trusted CLI code, configuration, policies and CI workflows.

- Static migration analysis does not guarantee zero downtime.

## [2.6.0]

* Unicode-aware SQL positions, leading comment handling and transaction tracking for savepoints and chained transactions.
* Optimized statement position tracking.
* Corrected rule catalog coverage and default severity metadata (no enforcement changes).

## [2.5.0] - 2026-11-20

### Added

* Configurable CI migration safety gates.
* Reviewed migration risk baselines to distinguish new, existing, and resolved findings.
* Production-aware migration recommendations using optional workload and table-size estimates.
* GitHub Actions pull-request safety reporting.
* Improved onboarding, examples, and adoption documentation.

### Improved

* JSON reporting for risk baselines, production context, and policy decisions.
* Migration safety guidance for deployment planning.
* Release-readiness verification and regression coverage.

### Notes

* Production context uses supplied estimates, not live database measurements.
* Static analysis does not guarantee zero downtime.
* Existing migration safety rules remain available.
