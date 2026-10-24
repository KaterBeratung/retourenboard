import test from './helpers/postgres-context.js';import assert from 'node:assert/strict';import {runtimeFixture} from './helpers/runtime.js';
async function fixture(t){const f=await runtimeFixture(t),{auth}=await f.setup(),p=await f.app.store.createProduct({name:'Keep name',sku:'SAFE-1',description:'Keep description',priceCents:999});return {...f,auth,p};}
test('blank update cells preserve existing values unless clearing was explicitly selected',async t=>{
 const f=await fixture(t),body={kind:'products',text:'sku;name;description;price\nSAFE-1;Updated;;0',mapping:{sku:0,name:1,description:2,price:3},duplicates:'update'};
 const preview=await(await f.request('/api/import/preview','POST',body,f.auth)).json();assert.equal(preview.errors.length,0);assert.equal(preview.rows[0].data.description,'Keep description');assert.ok(preview.rows[0].changes.some(change=>change.field==='name'&&change.before==='Keep name'&&change.after==='Updated'));assert.ok(!preview.rows[0].changes.some(change=>change.field==='description'));
 assert.equal((await f.request('/api/import/commit','POST',{...body,expectedState:preview.stateToken},f.auth)).status,200);const row=await f.app.store.getProduct(f.p.id);assert.equal(row.description,'Keep description');assert.equal(row.priceCents,0);
 assert.equal((await f.request('/api/import/commit','POST',{...body,clearEmptyFields:true},f.auth)).status,200);assert.equal((await f.app.store.getProduct(f.p.id)).description,'');
});
test('changed target data invalidates a confirmed import preview',async t=>{
 const f=await fixture(t),body={kind:'products',text:'sku;name\nSAFE-1;From import',mapping:{sku:0,name:1},duplicates:'update'},preview=await(await f.request('/api/import/preview','POST',body,f.auth)).json();assert.match(preview.stateToken,/^[a-f0-9]{64}$/);await f.app.store.updateProduct(f.p.id,{...f.p,name:'Changed by somebody else'});
 assert.equal((await f.request('/api/import/commit','POST',{...body,expectedState:preview.stateToken},f.auth)).status,409);assert.equal((await f.app.store.getProduct(f.p.id)).name,'Changed by somebody else');
});
test('JSON updates protect empty text and images while false and zero remain real changes',async t=>{
 const f=await fixture(t),image={name:'test.png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5WQAAAAASUVORK5CYII='};await f.app.store.updateProduct(f.p.id,{...f.p,image});
 const inventory=await(await f.request('/api/export/all','GET',undefined,f.auth)).json();Object.assign(inventory.products[0],{description:'',image:null,active:false,priceCents:0});const body={kind:'all',text:JSON.stringify(inventory),duplicates:'update',createMissingMasterdata:false};
 const preview=await(await f.request('/api/import/preview','POST',body,f.auth)).json();assert.equal(preview.errors.length,0);assert.equal(preview.rows[0].data.description,'Keep description');assert.ok(preview.rows[0].data.imageVersion);assert.equal((await f.request('/api/import/commit','POST',{...body,expectedState:preview.stateToken},f.auth)).status,200);assert.ok((await f.app.store.getProduct(f.p.id)).imageVersion);assert.equal((await f.app.store.getProduct(f.p.id)).active,false);
 assert.equal((await f.request('/api/import/commit','POST',{...body,clearEmptyFields:true},f.auth)).status,200);assert.equal((await f.app.store.getProduct(f.p.id)).imageVersion,undefined);
});
test('imports cannot silently reopen completed returns or close incomplete returns',async t=>{
 const f=await fixture(t),r=await f.app.store.createReturn({productId:f.p.id,serialNumber:'CLOSED',statusId:15,resolutionId:17});
 const body={kind:'returns',text:'sku;returnNumber;status\nSAFE-1;'+r.returnNumber+';Eingegangen',mapping:{sku:0,returnNumber:1,status:2},duplicates:'update'};const preview=await(await f.request('/api/import/preview','POST',body,f.auth)).json();assert.equal(preview.errors.length,1);assert.match(preview.errors[0].message,/wieder öffnen/);assert.equal((await f.request('/api/import/commit','POST',body,f.auth)).status,400);assert.equal((await f.app.store.getReturn(r.id)).isClosed,true);
});
test('confirmed JSON preview with an image and its existing return has a stable state token',async t=>{
 const f=await fixture(t);await f.app.store.createReturn({productId:f.p.id,serialNumber:'WITH-IMAGE'});await f.app.store.updateProduct(f.p.id,{...f.p,image:{name:'original.png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5WQAAAAASUVORK5CYII='}});
 const file=await(await f.request('/api/export/all','GET',undefined,f.auth)).json();file.products[0].image.name='replacement.png';file.products[0].name='New name';const body={kind:'all',text:JSON.stringify(file),duplicates:'update'};
 const preview=await(await f.request('/api/import/preview','POST',body,f.auth)).json();assert.deepEqual(preview.errors,[]);assert.equal((await f.request('/api/import/commit','POST',{...body,expectedState:preview.stateToken},f.auth)).status,200);assert.equal((await f.app.store.getProduct(f.p.id)).imageName,'replacement.png');
});
test('CSV and JSON previews show return product reassignment before committing it',async t=>{
 const f=await fixture(t),next=await f.app.store.createProduct({sku:'SAFE-2',name:'Other product'}),r=await f.app.store.createReturn({productId:f.p.id,serialNumber:'RELINK'});
 const csv={kind:'returns',text:'sku;returnNumber\nSAFE-2;'+r.returnNumber,mapping:{sku:0,returnNumber:1},duplicates:'update'},file=await(await f.request('/api/export/all','GET',undefined,f.auth)).json();file.returns[0].sku=next.sku;
 for(const body of [csv,{kind:'all',text:JSON.stringify(file),duplicates:'update'}]){const preview=await(await f.request('/api/import/preview','POST',body,f.auth)).json();assert.deepEqual(preview.errors,[]);assert.ok(preview.rows.find(row=>row.data.returnNumber===r.returnNumber).changes.some(change=>change.field==='sku'&&change.before==='SAFE-1'&&change.after==='SAFE-2'));}
 const preview=await(await f.request('/api/import/preview','POST',csv,f.auth)).json();assert.equal((await f.request('/api/import/commit','POST',{...csv,expectedState:preview.stateToken},f.auth)).status,200);assert.equal((await f.app.store.getReturn(r.id)).productId,next.id);
});
