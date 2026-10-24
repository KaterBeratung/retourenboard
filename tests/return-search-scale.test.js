import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {runtimeFixture} from './helpers/runtime.js';
import {rebuildReturnSerialSearch} from '../dist/server/database/serial-search.js';
import {backfillRecordMetadata} from '../dist/server/database/record-metadata.js';
import {BASELINE_TABLE_CONTRACTS} from '../dist/server/database/schema.js';

test('indexed lookup and paged lists remain correct at 100, 1000, 10000 and 50000 returns',async t=>{
 const f=await runtimeFixture(t),{auth}=await f.setup(),db=f.app.store.db;
 const product=await f.app.store.createProduct({name:'Scale device',sku:'SCALE-1'}),template=await f.app.store.createReturn({productId:product.id,serialNumber:'TEMPLATE'});
 const columns=BASELINE_TABLE_CONTRACTS.find(table=>table.name==='returns').columns.filter(column=>column.name!=='id').map(column=>column.name);
 const expression=field=>field==='returnNumber'?"'RET-SCALE-'||g":field==='serialNumber'?"'SN-'||lpad(g::text,8,'0')":field==='statusId'?'CASE WHEN g%2=0 THEN 15 ELSE 12 END':'template.'+field;
 let previous=0;const measurements=[];
 for(const count of [100,1000,10000,50000]){
  await db.transaction(async()=>{
   await db.query('INSERT INTO returns('+columns.join(',')+') SELECT '+columns.map(expression).join(',')+' FROM returns template CROSS JOIN generate_series($2::integer,$3::integer) g WHERE template.id=$1',[template.id,previous+1,count]);
   await db.query("INSERT INTO audit(createdAt,actorName,source,entity,entityId,action,changes) SELECT createdAt,'System','system','returns',id::text,'update',jsonb_build_object('isClosed',jsonb_build_object('after',statusId=15))::text FROM returns WHERE returnNumber LIKE 'RET-SCALE-%' AND substring(returnNumber from 11)::integer>$1",[previous]);
   await rebuildReturnSerialSearch(db);
   await backfillRecordMetadata(db);
  });
  for(const table of ['returns','return_serial_search','audit'])await db.query('ANALYZE '+table);
  const before=process.memoryUsage();let lookupMs=0,pageMs=0;
  for(let attempt=0;attempt<3;attempt++){
   let start=performance.now(),response=await f.request('/api/returns/serial-lookup?serialNumber=sn-'+String(count).padStart(8,'0'),'GET',undefined,auth),result=await response.json();lookupMs+=performance.now()-start;
   assert.equal(response.status,200);assert.equal(result.total,1);assert.equal(result.items[0].serialNumber,'SN-'+String(count).padStart(8,'0'));
   start=performance.now();response=await f.request('/api/returns?page=2&pageSize=25&statusId=15&sort=serialNumber&direction=desc','GET',undefined,auth);result=await response.json();pageMs+=performance.now()-start;
   assert.equal(response.status,200);assert.equal(result.total,count/2);assert.equal(result.items.length,25);assert.equal(result.items[0].serialNumber,'SN-'+String(count-50).padStart(8,'0'));assert.ok(result.items.every(row=>row.isClosed&&row.completedAt));
   assert.equal((await(await f.request('/api/returns?page=1&pageSize=25&search=SN-'+String(count).padStart(8,'0'),'GET',undefined,auth)).json()).total,1);
  }
  const plan=await db.query('EXPLAIN (FORMAT JSON) SELECT returnId FROM return_serial_search WHERE serialKey=$1',['SN-'+String(count).padStart(8,'0')]);
  const serialized=JSON.stringify(plan.rows);if(count>=10000)assert.match(serialized,/return_serial_original/);
  const after=process.memoryUsage();measurements.push({returns:count,lookupMeanMs:+(lookupMs/3).toFixed(2),pageMeanMs:+(pageMs/3).toFixed(2),rssDeltaBytes:after.rss-before.rss,heapDeltaBytes:after.heapUsed-before.heapUsed,serialPlan:plan.rows});previous=count;
 }
 t.diagnostic('SCALE_MEASUREMENTS '+JSON.stringify(measurements));
});
