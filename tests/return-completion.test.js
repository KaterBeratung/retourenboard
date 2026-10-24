import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import {runtimeFixture} from './helpers/runtime.js';
async function fixture(t){const f=await runtimeFixture(t),{auth}=await f.setup(),product=await f.app.store.createProduct({name:'Workflow device',sku:'FLOW'}),masters=await f.app.store.listMasterData();return {...f,auth,product,masters};}
const base=f=>({productId:f.product.id,serialNumber:'FLOW-SN',statusId:12});

test('a completed return needs a decided resolution and then protects its recorded data',async t=>{
 const f=await fixture(t);assert.equal((await f.request('/api/returns','POST',{...base(f),statusId:15},f.auth)).status,400);
 const response=await f.request('/api/returns','POST',{...base(f),statusId:15,resolutionId:17},f.auth);assert.equal(response.status,201);const row=await response.json();
 assert.equal((await f.request('/api/returns/'+row.id,'PUT',{...row,notes:'Changed after completion'},f.auth)).status,409);
 assert.equal((await f.request('/api/returns/'+row.id,'PUT',row,f.auth)).status,200);
 assert.equal((await f.request('/api/returns/'+row.id,'PUT',{...row,statusId:12,allowReopen:true},f.auth)).status,409);
});

test('completion policy supports configurable notes and replacement mappings without matching translated names',async t=>{
 const f=await fixture(t),custom=await f.app.store.createMasterData('resolutions',{name:'Customer exchange'});
 const changed=await f.request('/api/admin/rules','PUT',{completionRequiredFields:['resolution','notes'],exchangeResolutionIds:[custom.id]},f.auth);assert.equal(changed.status,200);
 const input={...base(f),statusId:15,resolutionId:custom.id};assert.equal((await f.request('/api/returns','POST',input,f.auth)).status,400);
 assert.equal((await f.request('/api/returns','POST',{...input,notes:'Checked'},f.auth)).status,400);
 assert.equal((await f.request('/api/returns','POST',{...input,notes:'Checked',replacementSerialNumber:'NEW-SN'},f.auth)).status,201);
 for(const patch of [{completionRequiredFields:['unknown']},{requireCompletedDisposal:'yes'},{exchangeResolutionIds:[15]},{disposalResolutionIds:[-1]}])assert.equal((await f.request('/api/admin/rules','PUT',patch,f.auth)).status,400);
});

test('linked disposal must be completed before return completion and new orders cannot bypass a completed return',async t=>{
 const f=await fixture(t),row=await f.app.store.createReturn(base(f)),admin=await f.app.users.get(1),order=await f.app.disposals.create(admin,{returnId:row.id,mode:'destroy'});
 assert.equal((await f.request('/api/returns/'+row.id,'PUT',{...row,statusId:15,resolutionId:17},f.auth)).status,400);
 const approved=await f.app.disposals.change(admin,order.id,'approve',{revision:1});await f.app.disposals.change(admin,order.id,'complete',{revision:approved.revision,completedOn:'2026-10-15',method:'Shred',performedBy:'Operator'});
 assert.equal((await f.request('/api/returns/'+row.id,'PUT',{...row,statusId:15,resolutionId:17},f.auth)).status,200);
 assert.equal((await f.request('/api/disposals','POST',{returnId:row.id,mode:'dispose'},f.auth)).status,409);
});

test('pending completion inspection explains missing fields without changing the return',async t=>{
 const f=await fixture(t),row=await f.app.store.createReturn(base(f)),response=await f.request('/api/returns/'+row.id+'/workflow','GET',undefined,f.auth);assert.equal(response.status,200);const state=await response.json();assert.equal(state.completion.ok,false);assert.ok(state.completion.issues.some(issue=>issue.field==='resolutionId'));assert.equal((await f.app.store.getReturn(row.id)).isClosed,false);
});

test('concurrent completion and disposal creation never leave an open order on a closed return',async t=>{
 const f=await fixture(t),row=await f.app.store.createReturn(base(f));
 const results=await Promise.all([f.request('/api/returns/'+row.id,'PUT',{...row,statusId:15,resolutionId:17},f.auth),f.request('/api/disposals','POST',{returnId:row.id,mode:'destroy'},f.auth)]);
 assert.ok(results.some(response=>response.status===200||response.status===201));const saved=await f.app.store.getReturn(row.id),orders=(await f.app.store.db.query("SELECT id FROM disposals WHERE returnId=$1 AND status IN ('planned','approved')",[row.id])).rows;assert.equal(saved.isClosed&&orders.length>0,false);
});

test('linked device serials cannot drift away from their disposal record',async t=>{
 const f=await fixture(t),row=await f.app.store.createReturn(base(f));await f.app.disposals.create(await f.app.users.get(1),{returnId:row.id,mode:'destroy'});
 assert.equal((await f.request('/api/returns/'+row.id,'PUT',{...row,serialNumber:'OTHER'},f.auth)).status,409);assert.equal((await f.app.store.getReturn(row.id)).serialNumber,row.serialNumber);
});
