import fs from 'node:fs';

const MAX_BYTES = 1024 * 1024;
const MAX_TABLES = 200;
const MAX_ROWS = 1e15;
const MAX_TABLE_BYTES = 1e18;
const MAX_MS = 3600000;
const allowed = new Set(['schema', 'table', 'estimatedRows', 'bytes', 'writeQueriesPerSecond']);

function plainObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function boundedNumber(value, name, max) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) throw new Error(`${name} must be a finite non-negative number <= ${max}`);
  return value;
}
export function validateProductionContext(input) {
  if (!plainObject(input) || input.schemaVersion !== 1 || !Array.isArray(input.tables)) throw new Error('production context requires schemaVersion 1 and a tables array');
  if (input.tables.length > MAX_TABLES) throw new Error(`production context supports at most ${MAX_TABLES} tables`);
  for (const key of Object.keys(input)) if (!['schemaVersion', 'tables', 'lockTimeoutMs', 'statementTimeoutMs'].includes(key)) throw new Error(`Unknown production context field: ${key}`);
  const tables = [];
  const seen = new Set();
  for (const row of input.tables) {
    if (!plainObject(row)) throw new Error('production context table entry must be an object');
    for (const key of Object.keys(row)) if (!allowed.has(key)) throw new Error(`Unknown production table field: ${key}`);
    if (typeof row.schema !== 'string' || !/^[a-zA-Z_][\w$]{0,62}$/.test(row.schema) || typeof row.table !== 'string' || !/^[a-zA-Z_][\w$]{0,62}$/.test(row.table)) throw new Error('production table schema and table must be simple PostgreSQL identifiers');
    const id = `${row.schema.toLowerCase()}.${row.table.toLowerCase()}`;
    if (seen.has(id)) throw new Error(`Duplicate production table: ${id}`);
    seen.add(id);
    const entry = { schema: row.schema, table: row.table };
    if (row.estimatedRows !== undefined) entry.estimatedRows = boundedNumber(row.estimatedRows, 'estimatedRows', MAX_ROWS);
    if (row.bytes !== undefined) entry.bytes = boundedNumber(row.bytes, 'bytes', MAX_TABLE_BYTES);
    if (row.writeQueriesPerSecond !== undefined) entry.writeQueriesPerSecond = boundedNumber(row.writeQueriesPerSecond, 'writeQueriesPerSecond', 1e7);
    tables.push(entry);
  }
  const result = { schemaVersion: 1, tables };
  if (input.lockTimeoutMs !== undefined) result.lockTimeoutMs = boundedNumber(input.lockTimeoutMs, 'lockTimeoutMs', MAX_MS);
  if (input.statementTimeoutMs !== undefined) result.statementTimeoutMs = boundedNumber(input.statementTimeoutMs, 'statementTimeoutMs', MAX_MS);
  return result;
}
export function loadProductionContext(file) {
  const stat = fs.statSync(file);
  if (stat.size > MAX_BYTES) throw new Error('production context file exceeds 1 MiB');
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { throw new Error('Invalid production context JSON'); }
  return validateProductionContext(parsed);
}
function tableMention(message) {
  const quoted = String(message).match(/(?:on|table)\s+["']?([a-zA-Z_][\w$]*(?:\.[a-zA-Z_][\w$]*)?)["']?/i);
  return quoted?.[1]?.toLowerCase() || null;
}
export function productionAssessment(findings, context) {
  const tables = context.tables;
  const assessments = findings.map(finding => {
    const mention = tableMention(finding.message);
    const matches = mention ? tables.filter(t => `${t.schema}.${t.table}`.toLowerCase() === mention || t.table.toLowerCase() === mention) : [];
    const table = matches.length === 1 ? matches[0] : null;
    const mode = finding.lock?.mode || 'unknown';
    const writesBlocked = ['ACCESS EXCLUSIVE', 'EXCLUSIVE', 'SHARE', 'SHARE ROW EXCLUSIVE'].includes(mode);
    const readsBlocked = mode === 'ACCESS EXCLUSIVE';
    const large = Boolean(table && ((table.estimatedRows ?? 0) >= 1000000 || (table.bytes ?? 0) >= 1073741824));
    const busy = Boolean(table && (table.writeQueriesPerSecond ?? 0) >= 10);
    const factors = [];
    if (mode === 'unknown') factors.push('Lock behavior is unknown; manual review required');
    else factors.push(`Classified lock: ${mode}${readsBlocked ? ' (may block reads and writes)' : writesBlocked ? ' (may block writes)' : ''}`);
    if (large) factors.push('Supplied table estimate is large (>= 1M rows or >= 1 GiB)');
    if (busy) factors.push('Supplied write rate is >= 10 queries/second');
    if (!table) factors.push(matches.length > 1 ? 'Ambiguous table match; production statistics not applied' : 'No matching production table statistics supplied');
    const guidance = [];
    if (finding.ruleId === 'PG001') guidance.push('Consider CREATE INDEX CONCURRENTLY outside a transaction; check framework transaction settings and monitor index progress');
    else if (['PG002', 'PG003', 'PG024', 'PG025'].includes(finding.ruleId)) guidance.push('Consider an expand/backfill/validate/contract rollout with application compatibility checks');
    else if (finding.ruleId === 'PG023') guidance.push('Review data-loss consequences and schedule TRUNCATE with an explicit maintenance plan');
    else guidance.push('Review lock scope, expected execution time, and rollback strategy before deployment');
    if (writesBlocked || readsBlocked) guidance.push('Use a tested lock_timeout and monitor blocking sessions; a timeout does not eliminate lock risk');
    if (context.lockTimeoutMs !== undefined) factors.push(`Provided lock_timeout: ${context.lockTimeoutMs} ms (not verified against server)`);
    if (context.statementTimeoutMs !== undefined) factors.push(`Provided statement_timeout: ${context.statementTimeoutMs} ms (not verified against server)`);
    return { ruleId: finding.ruleId, file: finding.file, line: finding.line, column: finding.column, table: table ? `${table.schema}.${table.table}` : null, lockMode: mode, potentialImpact: readsBlocked ? 'reads-and-writes' : writesBlocked ? 'writes' : 'review-required', attention: large && (writesBlocked || readsBlocked) ? 'elevated' : 'review', factors, guidance };
  });
  return { source: 'user-supplied estimates (not a live database inspection)', confidence: 'limited', assessments, limitations: ['Table statistics and workload rates may be stale or inaccurate', 'SQL table matching is heuristic; schema ambiguity prevents applying estimates', 'No measured lock waits, execution duration, or downtime prediction', 'Existing policy gate decisions are unchanged'] };
}
