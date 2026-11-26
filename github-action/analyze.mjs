import { validateInputs } from './inputs.mjs';
import { discoverSql } from './discovery.mjs';
import { analyzeFiles } from '../src/analysis.js';
import { getPreset } from '../src/presets.js';
export async function analyzeCommit({cwd,base,head,inputs={}}) {
  const options = validateInputs(inputs);
  const entries = discoverSql({cwd,base,head,mode:options.mode});
  const findings = await analyzeFiles(entries,{...getPreset(options.preset),postgresVersion:Number(options.postgresVersion)},{advisor:options.advisor});
  const blocked = options.failOn==='warning' ? findings.length>0 : options.failOn==='error' && findings.some(f=>f.severity==='error');
  return {head,base:base??null,filesChecked:entries.length,findings,status:entries.length===0?'no-migrations':blocked?'blocked':'passed',exitCode:blocked?1:0};
}
