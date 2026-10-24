import {test} from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {rmSync,existsSync} from 'node:fs';
import {runtimeFixture} from './helpers/runtime.js';
import {openDatabase} from '../dist/server/database/connection.js';
import {applyBackup} from '../scripts/restore-backup.mjs';
const bin=process.env.RETOURENBOARD_TEST_PG_BIN??'.qa/postgres-runtime/18/pgsql/bin';
test('offline restore snapshots PostgreSQL and files before replacing the database and refuses live writers',async t=>{
 const f=await runtimeFixture(t);await f.setup();await f.app.store.createProduct({sku:'OFFLINE',name:'Original'});const saved=await f.app.backups.create({id:null,name:'Test',source:'system'});await f.app.store.createProduct({sku:'LATER',name:'Later'});
 const schema=f.app.store.db.schema,backup=join(f.dataDir,'..','offline-'+schema);t.after(()=>rmSync(backup,{recursive:true,force:true}));
 const options={databaseConfig:f.databaseConfig,schema,dataDir:f.dataDir,archive:join(f.dataDir,'backups',saved.filename),backup,binDir:bin};
 await assert.rejects(applyBackup(options),/andere.*Instanz/);assert.equal(existsSync(backup),false);
 await f.app.close();const summary=await applyBackup(options);assert.equal(summary.products,1);assert.ok(existsSync(join(backup,'database.dump')));assert.ok(existsSync(join(backup,'metadata.json')));
 const db=await openDatabase(f.databaseConfig,schema);try{assert.equal((await db.query('SELECT sku FROM products')).rows[0].sku,'OFFLINE');assert.equal((await db.query('SELECT COUNT(*) AS n FROM products')).rows[0].n,1);assert.equal((await db.query('SELECT writesReleased AS "writesReleased" FROM activation_state')).rows[0].writesReleased,true);}finally{await db.close();}
});
