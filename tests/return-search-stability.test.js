import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import {runtimeFixture} from './helpers/runtime.js';
import {createReturnWorkflow} from '../dist/server/return-workflow.js';
import {migratePostgres} from '../dist/server/database/migrations.js';
import {exportData,importData} from '../dist/server/database/data-transfer.js';
import {openDatabase} from '../dist/server/database/connection.js';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {writeInventoryRow} from '../dist/server/database/inventory-row.js';
import {readFileSync} from 'node:fs';

async function fixture(t){const f=await runtimeFixture(t),{auth,data}=await f.setup(),product=await f.app.store.createProduct({name:'Search device',sku:'SEARCH-1'});return {...f,auth,user:data.user,product,create:input=>f.app.store.createReturn({productId:product.id,serialNumber:'SN-DEFAULT',...input})};}

test('serial lookup queries indexed candidates rather than reading the inventory; repeat creates are retained',async t=>{
 const f=await fixture(t),rows=await Promise.all(['Straße-001','STRASSE-001'].map(serialNumber=>f.create({serialNumber})));
 assert.equal(new Set(rows.map(row=>row.returnNumber)).size,2);
 const replacement=await f.create({serialNumber:'ORIGINAL',replacementSerialNumber:'straße-001'});
 const original=f.app.store.listReturns;f.app.store.listReturns=()=>{throw Error('Whole inventory must not be loaded');};
 try{const res=await f.request('/api/returns/serial-lookup?serialNumber=STRASSE-001','GET',undefined,f.auth);assert.equal(res.status,200,await res.clone().text());const result=await res.json();assert.equal(result.total,3);assert.ok(result.items.some(row=>row.id===replacement.id));assert.ok(result.items.some(row=>row.serialNumber==='Straße-001'));}finally{f.app.store.listReturns=original;}
 await f.app.store.updateReturn(replacement.id,{...replacement,replacementSerialNumber:'NEW-KEY'});
 assert.equal((await(await f.request('/api/returns/serial-lookup?serialNumber=STRASSE-001','GET',undefined,f.auth)).json()).total,2);
 await assert.rejects(f.app.store.transaction(async()=>{await f.create({serialNumber:'ROLLBACK-KEY'});throw Error('rollback');}),/rollback/);
 assert.equal((await(await f.request('/api/returns/serial-lookup?serialNumber=ROLLBACK-KEY','GET',undefined,f.auth)).json()).total,0);
 assert.equal((await f.request('/api/returns/serial-lookup?serialNumber=STRASSE-001')).status,401);
 assert.equal((await f.request('/api/returns/serial-lookup?serialNumber=x&excludeId=9007199254740992','GET',undefined,f.auth)).status,400);
 for(const [stored,searched]of [['äöü-001','ÄÖÜ-001'],['é-001','e\u0301-001'],['ＡＢＣ-001','abc-001'],['ﬀ-001','FF-001'],['σ-001','ς-001']]){
  const row=await f.create({serialNumber:stored}),result=await(await f.request('/api/returns/serial-lookup?serialNumber='+encodeURIComponent(searched),'GET',undefined,f.auth)).json();assert.equal(result.total,1);assert.equal(result.items[0].id,row.id);assert.equal(result.items[0].serialNumber,stored);
 }
 await writeInventoryRow(f.app.store.db,'returns',{replacementSerialNumber:'RAW-INDEX'},replacement.id);
 assert.equal((await(await f.request('/api/returns/serial-lookup?serialNumber=NEW-KEY','GET',undefined,f.auth)).json()).total,0);
 assert.equal((await(await f.request('/api/returns/serial-lookup?serialNumber=raw-index','GET',undefined,f.auth)).json()).total,1);
 await f.app.store.deleteReturn(replacement.id);assert.equal((await f.app.store.db.query('SELECT 1 FROM return_serial_search WHERE returnId=$1',[replacement.id])).rowCount,0);
});

test('completion enrichment restricts history to requested closed returns and empty lists perform no query',async t=>{
 const f=await fixture(t),one=await f.create(),workflow=createReturnWorkflow({store:f.app.store,users:f.app.users});
 const query=f.app.store.db.query.bind(f.app.store.db),calls=[];f.app.store.db.query=async(sql,values)=>{calls.push([sql,values]);return query(sql,values);};
 try{
  assert.deepEqual(await workflow.enrichReturns([],f.user),[]);assert.equal(calls.length,0);
  await workflow.enrichReturns([one],f.user);assert.equal(calls.some(([sql])=>/FROM audit/.test(sql)),false,'open return needs no completion history');
  calls.length=0;await workflow.enrichReturns([{...one,isClosed:true}],f.user);
  const history=calls.find(([sql])=>/FROM audit/.test(sql));assert.ok(history);assert.ok(history[1].some(value=>JSON.parse(value).includes(String(one.id))),'selected IDs bound to completion query');
 }finally{f.app.store.db.query=query;}
});

