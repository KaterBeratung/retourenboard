import {test} from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import {createStore} from './helpers/postgres-fixtures.js';

test('record revisions reject stale writes and a failed write does not advance them',async()=>{
 const store=await createStore();
 const p=await store.createProduct({name:'Gerät',sku:'REV',price:'125.25'});
 assert.equal(p.revision,1);
 const first=await store.updateProduct(p.id,{...p,name:'Neu'});
 assert.equal(first.revision,2);
 await assert.rejects(()=>store.updateProduct(p.id,{...p,name:'Veraltet'}),e=>e.status===409);
 await assert.rejects(()=>store.updateProduct(p.id,{...first,name:''}));
 assert.equal((await store.getProduct(p.id)).revision,2);
});
test('return prices are creation snapshots and survive catalog changes and reassignment',async()=>{
 const store=await createStore(),p=await store.createProduct({name:'Gerät',sku:'PRICE',price:'125.25'});
 const r=await store.createReturn({productId:p.id,serialNumber:'123',receiptDate:'2026-10-16'});
 assert.equal(r.revision,1);assert.equal(r.priceCents,12525);assert.equal(r.priceSnapshotSource,'creation');
 await store.updateProduct(p.id,{...p,price:'250.00'});
 let current=await store.getReturn(r.id);assert.equal(current.priceCents,12525);assert.equal(current.catalogPriceCents,25000);
 const other=await store.createProduct({name:'Anderes Gerät',sku:'OTHER',price:'900.00'});
 current=await store.updateReturn(r.id,{...current,productId:other.id});
 assert.equal(current.priceCents,12525);assert.equal(current.catalogPriceCents,90000);assert.equal(current.revision,2);
 await assert.rejects(()=>store.updateReturn(r.id,{...r,notes:'Veraltet'}),e=>e.status===409);
});
test('concurrent editors with the same return revision produce exactly one successful write',async()=>{
 const store=await createStore(),p=await store.createProduct({name:'Gerät',sku:'RACE'}),r=await store.createReturn({productId:p.id,serialNumber:'RACE-SN',receiptDate:'2026-10-16'});
 const results=await Promise.allSettled([store.updateReturn(r.id,{...r,notes:'A'}),store.updateReturn(r.id,{...r,notes:'B'})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(results.find(r=>r.status==='rejected').reason.status,409);
 assert.equal((await store.getReturn(r.id)).revision,2);
 // Equal timestamps must not let the losing editor overwrite the winner.
 await store.db.query('UPDATE returns SET updatedAt=$1 WHERE id=$2',[r.updatedAt,r.id]);
 await assert.rejects(()=>store.updateReturn(r.id,{...r,notes:'Same-millisecond stale edit'}),e=>e.status===409);
});
