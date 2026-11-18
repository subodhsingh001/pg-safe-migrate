import { additionalRules } from './rules/additionalRules.js';
import { concurrentIndexRule } from './rules/concurrentIndex.js';
import { dropColumnRule } from './rules/dropColumn.js';
import { alterTableRules, renameRule } from './rules/alterTableRules.js';
import { versionRules } from './rules/versionRules.js';
import { operationalRiskRules } from './rules/operationalRiskRules.js';

const ACTIVE_RULES = [
  concurrentIndexRule,
  dropColumnRule,
  alterTableRules,
  renameRule,
  additionalRules,
  versionRules,
  operationalRiskRules
];

export function lintStatements(stmts, context = {}) {
  const violations = [];
  for (const stmt of stmts) {
    for (const rule of ACTIVE_RULES) {
      const result = rule.check(stmt, context);
      if (!result) continue;
      if (Array.isArray(result)) {
        violations.push(...result);
      } else {
        violations.push(result);
      }
    }
  }
  return violations;
}
