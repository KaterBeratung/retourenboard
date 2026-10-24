import {test} from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync,writeFileSync,chmodSync,statSync} from 'node:fs';
import {postgresFixture} from './helpers/postgres.js';
import {createStore as legacyStore} from '../dist/server/legacy-sqlite/store.js';
import {createUsers} from '../dist/server/legacy-sqlite/users.js';
import {createSecrets} from '../dist/server/secrets.js';
import {createStore} from '../dist/server/store.js';
import {migrateLegacySnapshot} from '../dist/server/migration/legacy-transfer.js';
async function fixture(t){const f=await postgresFixture(t),source=join(f.dataDir,'source'),work=join(f.dataDir,'staging');mkdirSync(source);const path=join(source,'retouren.sqlite'),store=legacyStore(path),users=createUsers(store);f.beforeCleanup(()=>{if(store.db.isOpen)store.close();});const admin=await users.createFirst({username:'Admin',password:'Migration-test-password!'}),p=store.createProduct({name:'Gerät',sku:'DEVICE-1'}),r=store.createReturn({productId:p.id,serialNumber:'000SN1',replacementSerialNumber:'ERSATZ-1',trackingNumber:'00012345',receiptDate:'2026-10-15'});store.db.prepare("UPDATE sqlite_sequence SET seq=9000 WHERE name='products'").run();const secrets=createSecrets(source),secret=secrets.encrypt('mfa',String(admin.id),'JBSWY3DPEHPK3PXP',true);store.db.prepare('INSERT INTO user_mfa(userId,secretEnc,lastStep) VALUES(?,?,?)').run(admin.id,secret,123);return {...f,source,work,path,legacy:store,r};}
test('SQLite WAL snapshot transfers IDs, high water, security state and leaves source unchanged',async t=>{
 const f=await fixture(t),sourceBefore=readFileSync(f.path),walBefore=readFileSync(f.path+'-wal');
 const report=await migrateLegacySnapshot({source:f.path,dataDir:f.source,workDir:f.work,database:f.database});
 assert.ok(report.tables.some(x=>x.name==='returns'&&x.count===1));assert.equal(report.checks.hashes,true);
 const store=await createStore({database:f.database});const result=await store.getReturn(f.r.id);assert.equal(result.trackingNumber,'00012345');assert.equal(result.replacementSerialNumber,'ERSATZ-1');assert.equal((await store.createProduct({name:'Next',sku:'NEXT'})).id,9001);
 assert.equal((await f.database.query('SELECT lastStep FROM user_mfa')).rows[0].lastStep,123);
 assert.deepEqual(readFileSync(f.path),sourceBefore);assert.deepEqual(readFileSync(f.path+'-wal'),walBefore);
 assert.deepEqual(readFileSync(join(f.work,'files','secrets','mfa.key')),readFileSync(join(f.source,'secrets','mfa.key')));
});
test('migration rejects occupied target, unknown schema and missing encrypted keys',async t=>{
 const f=await fixture(t);await f.database.query('CREATE TABLE occupied(id INTEGER)');
 await assert.rejects(migrateLegacySnapshot({source:f.path,dataDir:f.source,workDir:f.work,database:f.database}),/leer|empty/i);
 await f.database.query('DROP TABLE occupied');f.legacy.db.exec('CREATE TABLE unsupported_new_feature(id INTEGER)');
 await assert.rejects(migrateLegacySnapshot({source:f.path,dataDir:f.source,workDir:f.work,database:f.database}),/Schema|Tabelle/i);
 f.legacy.db.exec('DROP TABLE unsupported_new_feature');writeFileSync(join(f.source,'secrets','mfa.key'),Buffer.alloc(32,5));
 await assert.rejects(migrateLegacySnapshot({source:f.path,dataDir:f.source,workDir:f.work,database:f.database}),/Schlüssel|Verschlüsselt/i);
 assert.equal((await f.database.query('SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema=current_schema()')).rows[0].n,0);
});

