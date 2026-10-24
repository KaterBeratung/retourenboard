import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import {runtimeFixture} from './helpers/runtime.js';
async function fixture(t){const f=await runtimeFixture(t);const {auth}=await f.setup();return {...f,auth};}
const input={productName:'SSD 1 TB',serialNumber:'SSD-0001',mode:'destroy',notes:'Keine Wiederverwendung'};
async function create(f,value=input){const r=await f.request('/api/disposals','POST',value,f.auth);assert.equal(r.status,201,await r.clone().text());return r.json();}

test('a standalone device follows approval and documented completion without changing the catalog',async t=>{
 const f=await fixture(t),d=await create(f);assert.equal(d.status,'planned');assert.match(d.disposalNumber,/^DIS-\d{4}-\d+$/);
 assert.equal((await f.request('/api/disposals/'+d.id+'/label?kind=certificate','GET',undefined,f.auth)).status,409);
 const p=await f.request('/api/disposals/'+d.id+'/approve','POST',{revision:d.revision},f.auth);assert.equal(p.status,200);const approved=await p.json();
 assert.equal((await f.request('/api/disposals/'+d.id+'/complete','POST',{revision:approved.revision},f.auth)).status,400);
 const completed=await f.request('/api/disposals/'+d.id+'/complete','POST',{revision:approved.revision,completedOn:'2026-10-15',method:'Physisch zerkleinert',performedBy:'Testbetrieb'},f.auth);assert.equal(completed.status,200);const done=await completed.json();assert.equal(done.status,'completed');
 const label=await f.request('/api/disposals/'+d.id+'/label?kind=certificate','GET',undefined,f.auth);assert.equal(label.status,200);const certificate=await label.json();assert.equal(certificate.details.method,'Physisch zerkleinert');assert.match(certificate.qrDataUrl,/^data:image\/png;base64,/);
 const details=await(await f.request('/api/disposals/'+d.id,'GET',undefined,f.auth)).json();assert.deepEqual(details.events.map(e=>e.action),['create','approve','complete']);assert.equal((await f.app.store.listProducts()).length,0);
 assert.equal((await f.request('/api/disposals/'+d.id,'PUT',{...input,revision:done.revision,productName:'Changed'},f.auth)).status,409);
});

test('return linkage snapshots the individual device and active duplicate serials are rejected atomically',async t=>{
 const f=await fixture(t),p=await f.app.store.createProduct({name:'Drive',sku:'DRIVE'}),r=await f.app.store.createReturn({productId:p.id,serialNumber:'LINK-SN'});
 const d=await create(f,{returnId:r.id,mode:'erase'});assert.equal(d.serialNumber,'LINK-SN');assert.equal(d.productId,p.id);assert.equal(d.productName,'Drive');
 assert.equal((await f.request('/api/disposals','POST',{...input,serialNumber:' link-sn '},f.auth)).status,409);
 await f.app.store.deleteReturn(r.id);await f.app.store.deleteProduct(p.id);const stored=await(await f.request('/api/disposals/'+d.id,'GET',undefined,f.auth)).json();assert.equal(stored.productName,'Drive');assert.equal(stored.serialNumber,'LINK-SN');assert.equal(stored.returnId,null);
});

test('permission defaults, CSRF and stale revisions prevent unauthorized or competing transitions',async t=>{
 const f=await fixture(t);await f.app.users.create({username:'Member',role:'member',password:'Disposal-member-password!'});const m=await f.login('Member','Disposal-member-password!');
 const d=await create(f);assert.equal((await f.request('/api/disposals/'+d.id+'/approve','POST',{revision:d.revision},m.auth)).status,403);
 assert.equal((await f.request('/api/disposals/'+d.id+'/approve','POST',{revision:d.revision},{Cookie:f.auth.Cookie})).status,403);
 const responses=await Promise.all([1,2].map(()=>f.request('/api/disposals/'+d.id+'/approve','POST',{revision:d.revision},f.auth)));assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
 assert.equal((await f.request('/api/disposals','GET')).status,401);
 const viewer=await f.app.users.create({username:'Restricted',role:'member',password:'Disposal-restricted-password!',permissions:{disposalsRead:false}});const login=await f.login(viewer.username,'Disposal-restricted-password!');assert.equal((await f.request('/api/disposals','GET',undefined,login.auth)).status,403);
});

test('search and counts use the same filters and cancellation preserves its reason',async t=>{
 const f=await fixture(t),d=await create(f);await create(f,{...input,serialNumber:'OTHER-1',mode:'dispose'});
 const result=await(await f.request('/api/disposals?search=SSD-0001','GET',undefined,f.auth)).json();assert.equal(result.total,1);assert.equal(result.counts.planned,1);assert.equal(result.items.length,1);
 assert.equal((await f.request('/api/disposals/'+d.id+'/cancel','POST',{revision:d.revision},f.auth)).status,400);
 const cancelled=await f.request('/api/disposals/'+d.id+'/cancel','POST',{revision:d.revision,reason:'Irrtümlich erfasst'},f.auth);assert.equal(cancelled.status,200);assert.equal((await cancelled.json()).status,'cancelled');
 assert.equal((await f.request('/api/disposals/'+d.id+'/label?kind=certificate','GET',undefined,f.auth)).status,409);
});

