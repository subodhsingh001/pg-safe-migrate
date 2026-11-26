import { summarizeRisk } from '../src/risk.js';
export const MARKER = '<!-- pg-safe-migrate-report -->';
const MAX_BYTES = 48000;
// Encode every non-alphanumeric punctuation character as text, not Markdown syntax.
function safe(value, limit = 400) {
  return Array.from(String(value ?? '').replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ')).slice(0, limit).map(c => /[\p{L}\p{N} ]/u.test(c) ? c : `&#${c.codePointAt(0)};`).join('');
}
export function renderReport(report) {
  const labels = { passed: 'PASS', blocked: 'BLOCK', error: 'ERROR', 'no-migrations': 'NO MIGRATIONS' };
  if (!report || !Object.hasOwn(labels, report.status)) throw new Error('Invalid report status');
  const {status, findings, filesChecked, head, exitCode} = report;
  if (status === 'error') return `${MARKER}\n## PGSAFE — ERROR\n\nAnalysis failed. No safety decision is available. Review the analysis job logs.\n`;
  if (!Array.isArray(findings) || !Number.isSafeInteger(filesChecked) || filesChecked < 0 || !/^[a-f0-9]{40}$/.test(head) || exitCode !== (status === 'blocked' ? 1 : 0) || (status === 'no-migrations') !== (filesChecked === 0) || (!filesChecked && findings.length) || (status === 'blocked' && !findings.length)) throw new Error('Invalid analysis report');
  for (const f of findings) if (!f || !['error','warning'].includes(f.severity) || !/^PG\d{3}$/.test(f.ruleId) || typeof f.file !== 'string' || !Number.isSafeInteger(f.line) || f.line < 1) throw new Error('Invalid finding');
  const errors = findings.filter(f => f.severity === 'error').length;
  const risk = summarizeRisk(findings);
  let body = `${MARKER}\n## PGSAFE — ${labels[status]}\n\nCommit: \`${head}\`\n\nFiles checked: **${filesChecked}** · Errors: **${errors}** · Warnings: **${findings.length-errors}**\n\n`;
  if (status === 'no-migrations') body += 'No SQL files matched the selected discovery mode.\n';
  else body += `Lint-only risk score: **${risk.score}/100** (${risk.band}, low confidence). Production workload and lock impact are not measured. PASS means the configured gate did not block.\n`;
  const footer = '\nStatic analysis only. No downtime guarantee.\n';
  let shown = 0;
  for (const f of findings.slice(0, 100)) {
    const row = `\n- **${f.ruleId} (${f.severity})** — ${safe(f.file)}:${f.line}\n  ${safe(f.message)}\n  Guidance: ${safe(f.fix || f.advisor?.summary || 'Review the migration before deployment.')}\n`;
    if (Buffer.byteLength(body + row + footer) > MAX_BYTES - 256) break;
    body += row; shown++;
  }
  if (shown < findings.length) body += `\n${findings.length-shown} additional findings omitted from this comment. Review the full analysis report.\n`;
  return body + footer;
}
// Only select comments authored by the authenticated publisher, never by marker alone.
// Caller must supply all pages and serialize publishing per PR.
export function selectComment(comments, authorId) {
  if (!Array.isArray(comments) || !Number.isSafeInteger(authorId) || authorId <= 0) throw new Error('Invalid comment identity');
  const matches = comments.filter(c => c?.user?.id === authorId && typeof c.body === 'string' && c.body.split(/\r?\n/,1)[0] === MARKER && Number.isSafeInteger(c.id) && c.id > 0);
  return matches.sort((a,b)=>a.id-b.id)[0]?.id ?? null;
}
