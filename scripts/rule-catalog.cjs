#!/usr/bin/env node
(async () => {
  const { getRule, searchRules } = await import('../src/rules/ruleCatalog.js');
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const ruleIndex = args.indexOf('--rule');
  const searchIndex = args.indexOf('--search');
  if (args.includes('--help')) {
    console.log('Usage: node scripts/rule-catalog.cjs [--rule PG019 | --search locking] [--json]');
    return;
  }
  if ((ruleIndex >= 0 && !args[ruleIndex + 1]) || (searchIndex >= 0 && !args[searchIndex + 1])) {
    throw new Error('Missing value after --rule or --search');
  }
  const matches = ruleIndex >= 0 ? [getRule(args[ruleIndex + 1])].filter(Boolean) : searchRules(searchIndex >= 0 ? args[searchIndex + 1] : '');
  if (ruleIndex >= 0 && matches.length === 0) {
    console.error('Unknown rule ID');
    process.exitCode = 1;
    return;
  }
  if (json) console.log(JSON.stringify(matches, null, 2));
  else for (const rule of matches) console.log(`${rule.id} [${rule.defaultCliSeverity}] ${rule.title}\n  ${rule.recommendation}`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
