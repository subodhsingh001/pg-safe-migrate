import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSqlFile} from '../src/parser.js';
import {planStatements} from '../src/generator.js';
test('real parser recognizes generator operations',async()=>{const p=planStatements(await parseSqlFile('ALTER TABLE public.users RENAME COLUMN email TO email_address; ALTER TABLE public.users ALTER COLUMN email_address SET NOT NULL; ALTER TABLE public.users ALTER COLUMN email_address TYPE text;', {details:true}));assert.deepEqual(p.operations.map(o=>o.kind),['rename-column','set-not-null','alter-column-type']);});
