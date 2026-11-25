import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateGateConfig,loadTeamPolicy} from '../src/team-policy.js';
import {scanSuppressions} from '../src/suppression.js';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const base={severity:'error',rules:{},exclude:[]};
for(const patch of [{rules:{PG002:'off'}},{rules:{PG002:'warning'}},{severity:'warning'},{exclude:['migrations']}]) test(`gate rejects ${JSON.stringify(patch)}`,()=>assert.throws(()=>validateGateConfig({...base,...patch},{})));
test('ordinary lint keeps overrides',()=>assert.doesNotThrow(()=>validateGateConfig({...base,rules:{PG002:'off'}},null)));
test('strict promotion allowed',()=>assert.doesNotThrow(()=>validateGateConfig({...base,rules:{PG015:'error'}},{})));
const directive='-- pg-safe-migrate-disable-next-line PG002 -- reason: fake';
for(const sql of [`SELECT U&'hello\n${directive}\nworld';`, `SELECT U&"hello\n${directive}\nworld";`, `SELECT E'hello\\n\n${directive}\nworld';`, `SELECT $tag$\n${directive}\n$tag$;`, `/* outer /* inner */\n${directive}\n*/`]) test(`quoted directive ignored: ${sql.slice(0,16)}`,()=>assert.equal(scanSuppressions(sql).directives.length,0));
test('ambiguous ordinary string clears earlier directives',()=>{const r=scanSuppressions(`${directive}\nSELECT 1; SELECT 'a\\b';`);assert.ok(r.scanError);assert.equal(r.directives.length,0);});
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pg-security-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return (name,data)=>{const f=path.join(dir,name);fs.writeFileSync(f,typeof data==='string'?data:JSON.stringify(data));return f;};}
for(const policy of [{blockedRules:['pg002']},{suppression:{protectedRules:['pg023']}}]) test('reject noncanonical policy IDs '+JSON.stringify(policy),t=>assert.throws(()=>loadTeamPolicy(fixture(t)('policy.json',policy))));
test('real CLI fails closed on disabled blocked rule',t=>{const write=fixture(t);const r=spawnSync(process.execPath,['bin/cli.js',write('migration.sql','ALTER TABLE users DROP COLUMN email;'),'--config',write('config.json',{rules:{PG002:'off'}}),'--gate-policy',write('policy.json',{blockedRules:['PG002']}),'--fail-on','none'],{encoding:'utf8'});assert.equal(r.status,2,r.stderr);assert.match(r.stderr,/weakening rule PG002/);});
