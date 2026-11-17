import fs from 'node:fs';

export function loadTeamPolicy(file) {
  const policy = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) throw new Error('Team policy must be a JSON object');
  const allowed = ['name', 'maxRiskScore', 'maxWarnings', 'blockedRules', 'requireSimulation'];
  for (const key of Object.keys(policy)) if (!allowed.includes(key)) throw new Error(`Unknown team policy key: ${key}`);
  if (policy.maxRiskScore !== undefined && (!Number.isInteger(policy.maxRiskScore) || policy.maxRiskScore < 0 || policy.maxRiskScore > 100)) throw new Error('maxRiskScore must be 0-100');
  if (policy.maxWarnings !== undefined && (!Number.isInteger(policy.maxWarnings) || policy.maxWarnings < 0)) throw new Error('maxWarnings must be >= 0');
  if (policy.blockedRules !== undefined && (!Array.isArray(policy.blockedRules) || policy.blockedRules.some(x => !/^PG\d{3}$/.test(x)))) throw new Error('blockedRules must be an array of PG rule IDs');
  if (policy.requireSimulation !== undefined && typeof policy.requireSimulation !== 'boolean') throw new Error('requireSimulation must be boolean');
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
