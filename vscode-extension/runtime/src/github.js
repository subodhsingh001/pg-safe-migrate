function escapeCommand(s) {
  return String(s).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}
function escapeProperty(s) {
  return escapeCommand(s).replaceAll(':', '%3A').replaceAll(',', '%2C');
}
export function toGitHubAnnotations(findings) {
  return findings.map(f => `::${f.severity === 'error' ? 'error' : 'warning'} file=${escapeProperty(f.file)},line=${Math.max(1, f.line || 1)},col=${Math.max(1, f.column || 1)},title=${escapeProperty(f.ruleId)}::${escapeCommand(f.message)} Fix: ${escapeCommand(f.fix)}`).join('\n') + (findings.length ? '\n' : '');
}
export function toMarkdownSummary(findings, filesChecked) {
  const errors = findings.filter(f => f.severity === 'error').length;
  const warnings = findings.length - errors;
  const lines = ['## PostgreSQL migration safety', '', `Checked ${filesChecked} file(s): **${errors} error(s)**, **${warnings} warning(s)**.`, '', '| Rule | Severity | Location | Finding |', '|---|---|---|---|'];
  for (const f of findings) lines.push(`| ${f.ruleId} | ${f.severity} | \`${String(f.file).replaceAll('|', '\\|')}:${f.line}\` | ${f.message.replaceAll('|', '\\|').replaceAll('\n', ' ')} |`);
  lines.push('', '> Static heuristic analysis, not a guarantee of zero downtime.', '');
  return lines.join('\n');
}
