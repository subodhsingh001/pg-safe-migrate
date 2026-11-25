import fs from 'node:fs';
import path from 'node:path';
import { getRule } from './rules/ruleCatalog.js';

export function normalizeSuppression(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('suppression must be an object');
  for (const key of Object.keys(value)) if (!['enabled','requireReason','reportSuppressed','protectedRules'].includes(key)) throw new Error(`Unknown suppression option: ${key}`);
  if (value.enabled !== undefined && typeof value.enabled !== 'boolean') throw new Error('suppression.enabled must be boolean');
  for (const key of ['requireReason','reportSuppressed']) if (value[key] !== undefined && value[key] !== true) throw new Error(`suppression.${key} must be true in this development version`);
  const protectedRules = value.protectedRules === undefined ? ['PG011','PG023'] : value.protectedRules;
  if (!Array.isArray(protectedRules) || protectedRules.some(id => typeof id !== 'string' || !/^PG\d{3}$/.test(id) || !getRule(id))) throw new Error('suppression.protectedRules must contain known rule IDs');
  return { enabled: value.enabled ?? false, requireReason: true, reportSuppressed: true, protectedRules: [...new Set(protectedRules)] };
}

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
  return { ...DEFAULT_CONFIG, ...parsed, rules, suppression: normalizeSuppression(parsed.suppression) };
}
export function isExcluded(file, patterns, cwd = process.cwd()) {
  const rel = path.relative(cwd, path.resolve(file)).replaceAll('\\','/');
  return patterns.some(pattern => {
    const normalized = pattern.replaceAll('\\','/').replace(/^\.\//,'').replace(/\/$/,'');
    return rel === normalized || rel.startsWith(normalized + '/') || (normalized.startsWith('*.') && rel.endsWith(normalized.slice(1)));
  });
}
