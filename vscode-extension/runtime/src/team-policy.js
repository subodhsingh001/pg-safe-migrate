import fs from 'node:fs';
import { getRule } from './rules/ruleCatalog.js';

export function loadTeamPolicy(file) {
  const policy = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) throw new Error('Team policy must be a JSON object');
  const allowed = ['name', 'maxRiskScore', 'maxWarnings', 'blockedRules', 'requireSimulation', 'suppression'];
  for (const key of Object.keys(policy)) if (!allowed.includes(key)) throw new Error(`Unknown team policy key: ${key}`);
  if (policy.name !== undefined && (typeof policy.name !== 'string' || !policy.name.trim() || policy.name.length > 100)) throw new Error('name must be a nonempty string of at most 100 characters');
  if (policy.maxRiskScore !== undefined && (!Number.isInteger(policy.maxRiskScore) || policy.maxRiskScore < 0 || policy.maxRiskScore > 100)) throw new Error('maxRiskScore must be 0-100');
  if (policy.maxWarnings !== undefined && (!Number.isInteger(policy.maxWarnings) || policy.maxWarnings < 0)) throw new Error('maxWarnings must be >= 0');
  if (policy.blockedRules !== undefined && (!Array.isArray(policy.blockedRules) || policy.blockedRules.some(x => typeof x !== 'string' || !/^PG\d{3}$/.test(x) || !getRule(x)))) throw new Error('blockedRules must be an array of PG rule IDs');
  if (policy.blockedRules && new Set(policy.blockedRules).size !== policy.blockedRules.length) throw new Error('blockedRules must not contain duplicates');
  if (policy.requireSimulation !== undefined && typeof policy.requireSimulation !== 'boolean') throw new Error('requireSimulation must be boolean');
  if (policy.suppression !== undefined) {
    const s = policy.suppression;
    if (!s || typeof s !== 'object' || Array.isArray(s)) throw new Error('policy.suppression must be an object');
    for (const key of Object.keys(s)) if (!['protectedRules','maxSuppressedFindings','failOnRejected','failOnUnused'].includes(key)) throw new Error(`Unknown policy suppression key: ${key}`);
    if (s.protectedRules !== undefined && (!Array.isArray(s.protectedRules) || s.protectedRules.some(id => typeof id !== 'string' || !/^PG\d{3}$/.test(id) || !getRule(id)))) throw new Error('Invalid policy protectedRules');
    if (s.maxSuppressedFindings !== undefined && (!Number.isSafeInteger(s.maxSuppressedFindings) || s.maxSuppressedFindings < 0)) throw new Error('Invalid maxSuppressedFindings');
    for (const key of ['failOnRejected','failOnUnused']) if (s[key] !== undefined && typeof s[key] !== 'boolean') throw new Error(`Invalid ${key}`);
  }
  return policy;
}

export function assessTeamPolicy(report, policy) {
  const reasons = [];
  const findings = report.lint.findings;
  if (policy.requireSimulation && !report.execution?.passed) reasons.push('Simulation must pass');
  if (policy.maxRiskScore !== undefined && report.lint.risk.score > policy.maxRiskScore) reasons.push(`Risk score exceeds ${policy.maxRiskScore}`);
  if (policy.maxWarnings !== undefined && findings.filter(f => f.severity === 'warning').length > policy.maxWarnings) reasons.push(`Warnings exceed ${policy.maxWarnings}`);
  for (const f of findings) if (policy.blockedRules?.includes(f.ruleId)) reasons.push(`Blocked rule ${f.ruleId}: ${f.file}`);
  return { name: policy.name ?? 'local-team', passed: reasons.length === 0, reasons: [...new Set(reasons)] };
}

// Week 3: static-only CI gate. The existing --assess policy behavior is unchanged.
export function validateLintPolicy(policy) {
  if (policy.requireSimulation === true) throw new Error('requireSimulation requires --assess with a disposable PostgreSQL simulation');
  return policy;
}

export function assessLintPolicy(findings, policy, risk = {}) {
  validateLintPolicy(policy);
  // A score is only a heuristic derived from the configured lint findings.
  const reasons = [];
  const warningCount = findings.filter(f => f.severity === 'warning').length;
  if (policy.maxWarnings !== undefined && warningCount > policy.maxWarnings) reasons.push(`Warnings ${warningCount} exceed ${policy.maxWarnings}`);
  if (policy.maxRiskScore !== undefined) {
    const severityScore = Math.min(100, findings.reduce((n, f) => n + (f.severity === 'error' ? 20 : f.severity === 'warning' ? 5 : 0), 0));
    // Actual heuristic is calculated by the caller and passed separately when available.
    const score = risk.score ?? severityScore;
    if (score > policy.maxRiskScore) reasons.push(`Heuristic risk score ${score} exceeds ${policy.maxRiskScore}`);
  }
  for (const f of findings) if (policy.blockedRules?.includes(f.ruleId)) reasons.push(`Blocked rule ${f.ruleId}: ${f.file}`);
  return { name: policy.name ?? 'local-team', passed: reasons.length === 0, reasons: [...new Set(reasons)], note: 'Passing a static gate is not a safety guarantee; unknown locks and production workloads still require review.' };
}

// A static gate always evaluates all configured risks, including suppressed ones.
export function applySuppressionPolicy(config, policy) {
  if (!config.suppression?.enabled || !policy) return config;
  const protectedRules = [...new Set([...config.suppression.protectedRules, ...['PG011','PG023'], ...(policy.blockedRules ?? []), ...(policy.suppression?.protectedRules ?? [])])];
  return { ...config, suppression: { ...config.suppression, protectedRules } };
}
export function enforceSuppressionAudit(gate, policy, audit) {
  if (!audit) return gate;
  const s = audit.summary;
  const limits = policy.suppression ?? {};
  const reasons = [...gate.reasons];
  if (s.suppressed > (limits.maxSuppressedFindings ?? 0)) reasons.push('Suppression limit exceeded');
  if (s.rejected && limits.failOnRejected !== false) reasons.push('Rejected suppression directives');
  if (s.unused && limits.failOnUnused !== false) reasons.push('Unused suppression directives');
  if (s.scanErrors) reasons.push('Suppression scan failed');
  return { ...gate, reasons, passed: reasons.length === 0 };
}

// CI must supply trusted configuration, policy, target and PostgreSQL version.
export function validateGateConfig(config, policy) {
  if (!policy) return;
  if (config.exclude?.length) throw new Error('Enterprise policy does not allow project exclusions');
  if (config.severity !== 'error') throw new Error('Enterprise policy requires default error severity');
  for (const [id, severity] of Object.entries(config.rules ?? {})) {
    if (severity === 'off' || severity === 'warning') throw new Error(`Enterprise policy does not allow weakening rule ${id}`);
  }
}
