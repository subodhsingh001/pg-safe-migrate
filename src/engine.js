import { concurrentIndexRule } from './rules/concurrentIndex.js';
import { dropColumnRule } from './rules/dropColumn.js';
import { alterTableRules, renameRule } from './rules/alterTableRules.js';

const ACTIVE_RULES = [
  concurrentIndexRule,
  dropColumnRule,
  alterTableRules,
  renameRule
];

export function lintStatements(stmts) {
  const violations = [];
  for (const stmt of stmts) {
    for (const rule of ACTIVE_RULES) {
      const result = rule.check(stmt);
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
