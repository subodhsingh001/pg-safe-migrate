import test from 'node:test';
import assert from 'node:assert/strict';
import { matchSuppressions } from '../src/suppression-matcher.js';
import { analyzeFiles } from '../src/analysis.js';
const d = (ids='PG002', reason='approved') => `-- pg-safe-migrate-disable-next-line ${ids} -- reason: ${reason}`;
const drop = 'ALTER TABLE users DROP COLUMN email;';
for (const [name, sql, count, index] of [
 ['single', `${d()}\n${drop}`,1,0],
 ['multiple rules', `${d('PG002, PG003')}\n${drop}`,1,0],
 ['same line statements', `${d()}\n${drop} ${drop}`,1,0],
 ['second statement', `${drop}\n${d()}\n${drop}`,1,1],
 ['multiline', `${d()}\nALTER TABLE users\n DROP COLUMN email;`,1,0],
 ['unicode CRLF', `SELECT '日本😀';\r\n${d()}\r\n${drop}`,1,1],
 ['blank lines', `${d()}\n\n${drop}`,1,0],
 ['unknown', `${d('PG999')}\n${drop}`,0],
 ['mixed unknown', `${d('PG002, PG999')}\n${drop}`,0],
 ['missing reason', `${d('PG002','')}\n${drop}`,0],
 ['orphan', d(),0],
 ['intervening comment', `${d()}\n-- other\n${drop}`,0],
 ['inside statement', `ALTER TABLE users\n${d()}\nDROP COLUMN email;\n${drop}`,0],
 ['dollar quote', `DO $$ BEGIN\n${d()}\nEND; $$;\n${drop}`,0],
 ['empty statement', `${d()}\n;\n${drop}`,0],
]) test(name, async () => {
 const result = await matchSuppressions(sql);
 assert.equal(result.matches.length,count);
 if(count) { assert.equal(result.matches[0].statementIndex,index); assert.match(sql.slice(result.matches[0].statementOffset), /^ALTER/); }
});
test('invalid SQL preserved', async()=>assert.rejects(matchSuppressions('ALTER TABLE ;'), /SQL Syntax Error/));
test('preview never changes existing findings', async()=>{
 const sql=`${d()}\n${drop} ${drop}`;
 assert.equal((await matchSuppressions(sql)).matches.length,1);
 assert.equal((await analyzeFiles([{file:'migration.sql',sql}])).filter(x=>x.ruleId==='PG002').length,2);
});
