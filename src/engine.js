
import { additionalRules } from './rules/additionalRules.js';
import { concurrentIndexRule } from './rules/concurrentIndex.js';
import { dropColumnRule } from './rules/dropColumn.js';
import { alterTableRules, renameRule } from './rules/alterTableRules.js';
import { versionRules } from './rules/versionRules.js';
import { operationalRiskRules } from './rules/operationalRiskRules.js';
import { dataIntegrityRules } from './rules/dataIntegrityRules.js';

const ACTIVE_RULES = [
  concurrentIndexRule,
  dropColumnRule,
  alterTableRules,
  renameRule,
  additionalRules,
  versionRules,
  operationalRiskRules,
  dataIntegrityRules
];

export function lintStatements(stmts, context = {}) {
  const violations = [];

  for (const stmt of stmts) {
    const findings = [];

    for (const rule of ACTIVE_RULES) {
      const result = rule.check(stmt, context);
      if (!result) continue;

      if (Array.isArray(result)) {
        findings.push(...result);
      } else {
        findings.push(result);
      }
    }

    // PG025 provides more specific guidance for SET NOT NULL.
    // Suppress PG013 only for this statement when PG025 exists.
    const hasPG025 = findings.some(f => f.ruleId === 'PG025');

    violations.push(
      ...findings.filter(f => !(hasPG025 && f.ruleId === 'PG013'))
    );
  }

  return violations;
}
