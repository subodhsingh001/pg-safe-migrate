export function toJson(findings, meta = {}) { return JSON.stringify({ tool: 'pg-safe-migrate', ...meta, findings }, null, 2); }
export function toSarif(findings) {
  const ids = [...new Set(findings.map(f => f.ruleId))].sort();
  return JSON.stringify({ version: '2.1.0', $schema: 'https://json.schemastore.org/sarif-2.1.0.json', runs: [{ tool: { driver: { name: 'pg-safe-migrate', informationUri: 'https://github.com/subodhsingh001/pg-safe-migrate', rules: ids.map(id => ({ id, shortDescription: { text: id } })) } }, results: findings.map(f => ({ ruleId: f.ruleId, level: f.severity === 'warning' ? 'warning' : 'error', message: { text: `${f.message} Fix: ${f.fix}` }, locations: [{ physicalLocation: { artifactLocation: { uri: f.file.replaceAll('\\','/') }, region: { startLine: Math.max(1, f.line || 1), startColumn: Math.max(1, f.column || 1) } } }] })) }] }, null, 2);
}

// Human-readable report. Escapes Markdown cells and never includes untrusted HTML.
const mdCell = value => String(value ?? '').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function toMarkdownReport(findings = [], { filesChecked = 0, postgresVersion, risk } = {}) {
  const errors = findings.filter(f => f.severity === 'error').length;
  const warnings = findings.filter(f => f.severity === 'warning').length;
  const lines = [
    '# PG Safe Migrate report', '',
    `Files checked: **${filesChecked}** | Errors: **${errors}** | Warnings: **${warnings}**${postgresVersion ? ` | PostgreSQL: **${mdCell(postgresVersion)}**` : ''}`, ''
  ];
  if (risk) {
    lines.push('## Risk assessment', '', `**${risk.score}/100 (${mdCell(risk.band)})** — heuristic, not a downtime prediction.`, '');
    if (risk.breakdown) {
      lines.push('| Component | Points |', '|---|---:|');
      for (const [name, value] of Object.entries(risk.breakdown)) lines.push(`| ${mdCell(name)} | ${Number(value) || 0} |`);
      lines.push('');
    }
    if (risk.unknownLocks) lines.push('**Unclassified locks present:** review SQL manually.', '');
    if (risk.limitations?.length) lines.push('Limitations: ' + risk.limitations.map(mdCell).join('; ') + '.', '');
  }
  lines.push('## Findings', '');
  if (!findings.length) lines.push('No configured findings. This does not guarantee a safe migration.', '');
  else {
    lines.push('| Rule | Severity | File | Line | Message | Recommendation |', '|---|---|---|---:|---|---|');
    for (const f of findings) lines.push(`| ${mdCell(f.ruleId)} | ${mdCell(f.severity)} | ${mdCell(f.file)} | ${Math.max(1, Number(f.line) || 1)} | ${mdCell(f.message)} | ${mdCell(f.fix)} |`);
    lines.push('');
  }
  lines.push('> Static analysis is advisory. Review locks, data volume, transaction behavior, and production workload before deployment.', '');
  return lines.join('\n');
}
