import { parseSqlFile } from './parser.js';
import { scanSuppressions } from './suppression.js';
import { getRule } from './rules/ruleCatalog.js';

// Preview only: no findings are removed and no CLI policy is changed.
export async function matchSuppressions(sql, parsed) {
  const statements = parsed ?? await parseSqlFile(sql, { details: true });
  const scan = scanSuppressions(sql);
  const matches = [], rejected = [...scan.invalid];
  let index = 0;
  for (const directive of scan.directives) {
    while (index < statements.length && statements[index].offset < directive.endOffset) index++;
    const target = statements[index];
    let message;
    if (!directive.reason) message = 'Suppression reason required';
    else if (directive.ruleIds.some(id => !getRule(id))) message = 'Unknown rule ID';
    else if (!target || !/^[ \t\r\n]*$/.test(sql.slice(directive.endOffset, target.offset))) message = 'No immediately following statement';
    // A comment inside a statement cannot bind across its terminating semicolon:
    // the whitespace-only gap above rejects that semicolon and all SQL tokens.
    if (message) rejected.push({ ...directive, message });
    else matches.push({ ...directive, statementIndex: index, statementOffset: target.offset });
  }
  return { matches, rejected, scanError: scan.scanError };
}
