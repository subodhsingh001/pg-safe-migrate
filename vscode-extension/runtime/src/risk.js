const weights = { error: 20, warning: 5 };
export function summarizeRisk(findings) {
  const score = Math.min(100, findings.reduce((sum, f) => sum + (weights[f.severity] || 0), 0));
  return { score, band: score >= 60 ? 'high' : score >= 20 ? 'moderate' : 'low', confidence: 'low', basis: 'Heuristic severity counts only; no database statistics or production workload context.' };
}
