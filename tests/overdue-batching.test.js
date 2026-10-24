import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {runtimeFixture} from './helpers/runtime.js';
import {sourceModule} from './helpers/source-module.js';
import {BASELINE_TABLE_CONTRACTS} from '../dist/server/database/schema.js';
import {backfillRecordMetadata} from '../dist/server/database/record-metadata.js';
import {openDatabase} from '../dist/server/database/connection.js';
import {createStore} from '../dist/server/store.js';

const {createNotifications}=await sourceModule("export {createNotifications} from './backend/src/server/notifications.ts';");
const fixedNow=Date.parse('2026-10-06T12:00:00Z');
async function fixture(t){
 const f=await runtimeFixture(t,{now:()=>fixedNow});await f.setup();await f.app.jobs.close();
 const product=await f.app.store.createProduct({sku:'OVERDUE-BATCH',name:'Overdue fixture'});
 const notifications=createNotifications({store:f.app.store,preferences:f.app.preferences,mail:f.app.mail,clock:{now:()=>fixedNow}});
 return {...f,product,notifications};
}

test('overdue scans batch new states and perform no writes for 1201 unchanged returns',async t=>{
 const f=await fixture(t),db=f.app.store.db;
 const template=await f.app.store.createReturn({productId:f.product.id,serialNumber:'BATCH-TEMPLATE',receiptDate:'2026-10-06'});
 const columns=BASELINE_TABLE_CONTRACTS.find(table=>table.name==='returns').columns.filter(column=>column.name!=='id').map(column=>column.name);
 await db.query('INSERT INTO returns('+columns.join(',')+') SELECT '+columns.map(field=>field==='returnNumber'?"'RET-BATCH-'||g":'template.'+field).join(',')+' FROM returns template CROSS JOIN generate_series(1,1200) g WHERE template.id=$1',[template.id]);
 await backfillRecordMetadata(db);
 const query=db.query.bind(db),calls=[];db.query=async(sql,values)=>{calls.push({sql,parameters:values?.length??0});return query(sql,values);};
 t.after(()=>{db.query=query;});
 let start=performance.now();await f.notifications.checkOverdue();
 const first={queries:calls.length,stateWrites:calls.filter(call=>/^INSERT INTO overdue_state/.test(call.sql)).length,elapsedMs:+(performance.now()-start).toFixed(2),maxParameters:Math.max(...calls.map(call=>call.parameters))};
 t.diagnostic('OVERDUE_FIRST_SCAN '+JSON.stringify(first));
 assert.ok(first.queries<=24,`initializing 1201 returns must use bounded queries, observed ${first.queries}`);
 assert.ok(first.stateWrites<=3,'new states must be inserted in bounded batches');
 assert.equal((await query('SELECT COUNT(*) AS n FROM overdue_state')).rows[0].n,1201);
 calls.length=0;start=performance.now();await f.notifications.checkOverdue();
 const unchanged={queries:calls.length,stateWrites:calls.filter(call=>/^(?:INSERT INTO|UPDATE|DELETE FROM) overdue_state/.test(call.sql)).length,elapsedMs:+(performance.now()-start).toFixed(2)};
 t.diagnostic('OVERDUE_UNCHANGED_SCAN '+JSON.stringify(unchanged));
 assert.ok(unchanged.queries<=20,`unchanged scans must use bounded queries, observed ${unchanged.queries}`);
 assert.equal(unchanged.stateWrites,0,'unchanged overdue states must not be rewritten');
 await query('UPDATE returns SET receiptDate=$1 WHERE id=$2',['2026-10-05',template.id]);calls.length=0;
 await f.notifications.checkOverdue();
 assert.equal(calls.filter(call=>/^INSERT INTO overdue_state/.test(call.sql)).length,1);
 assert.equal((await query('SELECT dueDate FROM overdue_state WHERE returnId=$1',[template.id])).rows[0].dueDate,'2026-10-19');
 assert.equal((await query("SELECT COUNT(*) AS n FROM events WHERE type='overdue'")).rows[0].n,0);
});