test('device export preview import preserves completed proof and history with atomic duplicate refusal',async t=>{
 const source=await fixture(t),target=await fixture(t),d=await create(source);const approved=await(await source.request('/api/disposals/'+d.id+'/approve','POST',{revision:d.revision},source.auth)).json();
 await source.request('/api/disposals/'+d.id+'/complete','POST',{revision:approved.revision,completedOn:'2026-10-15',method:'Geschreddert',performedBy:'Operator'},source.auth);
 const exported=await source.request('/api/disposals/export','GET',undefined,source.auth);assert.equal(exported.status,200);const data=await exported.json();assert.equal(data.format,'retourenboard-disposals');assert.equal(data.items[0].events.length,3);
 const preview=await target.request('/api/disposals/import/preview','POST',{data},target.auth);assert.equal(preview.status,200);assert.equal((await preview.json()).count,1);assert.equal((await target.app.store.db.query('SELECT COUNT(*) AS n FROM disposals')).rows[0].n,0);
 const imported=await target.request('/api/disposals/import/commit','POST',{data},target.auth);assert.equal(imported.status,200,await imported.clone().text());assert.equal((await imported.json()).imported,1);
 const row=(await(await target.request('/api/disposals','GET',undefined,target.auth)).json()).items[0];assert.equal(row.status,'completed');assert.equal(row.disposalNumber,d.disposalNumber);assert.equal(row.details.method,'Geschreddert');
 const details=await(await target.request('/api/disposals/'+row.id,'GET',undefined,target.auth)).json();assert.equal(details.events.length,4);assert.equal(details.events.at(-1).action,'import');
 assert.equal((await target.request('/api/disposals/import/commit','POST',{data},target.auth)).status,409);assert.equal((await target.app.store.db.query('SELECT COUNT(*) AS n FROM disposals')).rows[0].n,1);
 await target.app.users.create({username:'Importer',role:'member',password:'Disposal-import-password!',permissions:{disposalsImport:true}});const member=await target.login('Importer','Disposal-import-password!');assert.equal((await target.request('/api/disposals/import/preview','POST',{data},member.auth)).status,403);
});
test('linked serial objects and forged approval fields are controlled input errors',async t=>{
 const f=await fixture(t),product=await f.app.store.createProduct({name:'Disk',sku:'SN-INPUT'}),r=await f.app.store.createReturn({productId:product.id,serialNumber:'GOOD'});
 assert.equal((await f.request('/api/disposals','POST',{returnId:r.id,serialNumber:{toString:null},mode:'destroy'},f.auth)).status,400);
 assert.equal((await f.request('/api/disposals','POST',{...input,status:'completed'},f.auth)).status,400);
 assert.equal((await f.app.store.db.query('SELECT COUNT(*) AS n FROM disposals')).rows[0].n,0);
});

test('proof history survives a portable backup and impossible imported status histories are rejected',async t=>{
 const f=await fixture(t),d=await create(f);const approved=await(await f.request('/api/disposals/'+d.id+'/approve','POST',{revision:d.revision},f.auth)).json();await f.request('/api/disposals/'+d.id+'/complete','POST',{revision:approved.revision,completedOn:'2026-10-15',method:'Shred',performedBy:'Operator'},f.auth);
 const {exportData,importData}=await import('../dist/server/database/data-transfer.js'),{validateTransferredData}=await import('../dist/server/database/validate-data.js'),{postgresFixture}=await import('./helpers/postgres.js'),{join}=await import('node:path');
 const backup=join(f.dataDir,'proof.jsonl'),target=await postgresFixture(t);await exportData(f.app.store.db,backup);await importData(target.database,backup);await validateTransferredData(target.database,f.dataDir);assert.equal((await target.database.query('SELECT COUNT(*) AS n FROM disposal_events')).rows[0].n,3);
 const data=await(await f.request('/api/disposals/export','GET',undefined,f.auth)).json(),entry=data.items[0];entry.status='cancelled';entry.revision++;entry.details.cancellationReason='Forged cancellation';const {events,...snapshot}=entry;events.push({revision:entry.revision,action:'cancel',actorName:'Operator',createdAt:new Date().toISOString(),snapshot});
 const other=await fixture(t);assert.equal((await other.request('/api/disposals/import/preview','POST',{data},other.auth)).status,400);
 const original=JSON.parse((await target.database.query('SELECT snapshot FROM disposal_events ORDER BY id DESC LIMIT 1')).rows[0].snapshot);delete original.details.method;await target.database.query('UPDATE disposal_events SET snapshot=$1 WHERE revision=3',[JSON.stringify(original)]);await assert.rejects(validateTransferredData(target.database,f.dataDir));
});

