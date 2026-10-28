import {test} from 'node:test';
import assert from 'node:assert/strict';
import {postgresFixture} from './helpers/postgres.js';
test('fresh PostgreSQL initialization refuses occupied application schemas and preserves their existing tables',async t=>{const f=await postgresFixture(t);await f.database.query('CREATE TABLE occupied(value TEXT)');await f.database.query("INSERT INTO occupied VALUES('keep')");const {migratePostgres}=await import('../dist/server/database/migrations.js');await assert.rejects(migratePostgres(f.database),/belegt/);assert.equal((await f.database.query('SELECT value FROM occupied')).rows[0].value,'keep');assert.equal((await f.database.query("SELECT 1 FROM information_schema.tables WHERE table_schema=current_schema() AND table_name='schema_migrations'")).rowCount,0);});

test('PostgreSQL schema initialization is concurrent-safe and seeds original master data exactly once',async t=>{
 const {database:db}=await postgresFixture(t);const {migratePostgres}=await import('../dist/server/database/migrations.js');
 await Promise.all([migratePostgres(db),migratePostgres(db)]);await migratePostgres(db);
 assert.deepEqual((await db.query('SELECT id,name,builtinKey FROM masterdata WHERE id=12')).rows,[{id:12,name:'Eingegangen',builtinKey:'statuses.received'}]);
 assert.equal((await db.query('SELECT COUNT(*) AS n FROM masterdata')).rows[0].n,20);
 assert.equal((await db.query('SELECT COUNT(*) AS n FROM schema_migrations')).rows[0].n,8);
 assert.equal((await db.query('SELECT COUNT(*) AS n FROM legacy_migrations')).rows[0].n,0);
});

test('PostgreSQL schema enforces references and next identities exceed historic deleted IDs',async t=>{
 const {database:db}=await postgresFixture(t);const {migratePostgres,resetIdentitySequences}=await import('../dist/server/database/migrations.js');
 await migratePostgres(db);await resetIdentitySequences(db,{masterdata:800});
 const row=(await db.query("INSERT INTO masterdata(kind,name,nameKey,createdAt,updatedAt) VALUES('suppliers','West','west','2026-10-15T12:00:00.000Z','2026-10-15T12:00:00.000Z') RETURNING id")).rows[0];
 assert.equal(row.id,801);
 await assert.rejects(db.query("INSERT INTO product_images(productId,originalName,mediaType,data,revision) VALUES(99,'a.png','image/png',$1,'test')",[Buffer.from([1,2,3])]),error=>error.code==='23503');
});

test('PostgreSQL product and return repositories retain fields, image bytes and atomic rollback',async t=>{
 const {database}=await postgresFixture(t);const {createStore}=await import('../dist/server/store.js');const store=await createStore({database});
 await store.createMasterData('suppliers',{name:'Nord'});
 const p=await store.createProduct({name:'Monitor',sku:'MON-01',supplier:'Nord',priceCents:12345});
 const r=await store.createReturn({productId:p.id,serialNumber:'SN-00001',replacementSerialNumber:'ERSATZ-001',trackingNumber:'000012345678',customerReference:'K-001',receiptDate:'2026-10-15'});
 assert.equal(r.sku,'MON-01');assert.equal(r.priceCents,12345);assert.equal(r.trackingNumber,'000012345678');assert.equal(r.replacementSerialNumber,'ERSATZ-001');assert.match(r.returnNumber,/^RET-2026-\d+$/);
 await assert.rejects(store.createProduct({name:'Duplicate',sku:'MON-01'}),error=>error.status===409);
 await assert.rejects(store.transaction(async()=>{await store.createProduct({name:'Rollback',sku:'ROLLBACK'});throw Error('abort business');}),/abort business/);
 assert.equal(await store.findProduct('ROLLBACK'),null);
 assert.equal((await store.deleteProduct(p.id)).archived,true);assert.equal((await store.getProduct(p.id)).active,false);
 const now=new Date().toISOString(),bytes=Buffer.from([0,1,127,128,255]);
 await database.query('INSERT INTO product_images(productId,originalName,mediaType,data,revision) VALUES($1,$2,$3,$4,$5)',[p.id,'test.png','image/png',bytes,now]);
 const image=(await database.query('SELECT data,originalName FROM product_images WHERE productId=$1',[p.id])).rows[0];
 assert.deepEqual(image.data,bytes);assert.equal(image.originalName,'test.png');assert.equal((await store.getProduct(p.id)).imageVersion,now);
});