test('migration reads MFA and SMTP secrets without changing source permissions',async t=>{
 const f=await fixture(t),keys=createSecrets(f.source);writeFileSync(join(f.source,'secrets','smtp-password.enc'),keys.encrypt('smtp','mail','smtp-password',true));
 const directory=join(f.source,'secrets'),paths=['mfa.key','smtp.key'].map(name=>join(directory,name));
 if(process.platform!=='win32'){for(const path of paths)chmodSync(path,0o400);chmodSync(directory,0o500);}
 try{await migrateLegacySnapshot({source:f.path,dataDir:f.source,workDir:f.work,database:f.database});if(process.platform!=='win32'){assert.equal(statSync(directory).mode&0o777,0o500);for(const path of paths)assert.equal(statSync(path).mode&0o777,0o400);}}
 finally{if(process.platform!=='win32'){chmodSync(directory,0o700);for(const path of paths)chmodSync(path,0o600);}}
});

test('original SQLite schema has a stable migration fingerprint across disposable upgrades',async t=>{
 const f=await postgresFixture(t),source=join(f.dataDir,'original');mkdirSync(source);const path=join(source,'retouren.sqlite'),db=new DatabaseSync(path);
 db.exec(`CREATE TABLE products(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT,sku TEXT UNIQUE,ean TEXT,manufacturer TEXT,supplier TEXT,category TEXT,priceCents INTEGER,description TEXT,active INTEGER,createdAt TEXT,updatedAt TEXT);
 CREATE TABLE returns(id INTEGER PRIMARY KEY AUTOINCREMENT,productId INTEGER,returnNumber TEXT UNIQUE,serialNumber TEXT,orderNumber TEXT,receiptDate TEXT,quantity INTEGER,reason TEXT,condition TEXT,status TEXT,resolution TEXT,notes TEXT,createdAt TEXT,updatedAt TEXT);
 INSERT INTO products VALUES(1,'Altprodukt','ALT','','Marke','Lieferant','Gruppe',500,'',1,'2026-10-05','2026-10-05');
 INSERT INTO returns VALUES(1,1,'R-ALT','ALT-SN','','2026-10-05',1,'Sonstiges','Ungeprüft','Abgeschlossen','Noch offen','','2026-10-05','2026-10-05');`);db.close();
 const before=readFileSync(path),first=await migrateLegacySnapshot({source:path,dataDir:source,workDir:join(f.dataDir,'first'),database:f.database});
 const secondTarget=await postgresFixture(t);const second=await migrateLegacySnapshot({source:path,dataDir:source,workDir:join(f.dataDir,'second'),database:secondTarget.database});
 assert.equal(first.sourceFingerprint,second.sourceFingerprint);assert.deepEqual(readFileSync(path),before);const store=await createStore({database:secondTarget.database});assert.equal((await store.getReturn(1)).serialNumber,'ALT-SN');
});

test('closed WAL source migrates without creating sidecars in a non-writable source directory',async t=>{
 const f=await fixture(t);f.legacy.close();const before=readFileSync(f.path);if(process.platform!=='win32'){chmodSync(f.path,0o400);chmodSync(f.source,0o500);}
 try{await migrateLegacySnapshot({source:f.path,dataDir:f.source,workDir:f.work,database:f.database});assert.deepEqual(readFileSync(f.path),before);assert.equal((await f.database.query('SELECT serialNumber FROM returns')).rows[0].serialNumber,'000SN1');if(process.platform!=='win32')assert.equal(statSync(f.source).mode&0o777,0o500);}
 finally{if(process.platform!=='win32'){chmodSync(f.source,0o700);chmodSync(f.path,0o600);}}
});

test('migration refuses a pending rollback journal instead of importing possibly uncommitted pages',async t=>{
 const f=await fixture(t);writeFileSync(f.path+'-journal',Buffer.alloc(512,1));
 await assert.rejects(migrateLegacySnapshot({source:f.path,dataDir:f.source,workDir:f.work,database:f.database}),/Wiederherstellungsjournal/);
 assert.equal((await f.database.query('SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema=current_schema()')).rows[0].n,0);
});
