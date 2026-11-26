import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSqlFile} from '../src/parser.js';
import {planStatements} from '../src/generator.js';
test('real parser recognizes generator operations',async()=>{const p=planStatements(await parseSqlFile('ALTER TABLE public.users RENAME COLUMN email TO email_address; ALTER TABLE public.users ALTER COLUMN email_address SET NOT NULL; ALTER TABLE public.users ALTER COLUMN email_address TYPE text;', {details:true}));assert.deepEqual(p.operations.map(o=>o.kind),['rename-column','set-not-null','alter-column-type']);});

test('real parser supports widening and simple concurrent index templates',async()=>{
 const {applyContext}=await import('../src/generator-context.js');
 const parsed=await parseSqlFile('ALTER TABLE public.users ALTER COLUMN id TYPE bigint; CREATE INDEX users_id_idx ON public.users (id);',{details:true});
 const p=applyContext(planStatements(parsed),parsed,{schemaVersion:1,tables:[{schema:'public',table:'users',columns:[{name:'id',type:'integer'}],shadowColumn:'id_new'}]});
 assert.match(p.operations[0].steps[0].sql,/ADD COLUMN "id_new" bigint/);
 assert.match(p.operations[1].steps[0].sql,/CREATE INDEX CONCURRENTLY/);
});
