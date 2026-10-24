import {test} from 'node:test';
import assert from 'node:assert/strict';
import {postgresFixture} from './helpers/postgres.js';
import {createStore} from '../dist/server/store.js';
import {createUsers} from '../dist/server/users.js';
import {createAudit} from '../dist/server/audit.js';
import {createPreferences} from '../dist/server/preferences.js';
import {createCollaboration} from '../dist/server/collaboration.js';
import {createNotifications} from '../dist/server/notifications.js';
import {createMail} from '../dist/server/mail.js';
import {createSecrets} from '../dist/server/secrets.js';
import {exportInventory,previewInventoryImport,commitInventoryImport} from '../dist/server/inventory-transfer.js';
const password='Postgres-workflow-password!';
async function fixture(t){const f=await postgresFixture(t),store=await createStore({database:f.database}),users=createUsers(store),admin=await users.createFirst({username:'Admin',password}),preferences=createPreferences(f.database);return {...f,store,users,admin,preferences};}

test('PostgreSQL audits keep concurrent actors separate and failed audits roll back business data',async t=>{
 const {store,database:db}=await fixture(t),audit=createAudit(store);
 await Promise.all([audit.wrap({id:1,name:'Actor A',source:'test'},async()=>{await new Promise(r=>setTimeout(r,15));await store.createProduct({name:'A',sku:'ACTOR-A'});}),audit.wrap({id:2,name:'Actor B',source:'test'},async()=>{await store.createProduct({name:'B',sku:'ACTOR-B'});})]);
 const rows=(await db.query("SELECT actorName,changes FROM audit WHERE entity='products' ORDER BY actorName")).rows;
 assert.deepEqual(rows.map(r=>[r.actorName,JSON.parse(r.changes).sku.after]),[['Actor A','ACTOR-A'],['Actor B','ACTOR-B']]);
 const original=store.db.query;store.db.query=async function(sql,values){if(/^INSERT INTO audit/i.test(sql))throw Error('forced audit failure');return original.call(this,sql,values);};
 try{await assert.rejects(store.createProduct({name:'Fail',sku:'AUDIT-FAIL'}),/forced audit failure/);}finally{store.db.query=original;}
 assert.equal(await store.findProduct('AUDIT-FAIL'),null);
});

test('PostgreSQL inventory preview rolls back and complete transfer retains custom status and image',async t=>{
 const source=await fixture(t),target=await fixture(t);
 await source.store.createMasterData('statuses',{name:'Sonderprüfung',tone:'checking'});
 const image={name:'demo.png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jK1sAAAAASUVORK5CYII='};
 const p=await source.store.createProduct({name:'Monitor',sku:'TRANSFER-1',image});
 await source.store.createReturn({productId:p.id,serialNumber:'SN-001',replacementSerialNumber:'SN-ERSATZ',trackingNumber:'00000123',status:'Sonderprüfung',receiptDate:'2026-10-15'});
 const exported=await exportInventory(source.store),text=JSON.stringify(exported),options={duplicates:'update',createMissingMasterdata:true};
 const preview=await previewInventoryImport(target.store,text,options);assert.equal(preview.errors.length,0);assert.equal((await target.store.listProducts()).length,0);
 assert.equal((await target.store.listMasterData()).statuses.some(x=>x.name==='Sonderprüfung'),false);
 await commitInventoryImport(target.store,text,options,()=>{});
 const received=await exportInventory(target.store);assert.equal(received.products[0].image.data,image.data);assert.equal(received.returns[0].status,'Sonderprüfung');assert.equal(received.returns[0].trackingNumber,'00000123');assert.equal(received.returns[0].replacementSerialNumber,'SN-ERSATZ');
});

test('PostgreSQL direct chats deduplicate and private group removal blocks message access',async t=>{
 const {store,users,admin,preferences,dataDir}=await fixture(t),member=await users.create({username:'Member',password}),outsider=await users.create({username:'Outsider',password});
 const chat=await createCollaboration({store,users,preferences,dataDir});t.after(()=>chat.dispose());
 const direct=await Promise.all([chat.createChannel(admin,{kind:'direct',userId:member.id}),chat.createChannel(member,{kind:'direct',userId:admin.id})]);assert.equal(direct[0].id,direct[1].id);
 const group=await chat.createChannel(admin,{kind:'group',name:'Privat',memberIds:[member.id],visibility:'private'});
 await chat.postMessage(admin,group.id,{text:'Nur für unsere Gruppe'});
 assert.equal((await chat.messages(member,group.id,new URLSearchParams())).items.length,1);
 await assert.rejects(chat.messages(outsider,group.id,new URLSearchParams()),error=>error.status===404);
 await chat.updateChannel(admin,group.id,{memberIds:[]});await assert.rejects(chat.messages(member,group.id,new URLSearchParams()),error=>error.status===404);
});

test('PostgreSQL channel lists hide private groups and message cursors retain literal Unicode search',async t=>{
 const {store,users,admin,preferences,dataDir}=await fixture(t),outsider=await users.create({username:'Outsider',password});
 const chat=await createCollaboration({store,users,preferences,dataDir});t.after(()=>chat.dispose());
 const group=await chat.createChannel(admin,{kind:'group',name:'Vertraulich',memberIds:[],visibility:'private'});
 assert.equal((await chat.channels(outsider)).some(channel=>channel.id===group.id),false);
 const first=await chat.postMessage(admin,group.id,{text:'Mönitor Åbc eins'}),second=await chat.postMessage(admin,group.id,{text:'Mönitor Åbc zwei'});
 const previous=await chat.messages(admin,group.id,{before:String(second.id)});assert.deepEqual(previous.items.map(item=>item.id),[first.id]);
 assert.equal((await chat.searchMessages(admin,group.id,{q:'Åbc'})).items.length,2);
 assert.equal((await chat.searchMessages(admin,group.id,{q:'%'})).items.length,0);
});

test('PostgreSQL imported return events group once without duplicate notifications',async t=>{
 const {store,admin,preferences,dataDir,database:db}=await fixture(t),audit=createAudit(store),clock={now:()=>Date.parse('2026-10-15T12:00:00Z')};
 const mail=createMail({store,secrets:createSecrets(dataDir),dataDir,preferences,clock}),notifications=createNotifications({store,preferences,mail,clock});t.after(()=>mail.close());
 const p=await store.createProduct({name:'Import',sku:'NOTIFY'});
 await audit.wrap({id:admin.id,name:admin.displayName,source:'import',operationId:'batch-1'},async()=>{for(const serialNumber of ['N-1','N-2'])await store.createReturn({productId:p.id,serialNumber,receiptDate:'2026-10-15'});});
 await notifications.drain();await notifications.drain();
 const rows=(await db.query("SELECT message FROM notifications WHERE userId=$1 AND kind='newReturn'",[admin.id])).rows;
 assert.equal(rows.length,1);assert.equal(rows[0].message,'2 Retouren wurden importiert.');
});
