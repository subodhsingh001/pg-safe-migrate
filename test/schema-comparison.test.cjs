'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {compare,format}=require('../vscode-extension/schema-comparison.cjs');
const local={source:'schema.sql',columns:[{name:'id',type:'bigint',pk:true,notNull:true},{name:'email',type:'text',notNull:false},{name:'status',type:'text'}],complete:false};
const live={keyColumns:['id'],intelligence:{columns:{rows:[{name:'id',type:'bigint',not_null:true},{name:'email',type:'integer',not_null:true},{name:'extra',type:'text'}]}}};
test('reports type and nullability differences without inferring live-only drift',()=>{const r=compare(local,live);assert.equal(r.primaryKey,'match');assert.deepEqual(r.rows.map(x=>x.type),['match','different','missing-live','unknown']);assert.equal(r.rows[1].nullability,'different');assert.match(format(r),/partial discovery/);});
test('truncated live catalog does not establish absence',()=>{assert.equal(compare(local,{...live,intelligence:{columns:{...live.intelligence.columns,truncated:true}}}).rows[2].type,'unknown');});
test('absent static source is unknown',()=>assert.equal(compare(null,live),null));
