import test from './helpers/postgres-context.js';import assert from 'node:assert/strict';import {runtimeFixture,testPassword} from './helpers/runtime.js';
async function fixture(t){const f=await runtimeFixture(t),{auth}=await f.setup(),p=await f.app.store.createProduct({name:'Workflow',sku:'FLOW-API'});return {...f,auth,p};}
test('reopening requires a reason and both rights and records its reason in the timeline',async t=>{
 const f=await fixture(t),r=await f.app.store.createReturn({productId:f.p.id,serialNumber:'REOPEN',statusId:15,resolutionId:17});
 assert.equal((await f.request('/api/returns/'+r.id+'/reopen','POST',{statusId:12,revision:r.revision,expectedUpdatedAt:r.updatedAt},f.auth)).status,400);
 const member=await f.app.users.create({username:'StatusOnly',password:testPassword,role:'member',permissions:{returnsEdit:false}}),login=await f.login(member.username);
 const body={statusId:12,reason:'Customer reported the same defect',revision:r.revision,expectedUpdatedAt:r.updatedAt};assert.equal((await f.request('/api/returns/'+r.id+'/reopen','POST',body,login.auth)).status,403);
 const response=await f.request('/api/returns/'+r.id+'/reopen','POST',body,f.auth);assert.equal(response.status,200);assert.equal((await response.json()).isClosed,false);
 const timeline=await(await f.request('/api/returns/'+r.id+'/timeline','GET',undefined,f.auth)).json();assert.ok(timeline.items.some(item=>item.reopenReason===body.reason));
 assert.equal((await f.request('/api/returns/'+r.id+'/reopen','POST',body,f.auth)).status,409);
});
test('handover changes status responsibility and next step atomically and rejects stale or inactive targets',async t=>{
 const f=await fixture(t),r=await f.app.store.createReturn({productId:f.p.id,serialNumber:'HANDOVER'}),person=await f.app.users.create({username:'Handler',password:testPassword,role:'member'}),body={statusId:13,assignedUserId:person.id,nextStep:'Inspect the disk',revision:r.revision,expectedUpdatedAt:r.updatedAt};
 assert.equal((await f.request('/api/returns/'+r.id+'/handover','POST',{...body,nextStep:''},f.auth)).status,400);
 const response=await f.request('/api/returns/'+r.id+'/handover','POST',body,f.auth);assert.equal(response.status,200);const saved=await response.json();assert.equal(saved.statusId,13);assert.equal(saved.assignedUserId,person.id);assert.equal(saved.nextStep,body.nextStep);
 assert.equal((await f.request('/api/returns/'+r.id+'/handover','POST',body,f.auth)).status,409);await f.app.users.update(person.id,{active:false});assert.equal((await f.request('/api/returns/'+r.id+'/handover','POST',{...body,revision:saved.revision,expectedUpdatedAt:saved.updatedAt},f.auth)).status,400);
});
test('serial lookup matches exact normalized original and replacement identifiers and respects disposal rights',async t=>{
 const f=await fixture(t),one=await f.app.store.createReturn({productId:f.p.id,serialNumber:'SN-ABC',replacementSerialNumber:'NEW-ABC'});await f.app.store.createReturn({productId:f.p.id,serialNumber:'SN-ABC-OTHER'});const admin=await f.app.users.get(1);await f.app.disposals.create(admin,{returnId:one.id,mode:'destroy'});
 for(const serial of [' sn-abc ','ＳＮ-ＡＢＣ','new-abc']){const response=await f.request('/api/returns/serial-lookup?serialNumber='+encodeURIComponent(serial),'GET',undefined,f.auth);assert.equal(response.status,200);const data=await response.json();assert.deepEqual(data.items.map(item=>item.id),[one.id]);assert.equal(data.items[0].disposalSummary.open,1);}
 const viewer=await f.app.users.create({username:'NoDisposals',password:testPassword,role:'member',permissions:{disposalsRead:false}}),login=await f.login(viewer.username);const data=await(await f.request('/api/returns/serial-lookup?serialNumber=SN-ABC','GET',undefined,login.auth)).json();assert.equal(data.items[0].disposalSummary,undefined);
 const inspection=await(await f.request('/api/returns/'+one.id+'/workflow','GET',undefined,login.auth)).json();assert.equal(inspection.disposals,undefined);assert.equal(inspection.completion.disposalCheck.pending,true);assert.doesNotMatch(JSON.stringify(inspection),/DIS-\d{4}-/);
 const order=(await f.app.store.db.query('SELECT id,revision FROM disposals WHERE returnId=$1',[one.id])).rows[0],approved=await f.app.disposals.change(admin,order.id,'approve',{revision:order.revision});await f.app.disposals.change(admin,order.id,'complete',{revision:approved.revision,completedOn:'2026-10-16',method:'Test only',performedBy:'Test'});const completedInspection=await(await f.request('/api/returns/'+one.id+'/workflow','GET',undefined,login.auth)).json();assert.equal(completedInspection.completion.disposalCheck.matchingCompleted,true);assert.equal(completedInspection.completion.disposalCheck.pending,false);assert.doesNotMatch(JSON.stringify(completedInspection),/DIS-\d{4}-/);
 assert.equal((await f.request('/api/returns/serial-lookup?serialNumber=SN-ABC')).status,401);
});
