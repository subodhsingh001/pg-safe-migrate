export function getPreset(name) {
  if (name === 'recommended') return { severity: 'error', rules: {} };
  if (name === 'strict') return { severity: 'error', rules: { PG015: 'error', PG016: 'error', PG017: 'error' } };
  throw new Error('preset must be recommended or strict');
}
