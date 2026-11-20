\## \[2.5.0] - 2026-11-20



\### Added

\- Configurable CI migration safety gates.

\- Reviewed migration risk baselines to distinguish new, existing, and resolved findings.

\- Production-aware migration recommendations using optional workload and table-size estimates.

\- GitHub Actions pull-request safety reporting.

\- Improved onboarding, examples, and adoption documentation.



\### Improved

\- JSON reporting for risk baselines, production context, and policy decisions.

\- Migration safety guidance for deployment planning.

\- Release-readiness verification and regression coverage.



\### Notes

\- Production context uses supplied estimates, not live database measurements.

\- Static analysis does not guarantee zero downtime.

\- Existing migration safety rules remain available.