test('backup validation checks historical device snapshots as well as current rows',async t=>{
 const f=await fixture(t),d=await create(f);const {validateTransferredData}=await import('../dist/server/database/validate-data.js');const snapshot={...d,details:{notes:{invalid:true}}};await f.app.store.db.query('UPDATE disposal_events SET snapshot=$1 WHERE disposalId=$2',[JSON.stringify(snapshot),d.id]);await assert.rejects(validateTransferredData(f.app.store.db,f.dataDir));
});

test('queued disposal approval rechecks revoked permissions without appending evidence',async t=>{
 const f=await fixture(t),d=await create(f),member=await f.app.users.create({username:'Approver',role:'member',password:'Disposal-approve-password!',permissions:{disposalsApprove:true}}),login=await f.login('Approver','Disposal-approve-password!');
 let release;const block=f.app.coordinator.run(()=>new Promise(resolve=>release=resolve));await new Promise(resolve=>setImmediate(resolve));let arrived;const arrival=new Promise(resolve=>arrived=resolve),run=f.app.coordinator.run;f.app.coordinator.run=async job=>{arrived();return run(job);};
 const pending=f.request('/api/disposals/'+d.id+'/approve','POST',{revision:1},login.auth);await arrival;await f.app.users.update(member.id,{permissions:{disposalsApprove:false}});release();await block;assert.equal((await pending).status,403);
 const after=await f.app.disposals.details(await f.app.users.get(1),d.id);assert.equal(after.status,'planned');assert.equal(after.events.length,1);
});

test('corrections require edit permission and preserve the prior completion snapshot in backups',async t=>{
 const f=await fixture(t),d=await create(f),admin=await f.app.users.get(1),approved=await f.app.disposals.change(admin,d.id,'approve',{revision:1}),done=await f.app.disposals.change(admin,d.id,'complete',{revision:approved.revision,completedOn:'2026-10-15',method:'First method',performedBy:'First operator'});
 const member=await f.app.users.create({username:'Completer',role:'member',password:'Disposal-complete-password!',permissions:{disposalsComplete:true,disposalsEdit:false}}),login=await f.login(member.username,'Disposal-complete-password!'),payload={revision:done.revision,completedOn:'2026-10-15',method:'Correct method',performedBy:'Correct operator',correctionReason:'Wrong operator recorded'};
 assert.equal((await f.request('/api/disposals/'+d.id+'/correct','POST',payload,login.auth)).status,403);assert.equal((await f.request('/api/disposals/'+d.id+'/correct','POST',payload,f.auth)).status,200);
 const after=await f.app.disposals.details(admin,d.id);assert.equal(after.revision,4);assert.equal(after.events[2].snapshot.details.method,'First method');assert.equal(after.events[3].snapshot.details.method,'Correct method');
 const {validateTransferredData}=await import('../dist/server/database/validate-data.js');await validateTransferredData(f.app.store.db,f.dataDir);
});

test('concurrent approval cannot produce an export with mismatched record and history revisions',async t=>{
 const f=await fixture(t),target=await fixture(t),d=await create(f),admin=await f.app.users.get(1);
 const {openDatabase}=await import('../dist/server/database/connection.js'),{createStore}=await import('../dist/server/store.js'),{createDisposals}=await import('../dist/server/disposals.js');
 const connection=await openDatabase(f.databaseConfig,f.app.store.db.schema);t.after(()=>connection.close());const writer=createDisposals({store:await createStore({database:connection})}),query=f.app.store.db.query;let changed=false;
 f.app.store.db.query=async function(sql,params){const result=await query(sql,params);if(!changed&&sql==='SELECT * FROM disposals ORDER BY id LIMIT 5001'){changed=true;await writer.change(admin,d.id,'approve',{revision:1});}return result;};
 const response=await f.request('/api/disposals/export','GET',undefined,f.auth);assert.equal(response.status,200);const data=await response.json();assert.equal(changed,true);assert.equal(data.items[0].events.length,data.items[0].revision);
 assert.equal((await target.request('/api/disposals/import/preview','POST',{data},target.auth)).status,200);
});

test('exact record lookup is separate from substring search and retained list filters',async t=>{
 const f=await fixture(t),d=await create(f);await create(f,{...input,serialNumber:'MISLEADING',productName:'Contains '+d.disposalNumber});
 const result=await(await f.request('/api/disposals?number='+d.disposalNumber,'GET',undefined,f.auth)).json();assert.equal(result.total,1);assert.equal(result.items[0].id,d.id);
});
