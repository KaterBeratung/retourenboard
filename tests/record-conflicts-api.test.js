import {test} from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import {createApp} from './helpers/postgres-fixtures.js';

async function fixture(t){
 const app=await createApp({secureCookies:false});await app.users.createFirst({username:'admin',displayName:'Admin',password:'Testpasswort-2026!'});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>app.close());
 const base=`http://127.0.0.1:${app.server.address().port}`;let auth={};
 const request=async(path,method='GET',body)=>fetch(base+path,{method,headers:{Origin:base,'Content-Type':'application/json',...auth},body:body===undefined?undefined:JSON.stringify(body)});
 const res=await request('/api/login','POST',{username:'admin',password:'Testpasswort-2026!'}),login=await res.json();auth={Cookie:res.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':login.csrfToken};
 const p=await app.store.createProduct({name:'Gerät',sku:'HTTP',price:'100.00'}),r=await app.store.createReturn({productId:p.id,serialNumber:'HTTP-SN',receiptDate:'2026-10-16'});
 return {app,request,p,r};
}
test('HTTP edits and deletes require the revision the user read',async t=>{
 const {request,p,r,app}=await fixture(t);
 assert.equal((await request(`/api/products/${p.id}`,'PUT',{name:'Ohne Version',sku:p.sku})).status,428);
 assert.equal((await request(`/api/returns/${r.id}`,'DELETE',{})).status,428);
 assert.equal((await request(`/api/products/${p.id}`,'PUT',{...p,name:'Neu'})).status,200);
 assert.equal((await request(`/api/products/${p.id}`,'PUT',{...p,name:'Veraltet'})).status,409);
 assert.equal((await app.store.getProduct(p.id)).name,'Neu');
 assert.equal((await request(`/api/products/${p.id}`,'DELETE',{revision:p.revision})).status,409);
});
test('status, bulk and undo use revisions atomically',async t=>{
 const {request,r,app}=await fixture(t),statuses=(await app.store.listMasterData()).statuses,checking=statuses.find(s=>s.builtinKey==='statuses.checking').id;
 assert.equal((await request(`/api/returns/${r.id}/status`,'PUT',{statusId:checking})).status,428);
 let res=await request(`/api/returns/${r.id}/status`,'PUT',{statusId:checking,revision:r.revision});assert.equal(res.status,200);
 const changed=await res.json();assert.equal(changed.revision,2);
 assert.equal((await request('/api/returns/bulk/status','POST',{ids:[r.id],statusId:r.statusId,revisions:{[r.id]:1}})).status,409);
 res=await request('/api/returns/status/undo','POST',{token:changed.undo.token});assert.equal(res.status,200);
 const restored=(await res.json()).items[0];assert.equal(restored.revision,3);assert.equal(restored.statusId,r.statusId);
 assert.equal((await request(`/api/returns/${r.id}`,'PUT',{...changed,notes:'Old edit'})).status,409);
 assert.equal((await app.store.getReturn(r.id)).revision,3);
});