test('legacy overdue markers preserve episodes through date changes and reopening',async t=>{
 const f=await fixture(t),db=f.app.store.db;
 const ret=await f.app.store.createReturn({productId:f.product.id,serialNumber:'LEGACY',receiptDate:'2026-09-01'});
 await db.query('INSERT INTO events(id,type,payload,createdAt,processed) VALUES($1,$2,$3,$4,1)',['overdue:'+ret.id,'overdue',JSON.stringify({id:ret.id,returnNumber:ret.returnNumber}),new Date(fixedNow).toISOString()]);
 await f.notifications.checkOverdue();
 assert.deepEqual((await db.query('SELECT overdue,episode,dueDate FROM overdue_state WHERE returnId=$1',[ret.id])).rows[0],{overdue:1,episode:1,dueDate:'2026-09-15'});
 assert.equal((await db.query("SELECT COUNT(*) AS n FROM notifications WHERE kind='overdue'")).rows[0].n,0);
 await db.query('UPDATE returns SET receiptDate=$1 WHERE id=$2',['2026-09-02',ret.id]);await f.notifications.checkOverdue();
 assert.equal((await db.query('SELECT episode FROM overdue_state WHERE returnId=$1',[ret.id])).rows[0].episode,1,'continuously overdue date changes do not start another episode');
 await db.query('UPDATE returns SET receiptDate=$1 WHERE id=$2',['2026-10-06',ret.id]);await f.notifications.checkOverdue();
 await db.query('UPDATE returns SET receiptDate=$1 WHERE id=$2',['2026-09-01',ret.id]);await f.notifications.checkOverdue();
 const closed=(await db.query("SELECT id FROM masterdata WHERE kind='statuses' AND isClosed=1 ORDER BY id LIMIT 1")).rows[0].id;
 await db.query('UPDATE returns SET statusId=$1 WHERE id=$2',[closed,ret.id]);await f.notifications.checkOverdue();
 await db.query('UPDATE returns SET statusId=$1 WHERE id=$2',[ret.statusId,ret.id]);await f.notifications.checkOverdue();await f.notifications.checkOverdue();
 assert.deepEqual((await db.query('SELECT overdue,episode FROM overdue_state WHERE returnId=$1',[ret.id])).rows[0],{overdue:1,episode:3});
 assert.deepEqual((await db.query("SELECT eventKey FROM notifications WHERE kind='overdue' ORDER BY id")).rows.map(row=>row.eventKey),[`overdue:${ret.id}:2`,`overdue:${ret.id}:3`]);
});

test('overdue events and batched states roll back together when state persistence fails',async t=>{
 const f=await fixture(t),db=f.app.store.db;
 const ret=await f.app.store.createReturn({productId:f.product.id,serialNumber:'ROLLBACK',receiptDate:'2026-09-01'});
 const query=db.query.bind(db);db.query=async(sql,values)=>{if(/^INSERT INTO overdue_state/.test(sql))throw Error('state persistence failed');return query(sql,values);};
 try{await assert.rejects(f.notifications.checkOverdue(),/state persistence failed/);}finally{db.query=query;}
 assert.equal((await db.query('SELECT COUNT(*) AS n FROM events WHERE id LIKE $1',[`overdue:${ret.id}:%`])).rows[0].n,0);
 assert.equal((await db.query('SELECT COUNT(*) AS n FROM overdue_state WHERE returnId=$1',[ret.id])).rows[0].n,0);
 await f.notifications.checkOverdue();
 assert.equal((await db.query("SELECT COUNT(*) AS n FROM notifications WHERE kind='overdue'")).rows[0].n,1);
});

test('independent overdue workers serialize their state snapshot and publish one episode',async t=>{
 const f=await fixture(t),db=f.app.store.db;
 const ret=await f.app.store.createReturn({productId:f.product.id,serialNumber:'CONCURRENT',receiptDate:'2026-09-01'});
 const other=await openDatabase(f.databaseConfig,db.schema),observer=await openDatabase(f.databaseConfig,db.schema);
 t.after(async()=>{await other.close();await observer.close();});
 const otherStore=await createStore({database:other});otherStore.setRules(()=>f.app.preferences.get('rules'),{now:()=>fixedNow});
 const worker=createNotifications({store:otherStore,preferences:f.app.preferences,mail:f.app.mail,clock:{now:()=>fixedNow}});
 const listReturns=f.app.store.listReturns;
 let checked=false;f.app.store.listReturns=async()=>{
  const locked=await observer.transaction(async()=>(await observer.query("SELECT pg_try_advisory_xact_lock(hashtextextended(current_schema() || ':notifications',0)) AS locked")).rows[0].locked);
  assert.equal(locked,false,'the notification lock must be held before reading return state');checked=true;
  return listReturns();
 };
 try{const results=await Promise.allSettled([f.notifications.checkOverdue(),worker.checkOverdue()]);for(const result of results)if(result.status==='rejected')throw result.reason;}finally{f.app.store.listReturns=listReturns;}
 assert.equal(checked,true);
 assert.deepEqual((await db.query('SELECT overdue,episode FROM overdue_state WHERE returnId=$1',[ret.id])).rows[0],{overdue:1,episode:1});
 assert.equal((await db.query("SELECT COUNT(*) AS n FROM notifications WHERE kind='overdue'")).rows[0].n,1);
});
