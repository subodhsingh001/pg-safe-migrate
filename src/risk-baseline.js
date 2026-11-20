import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const normalizedPath = file => String(file).replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+/g, '/');
const normalizedSql = sql => String(sql).replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim().toLowerCase();

// Statement boundaries are derived from the parser's starting positions when available.
// A conservative text fallback is used for baseline identity; it is not a SQL parser.
function statementAt(sql, line) {
  const lines = String(sql).split(/\r?\n/);
  const start = Math.max(0, Math.min(lines.length - 1, Number(line || 1) - 1));
  let begin = start;
  while (begin > 0 && !lines[begin - 1].includes(';')) begin--;
  let end = start;
  while (end < lines.length - 1 && !lines[end].includes(';')) end++;
  return normalizedSql(lines.slice(begin, end + 1).join('\n'));
}

export function fingerprint(finding, sqlByFile = new Map()) {
  const file = normalizedPath(finding.file);
  const sql = sqlByFile.get(file);
  const identity = sql === undefined ? String(finding.message || '') : statementAt(sql, finding.line);
  return sha(JSON.stringify([file, finding.ruleId, finding.severity, identity]));
}
export function createRiskBaseline(findings, entries) {
  const sqlByFile = new Map(entries.map(e => [normalizedPath(e.file), e.sql]));
  const fingerprints = findings.map(f => fingerprint(f, sqlByFile)).sort();
  return { schemaVersion: 1, tool: 'pg-safe-migrate', fingerprints };
}
export function loadRiskBaseline(filename) {
  const obj = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (!obj || typeof obj !== 'object' || Array.isArray(obj) || obj.schemaVersion !== 1 || obj.tool !== 'pg-safe-migrate' || !Array.isArray(obj.fingerprints) || obj.fingerprints.length > 100000 || obj.fingerprints.some(x => typeof x !== 'string' || !/^[a-f0-9]{64}$/.test(x))) throw new Error('Invalid risk baseline (expected schemaVersion 1 and SHA-256 fingerprints)');
  return obj;
}
export function compareRiskBaseline(findings, entries, baseline) {
  const sqlByFile = new Map(entries.map(e => [normalizedPath(e.file), e.sql]));
  const previous = new Map();
  for (const id of baseline.fingerprints) previous.set(id, (previous.get(id) || 0) + 1);
  const newFindings = [], existingFindings = [];
  for (const f of findings) {
    const id = fingerprint(f, sqlByFile);
    if ((previous.get(id) || 0) > 0) { existingFindings.push(f); previous.set(id, previous.get(id) - 1); }
    else newFindings.push(f);
  }
  const resolved = [...previous.values()].reduce((a,b)=>a+b,0);
  return { newFindings, existingFindings, resolvedCount: resolved, newCount: newFindings.length, existingCount: existingFindings.length };
}
export function writeRiskBaseline(filename, baseline) {
  const dest = path.resolve(filename);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(baseline, null, 2) + '\n', { flag: 'w' });
}
