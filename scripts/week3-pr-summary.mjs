import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const safe = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ').replace(/</g, '&lt;').replace(/>/g, '&gt;').slice(0, 500);
export function buildSummary(report, exitStatus) {
  const lines = ['## PG Safe Migrate — pull request safety', ''];
  if (!report || typeof report !== 'object' || !Array.isArray(report.findings)) {
    lines.push('**Analysis unavailable.** Inspect the workflow logs; this is not a passing check.', '');
    return lines.join('\n');
  }
  const gate = report.gate;
  const decision = gate ? (gate.passed ? 'PASS' : 'BLOCK') : 'NOT EVALUATED';
  lines.push(`**Policy gate:** ${decision}  `, `**CLI exit code:** ${safe(exitStatus)}  `, `**SQL files checked:** ${safe(report.filesChecked)}  `, `**Total findings:** ${report.findings.length}`, '');
  if (report.baseline) {
    lines.push(`**Baseline:** ${safe(report.baseline.newCount)} new / ${safe(report.baseline.existingCount)} existing / ${safe(report.baseline.resolvedCount)} resolved`, '');
  } else {
    lines.push('**Baseline:** not configured; all findings are evaluated by the gate.', '');
  }
  if (gate?.reasons?.length) lines.push('**Reasons:**', ...gate.reasons.slice(0, 20).map(x => `- ${safe(x)}`), '');
  const newFindings = Array.isArray(report.baseline?.newFindings) ? report.baseline.newFindings : report.findings;
  if (newFindings.length) {
    lines.push('### New / gate-evaluated findings', '', '| Rule | Severity | Location | Recommendation |', '| --- | --- | --- | --- |');
    for (const f of newFindings.slice(0, 50)) lines.push(`| ${safe(f.ruleId)} | ${safe(f.severity)} | ${safe(f.file)}:${safe(f.line)} | ${safe(f.fix)} |`);
    if (newFindings.length > 50) lines.push(`\nOnly the first 50 of ${newFindings.length} findings are shown.`);
    lines.push('');
  } else lines.push('No new findings were reported.', '');
  if (report.production) {
    lines.push('### Production context (advisory only)', '', `Source: ${safe(report.production.source)}.`, '');
    for (const a of (report.production.assessments || []).slice(0, 30)) {
      lines.push(`- **${safe(a.ruleId)}** on **${safe(a.table || 'unknown table')}**: ${safe(a.attention)} attention; ${safe(a.potentialImpact)} potentially affected.`);
      if (a.guidance?.length) lines.push(`  - ${safe(a.guidance[0])}`);
    }
    lines.push('');
  }
  lines.push('Static analysis and supplied production estimates cannot guarantee zero downtime.', '');
  return lines.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const reportPath = process.env.REPORT_PATH;
  let report;
  try { if (reportPath) report = JSON.parse(fs.readFileSync(reportPath, 'utf8')); }
  catch (err) { console.error(`Unable to read report: ${err.message}`); }
  const content = buildSummary(report, process.env.ANALYSIS_STATUS || 'unknown');
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, content);
  else process.stdout.write(content);
}
