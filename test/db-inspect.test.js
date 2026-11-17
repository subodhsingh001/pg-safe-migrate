import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectDatabase } from '../src/db-inspect.js';

test('read-only catalog inspection returns bounded table statistics', async () => {
  const calls=[];
  const result=await inspectDatabase(async (sql, params)=>{
    calls.push({sql,params});
    if(sql==='SHOW server_version_num') return {rows:[{server_version_num:'160004'}]};
    return {rows:[{schema_name:'public',table_name:'users',estimated_rows:'1200',bytes:'40960'}]};
  },{limit:10});
  assert.equal(result.postgresVersion,16);
  assert.deepEqual(result.tables,[{schema:'public',table:'users',estimatedRows:1200,bytes:40960}]);
  assert.deepEqual(calls[1].params,[10]);
  assert.match(calls[1].sql,/pg_catalog\.pg_class/);
});

test('rejects unbounded inspections',async()=>{
  await assert.rejects(()=>inspectDatabase(async()=>({rows:[]}),{limit:999}),/limit/);
});
