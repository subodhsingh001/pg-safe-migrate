# Security policy

## Reporting

Use the repository [private vulnerability reporting page](https://github.com/subodhsingh001/pg-safe-migrate/security/advisories/new) if enabled. If unavailable, request a private reporting channel through a public issue without disclosing exploit details, credentials or customer SQL. Include affected version, environment and a minimal sanitized reproduction.

## Safety boundaries

Static linting does not execute migrations or guarantee downtime avoidance. Optional Docker simulation executes trusted SQL in disposable containers and is not a hostile-code sandbox. Database inspection requires least-privilege credentials. Do not submit secrets or production data. The extension file size and output limits are not hard process memory limits.

## Support

No formal support lifetime or response SLA is promised. Use the latest reviewed release and report reproducible security issues.
