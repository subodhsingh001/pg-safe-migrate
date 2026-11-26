import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeFiles} from '../src/analysis.js';
const rules={PG026:'warning',PG027:'warning',PG028:'warning',PG029:'warning'};
const analyze=(sql,file='migration.sql',config={rules})=>analyzeFiles([{file,sql}],config,{advisor:true});
test('real parser advanced column types',async()=>{const f=await analyze('CREATE TABLE t (id serial PRIMARY KEY, label varchar(40), created timestamp, instant timestamptz);');assert.equal(f.filter(x=>x.ruleId==='PG027').length,1);assert.equal(f.filter(x=>x.ruleId==='PG029').length,2);});
test('real parser timeout scope',async()=>{const f=await analyze("BEGIN; SET LOCAL lock_timeout = '2s'; ALTER TABLE t ADD COLUMN a text; COMMIT; ALTER TABLE t ADD COLUMN b text;");assert.equal(f.filter(x=>x.ruleId==='PG026').length,1);});
test('real parser Prisma mixed migration',async()=>{const f=await analyze('CREATE INDEX CONCURRENTLY ix ON t (a); SELECT 1;','prisma/migrations/001/migration.sql');assert.ok(f.some(x=>x.ruleId==='PG028'&&x.severity==='warning'&&x.advisor));});
test('real parser default remains opt out',async()=>{const f=await analyze('CREATE TABLE t (id integer PRIMARY KEY, a varchar(5));','migration.sql',{});assert.equal(f.filter(x=>/^PG02[6-9]$/.test(x.ruleId)).length,0);});
