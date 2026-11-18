/** Compatibility facts used by the static version rules (not a complete SQL feature matrix). */
export const VERSION_FEATURES = Object.freeze({
  merge: Object.freeze({ minVersion: 15, ruleId: 'PG019', label: 'MERGE statement' }),
  nullsNotDistinct: Object.freeze({ minVersion: 15, ruleId: 'PG020', label: 'UNIQUE NULLS NOT DISTINCT' })
});

export function getVersionCompatibility(feature, targetVersion) {
  const definition = VERSION_FEATURES[feature];
  if (!definition) throw new RangeError(`Unknown PostgreSQL feature: ${feature}`);
  if (targetVersion == null) return { ...definition, supported: null };
  const version = Number(targetVersion);
  if (!Number.isInteger(version) || version < 10 || version > 99) {
    throw new RangeError('PostgreSQL target version must be an integer from 10 to 99');
  }
  return { ...definition, supported: version >= definition.minVersion };
}
