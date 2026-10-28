import {test} from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {readFileSync,writeFileSync} from 'node:fs';
import {postgresFixture} from './helpers/postgres.js';
import {createStore} from './helpers/postgres-fixtures.js';
import {exportData,importData} from '../dist/server/database/data-transfer.js';
import {exportInventory,commitInventoryImport} from '../dist/server/inventory-transfer.js';
import {backfillRecordMetadata} from '../dist/server/database/record-metadata.js';
import {importRecordState,importStateToken} from '../dist/server/import-changes.js';

test('import preview state changes on a business revision even if every timestamp and value is equal',()=>{
 const row={id:1,sku:'REV',name:'Same',updatedAt:'2026-10-16T00:00:00.000Z',revision:1};
 assert.notEqual(importStateToken([importRecordState(row)]),importStateToken([importRecordState({...row,revision:2})]));
});

test('portable schema 5 preserves revisions and original prices; schema 2 backfills honestly',async t=>{
 const source=await createStore(),p=await source.createProduct({name:'Gerät',sku:'BACKUP',priceCents:12345}),r=await source.createReturn({productId:p.id,serialNumber:'SN'});
 await source.updateProduct(p.id,{...p,priceCents:25000});await source.updateReturn(r.id,{...r,notes:'Changed'});
 const f=await postgresFixture(t),path=join(f.dataDir,'data.jsonl');await exportData(source.db,path);
 const lines=readFileSync(path,'utf8').trim().split('\n').map(JSON.parse);
 assert.equal(lines[0].schema,5);
 await importData(f.database,path);const target=await createStore({database:f.database});
 assert.equal((await target.getReturn(r.id)).priceCents,12345);assert.equal((await target.getReturn(r.id)).revision,2);assert.equal((await target.getProduct(p.id)).revision,2);
 const old=await postgresFixture(t),oldPath=join(old.dataDir,'old.jsonl'),oldLines=lines.filter(l=>!['product_versions','return_versions','sso_providers','sso_identities','sso_access_requests','disposal_comments'].includes(l.table));oldLines[0].schema=2;delete oldLines[0].sequences.disposal_comments;oldLines.at(-1).tables=oldLines.at(-1).tables.filter(l=>!['product_versions','return_versions','sso_providers','sso_identities','sso_access_requests','disposal_comments'].includes(l.name));writeFileSync(oldPath,oldLines.map(l=>JSON.stringify(l)).join('\n')+'\n');
 await importData(old.database,oldPath);const oldTarget=await createStore({database:old.database}),observed=await oldTarget.getReturn(r.id);
 assert.equal(observed.priceCents,25000);assert.equal(observed.priceSnapshotSource,'migration-observed');assert.equal(observed.revision,1);
});
test('backfill uses proven create audit prices and preserves original business rows',async()=>{
 const store=await createStore(),p=await store.createProduct({name:'Gerät',sku:'AUDIT',priceCents:5000}),r=await store.createReturn({productId:p.id,serialNumber:'AUDIT'}),before=(await store.db.query('SELECT * FROM returns WHERE id=$1',[r.id])).rows;
 await store.db.query('DELETE FROM return_versions WHERE returnId=$1',[r.id]);
 await store.db.query("INSERT INTO audit(createdAt,actorId,actorName,source,entity,entityId,action,operationId,changes) VALUES($1,NULL,'System','system','returns',$2,'create','test',$3)",['2025-01-01T00:00:00.000Z',String(r.id),JSON.stringify({priceCents:{before:null,after:1234}})]);
 await backfillRecordMetadata(store.db);const record=await store.getReturn(r.id);
 assert.equal(record.priceCents,1234);assert.equal(record.priceSnapshotSource,'audit-create');assert.equal(record.priceCapturedAt,'2025-01-01T00:00:00.000Z');assert.deepEqual((await store.db.query('SELECT * FROM returns WHERE id=$1',[r.id])).rows,before);
});
test('inventory transfer carries snapshots and updates preserve the target original price',async()=>{
 const source=await createStore(),p=await source.createProduct({name:'Gerät',sku:'INV',priceCents:4000}),r=await source.createReturn({productId:p.id,serialNumber:'INV'});await source.updateProduct(p.id,{...p,priceCents:9000});
 const file=await exportInventory(source);assert.equal(file.returns[0].priceSnapshot.cents,4000);
 const target=await createStore(),options={duplicates:'update',createMissingMasterdata:true};await commitInventoryImport(target,JSON.stringify(file),options,()=>{});
 let imported=await target.findReturn(r.returnNumber);assert.equal(imported.priceCents,4000);assert.equal(imported.revision,1);
 file.returns[0].priceSnapshot.cents=123;file.returns[0].notes='Update';await commitInventoryImport(target,JSON.stringify(file),options,()=>{});
 imported=await target.findReturn(r.returnNumber);assert.equal(imported.priceCents,4000);assert.equal(imported.revision,2);
});