test('opt-in paged returns filter and sort globally while default list stays an array',async t=>{
 const f=await fixture(t);for(let i=0;i<12;i++)await f.create({serialNumber:'SN-'+String(i).padStart(3,'0'),customerReference:i%2?'ODD':'EVEN',statusId:i%2?13:12});
 assert.ok(Array.isArray(await(await f.request('/api/returns','GET',undefined,f.auth)).json()));
 const page=await(await f.request('/api/returns?page=2&pageSize=3&statusId=13&sort=serialNumber&direction=asc','GET',undefined,f.auth)).json();
 assert.equal(page.total,6);assert.equal(page.page,2);assert.deepEqual(page.items.map(row=>row.serialNumber),['SN-007','SN-009','SN-011']);assert.ok(page.items.every(row=>row.attachmentCount===0));
 const found=await(await f.request('/api/returns?page=1&pageSize=3&search=SN-011','GET',undefined,f.auth)).json();assert.equal(found.total,1);assert.equal(found.items[0].serialNumber,'SN-011');
 for(const query of ['page=0','page=1&pageSize=1001','page=1&sort=id;DROP TABLE returns','page=1&statusId=no','page=1&page=2'])assert.equal((await f.request('/api/returns?'+query,'GET',undefined,f.auth)).status,400,query);
 assert.equal((await f.request('/api/returns?page=1')).status,401);
 const supplier=await f.app.store.createMasterData('suppliers',{name:'Unique supplier label'}),reason=await f.app.store.createMasterData('reasons',{name:'Unique reason label'}),special=await f.create({serialNumber:'SPECIAL',supplierId:supplier.id,reasonId:reason.id,assignedUserId:f.user.id});
 for(const text of [supplier.name,reason.name,f.user.displayName]){const result=await(await f.request('/api/returns?page=1&pageSize=3&search='+encodeURIComponent(text),'GET',undefined,f.auth)).json();assert.equal(result.total,1,text);assert.equal(result.items[0].id,special.id);}
});

test('migration backfills existing serials and portable format2 restore rebuilds derived keys without altering original rows',async t=>{
 const f=await fixture(t),one=await f.create({serialNumber:'Straße-001',replacementSerialNumber:'ÄBC-002'}),db=f.app.store.db;
 await db.query('DROP TABLE return_serial_search');await db.query('DROP TABLE return_versions');await db.query('DROP TABLE product_versions');await db.query('DROP TABLE sso_access_requests');await db.query('DROP TABLE sso_identities');await db.query('DROP TABLE sso_providers');await db.query('DELETE FROM schema_migrations WHERE version>=3');for(const name of ['returns_created','returns_status_created','returns_assignee_created','audit_returns_completion'])await db.query('DROP INDEX '+name);
 await migratePostgres(db);assert.equal((await db.query('SELECT serialKey FROM return_serial_search WHERE returnId=$1',[one.id])).rows[0].serialkey??(await db.query('SELECT serialKey FROM return_serial_search WHERE returnId=$1',[one.id])).rows[0].serialKey,'STRASSE-001');
 const path=join(f.dataDir,'portable.jsonl');await exportData(db,path);
 const records=readFileSync(path,'utf8').trim().split('\n').map(JSON.parse);assert.equal(records[0].schema,4);assert.ok(records.every(row=>row.table!=='return_serial_search'));
 const schema='rb_stage_'+randomBytes(16).toString('hex'),admin=await openDatabase(f.databaseConfig);await admin.query('CREATE SCHEMA "'+schema+'"');let restored;
 try{restored=await openDatabase(f.databaseConfig,schema);await importData(restored,path);const source=(await db.query('SELECT * FROM returns ORDER BY id')).rows;assert.deepEqual((await restored.query('SELECT * FROM returns ORDER BY id')).rows,source);assert.equal((await restored.query('SELECT COUNT(*) AS n FROM return_serial_search')).rows[0].n,1);}finally{await restored?.close();await admin.query('DROP SCHEMA "'+schema+'" CASCADE');await admin.close();}
});
