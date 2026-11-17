import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_CONFIG = Object.freeze({ severity: 'error', rules: {}, exclude: [], postgresVersion: null });
export function loadConfig(file = 'pg-safe-migrate.config.json') {
  if (!fs.existsSync(file)) return { ...DEFAULT_CONFIG };
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { throw new Error(`Invalid configuration ${file}: ${e.message}`); }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('Configuration must be a JSON object.');
  if (parsed.rules !== undefined && (!parsed.rules || Array.isArray(parsed.rules) || typeof parsed.rules !== 'object')) throw new Error('rules must be an object.');
  if (parsed.exclude !== undefined && (!Array.isArray(parsed.exclude) || parsed.exclude.some(x => typeof x !== 'string'))) throw new Error('exclude must be an array of strings.');
  const rules = parsed.rules || {};
  for (const [id, value] of Object.entries(rules)) {
    if (!/^PG\d{3}$/.test(id) || !['off','warning','error'].includes(value)) throw new Error(`Invalid rule configuration: ${id}=${value}`);
  }
  if (parsed.severity !== undefined && !['warning','error'].includes(parsed.severity)) throw new Error('severity must be warning or error.');
  if (parsed.postgresVersion != null && (!Number.isInteger(parsed.postgresVersion) || parsed.postgresVersion < 10 || parsed.postgresVersion > 99)) throw new Error('postgresVersion must be an integer >= 10.');
  return { ...DEFAULT_CONFIG, ...parsed, rules };
}
export function isExcluded(file, patterns, cwd = process.cwd()) {
  const rel = path.relative(cwd, path.resolve(file)).replaceAll('\\','/');
  return patterns.some(pattern => {
    const normalized = pattern.replaceAll('\\','/').replace(/^\.\//,'').replace(/\/$/,'');
    return rel === normalized || rel.startsWith(normalized + '/') || (normalized.startsWith('*.') && rel.endsWith(normalized.slice(1)));
  });
}
