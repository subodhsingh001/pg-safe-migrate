export function suppressionReport(records) {
  const summary = { suppressed: 0, rejected: 0, unused: 0, scanErrors: 0 };
  for (const r of records) {
    const key = r.status === 'scan-error' ? 'scanErrors' : r.status;
    if (!Object.hasOwn(summary, key)) throw new Error('Unknown suppression audit status');
    summary[key]++;
  }
  return { summary, records };
}
const safe = value => String(value ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g, ' ');
const cell = value => safe(value).replace(/[&<>\\|`*_~\[\]#!]/g, c => `&#${c.charCodeAt(0)};`);
export function suppressionText(audit) {
  const s = audit.summary;
  return [`Suppression audit: ${s.suppressed} suppressed, ${s.rejected} rejected, ${s.unused} unused, ${s.scanErrors} scan errors.`, ...audit.records.map(r => `  ${safe(r.status)} ${safe(r.finding?.ruleId ?? r.ruleId ?? r.ruleIds?.join(', '))} ${safe(r.file)}:${r.directiveLine ?? r.line ?? '?'} — ${safe(r.reason)} ${safe(r.message)}`), 'Suppression is not evidence of migration safety.'].join('\n');
}
export function suppressionMarkdown(audit) {
  const s = audit.summary;
  return ['','## Suppression audit','',`${s.suppressed} suppressed, ${s.rejected} rejected, ${s.unused} unused, ${s.scanErrors} scan errors.`, '', '| Status | Rule | File | Directive line | Reason | Detail |','|---|---|---|---:|---|---|', ...audit.records.map(r => `| ${cell(r.status)} | ${cell(r.finding?.ruleId ?? r.ruleId ?? r.ruleIds?.join(', '))} | ${cell(r.file)} | ${cell(r.directiveLine ?? r.line)} | ${cell(r.reason)} | ${cell(r.message ?? r.finding?.message)} |`), '', 'Suppression is not evidence of migration safety.', ''].join('\n');
}
