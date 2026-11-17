export function toJson(findings, meta = {}) { return JSON.stringify({ tool: 'pg-safe-migrate', ...meta, findings }, null, 2); }
export function toSarif(findings) {
  const ids = [...new Set(findings.map(f => f.ruleId))].sort();
  return JSON.stringify({ version: '2.1.0', $schema: 'https://json.schemastore.org/sarif-2.1.0.json', runs: [{ tool: { driver: { name: 'pg-safe-migrate', informationUri: 'https://github.com/subodhsingh001/pg-safe-migrate', rules: ids.map(id => ({ id, shortDescription: { text: id } })) } }, results: findings.map(f => ({ ruleId: f.ruleId, level: f.severity === 'warning' ? 'warning' : 'error', message: { text: `${f.message} Fix: ${f.fix}` }, locations: [{ physicalLocation: { artifactLocation: { uri: f.file.replaceAll('\\','/') }, region: { startLine: Math.max(1, f.line || 1), startColumn: Math.max(1, f.column || 1) } } }] })) }] }, null, 2);
}
