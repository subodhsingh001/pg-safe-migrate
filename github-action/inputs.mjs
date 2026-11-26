// Pure validation: no filesystem access, shell execution or environment mutation.
export function validateInputs(raw = {}) {
  const allowed = ['postgres-version', 'fail-on', 'advisor', 'preset', 'mode'];
  for (const key of Object.keys(raw)) if (!allowed.includes(key)) throw new Error(`Unknown input: ${key}`);
  function choice(key, fallback, values) {
    const value = raw[key] === undefined ? fallback : raw[key];
    if (typeof value !== 'string' || !values.includes(value)) throw new Error(`Invalid ${key}`);
    return value;
  }
  const version = raw['postgres-version'] ?? '16';
  if (typeof version !== 'string' || !/^[1-9][0-9]$/.test(version)) throw new Error('Invalid postgres-version');
  return Object.freeze({ postgresVersion: version,
    failOn: choice('fail-on', 'error', ['error','warning','none']),
    advisor: choice('advisor','true',['true','false']) === 'true',
    preset: choice('preset','recommended',['recommended','strict']),
    mode: choice('mode','changed',['changed','all']) });
}
