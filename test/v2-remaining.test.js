import test from 'node:test';
import assert from 'node:assert/strict';
import { frameworkFor, position } from '../src/analysis.js';
import { advise } from '../src/advisor.js';
import { toSarif } from '../src/reports.js';
import { parseSqlFile } from '../src/parser.js';
import { analyzeFiles } from '../src/analysis.js';

test('framework identification supports Windows and POSIX paths',()=>{
 assert.equal(frameworkFor('prisma/migrations/2026/migration.sql'),'prisma');
 assert.equal(frameworkFor('app\\drizzle\\0001.sql'),'drizzle');
 assert.equal(frameworkFor('db/migrations/1.sql'),'sql');
});
test('source positions reflect statement offsets',()=>assert.deepEqual(position('SELECT 1;\nSELECT 2;',10),{line:2,column:1}));
test('framework advisor includes contextual guidance',()=>assert.match(advise({ruleId:'PG015'},'prisma').note,/Prisma/));
test('SARIF contains rule, location and message',()=>{
 const s=JSON.parse(toSarif([{ruleId:'PG002',severity:'warning',file:'migration.sql',line:4,column:8,message:'test',fix:'fix'}]));
 assert.equal(s.runs[0].results[0].locations[0].physicalLocation.region.startLine,4);
});
test('parser returns detailed statement locations',async()=>{
 const statements=await parseSqlFile('SELECT 1;\nCREATE INDEX idx_x ON users(id);',{details:true});
 assert.equal(statements.length,2);
 assert.ok(statements[1].offset>0);
});
test('transaction rule PG008 follows parsed statements, not SQL comments',async()=>{
 const findings=await analyzeFiles([{file:'migrations/1.sql',sql:'-- BEGIN;\nCREATE INDEX CONCURRENTLY idx_x ON users(id);'}]);
 assert.equal(findings.some(x=>x.ruleId==='PG008'),false);
 const tx=await analyzeFiles([{file:'migrations/1.sql',sql:'BEGIN; CREATE INDEX CONCURRENTLY idx_x ON users(id); COMMIT;'}]);
 assert.equal(tx.some(x=>x.ruleId==='PG008'),true);
});
test('PostgreSQL 10 receives version-specific default warning',async()=>{
 const sql='ALTER TABLE users ADD COLUMN flag BOOLEAN DEFAULT false;';
 const v10=await analyzeFiles([{file:'migration.sql',sql}],{postgresVersion:10});
 const v16=await analyzeFiles([{file:'migration.sql',sql}],{postgresVersion:16});
 assert.ok(v10.some(x=>x.ruleId==='PG014'));
 assert.ok(!v16.some(x=>x.ruleId==='PG014'));
});
test('cross-file rename warning is explicitly heuristic',async()=>{
 const findings=await analyzeFiles([
  {file:'migrations/001.sql',sql:'ALTER TABLE users ADD COLUMN display_name text;'},
  {file:'migrations/002.sql',sql:'ALTER TABLE users RENAME COLUMN display_name TO nickname;'}
 ]);
 assert.ok(findings.some(x=>x.ruleId==='PG017'));
});
