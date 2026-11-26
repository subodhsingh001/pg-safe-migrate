import test from 'node:test';
import assert from 'node:assert/strict';
import {planStatements} from '../src/generator.js';
import {applyContext} from '../src/generator-context.js';
const relation={schemaname:'public',relname:'users'};
const rename=[{stmt:{RenameStmt:{renameType:'OBJECT_COLUMN',relation,subname:'email',newname:'email_address'}}}];
const ctx={schemaVersion:1,tables:[{schema:'public',table:'users',columns:[{name:'id',type:'bigint'},{name:'email',type:'text'},{name:'tenant',type:'uuid'}],backfill:{primaryKey:['id'],batchSize:1000,stableKey:true,dualWritesReady:true}}]};
function plan(patch={},statements=rename){const c=structuredClone(ctx);Object.assign(c.tables[0].backfill,patch);return applyContext(planStatements(statements),statements,c).operations[0];}
const batch=o=>o.steps.find(s=>s.phase==='backfill');
test('bounded null-aware batch',()=>{const s=batch(plan()).sql;assert.match(s,/LIMIT 1000 FOR UPDATE OF s SKIP LOCKED/);assert.match(s,/IS DISTINCT FROM/);assert.match(s,/u\."id" = b\."id"/);});
test('composite key joins all columns',()=>assert.match(batch(plan({primaryKey:['tenant','id']})).sql,/u\."tenant" = b\."tenant" AND u\."id" = b\."id"/));
test('reject invalid batch sizes',()=>{for(const batchSize of [0,10001,1.5,'1000'])assert.throws(()=>plan({batchSize}));});
test('reject missing or duplicate keys',()=>{for(const primaryKey of [[],['missing'],['id','id']])assert.throws(()=>plan({primaryKey}));});
test('requires writer readiness',()=>assert.equal(batch(plan({dualWritesReady:false})).sql,null));
test('requires stable key',()=>assert.equal(batch(plan({stableKey:false})).sql,null));
test('validation does not skip locked rows',()=>{const v=plan().steps.find(s=>s.phase==='validate');assert.match(v.sql,/count\(\*\)/);assert.doesNotMatch(v.sql,/SKIP LOCKED/);});
test('integer widening batch uses explicit builtin cast',()=>{const s=[{stmt:{AlterTableStmt:{relation,cmds:[{AlterTableCmd:{subtype:'AT_AlterColumnType',name:'id',def:{ColumnDef:{typeName:{names:[{String:{sval:'pg_catalog'}},{String:{sval:'int8'}}]}}}}}]}}}];const c=structuredClone(ctx);c.tables[0].columns[0].type='integer';c.tables[0].shadowColumn='id_new';assert.match(batch(applyContext(planStatements(s),s,c).operations[0]).sql,/::pg_catalog.int8/);});
