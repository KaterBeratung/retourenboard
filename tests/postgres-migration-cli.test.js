import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {postgresFixture} from './helpers/postgres.js';
import {openDatabase} from '../dist/server/database/connection.js';
import {readDatabaseConfig} from '../dist/server/database/config.js';
import {createStore as legacyStore} from '../dist/server/legacy-sqlite/store.js';
import {createUsers} from '../dist/server/legacy-sqlite/users.js';
import {migrationCommand} from '../dist/server/migration/cli.js';
import {acquireRuntimeLease} from '../dist/server/database/runtime-lease.js';

async function fixture(t){
 const f=await postgresFixture(t),name='rb_cli_'+randomBytes(12).toString('hex');await f.database.query('CREATE DATABASE '+name);
 const url=new URL(process.env.RETOURENBOARD_TEST_DATABASE_URL);url.pathname='/'+name;const env={DATABASE_URL:url.href},config=readDatabaseConfig(env),db=await openDatabase(config);
 f.beforeCleanup(async()=>{await db.close();await f.database.query('DROP DATABASE '+name+' WITH (FORCE)');});
 const source=join(f.dataDir,'legacy'),data=join(f.dataDir,'destination');mkdirSync(source);mkdirSync(data);const path=join(source,'retouren.sqlite'),legacy=legacyStore(path);createUsers(legacy);legacy.createProduct({name:'Altbestand',sku:'LEGACY'});legacy.close();
 return {...f,env,config,db,path,data,args:['--sqlite',path,'--source-data',source,'--data-dir',data]};
}
test('CLI checks without activation, applies once, reports the journal ID and preserves later PostgreSQL writes',async t=>{
 const f=await fixture(t),before=readFileSync(f.path),reportPath=join(f.dataDir,'report.json');
 const checked=await migrationCommand(['--check',...f.args,'--report',reportPath],f.env);assert.equal(checked.state,'checked');assert.equal((await f.db.query("SELECT 1 FROM information_schema.tables WHERE table_schema='retourenboard'")).rowCount,0);
 await assert.rejects(migrationCommand(['--apply','--confirm',...f.args],f.env),/stoppen/);
 const applied=await migrationCommand(['--apply','--service-stopped','--confirm',...f.args],f.env);assert.equal(applied.state,'committed');assert.equal(applied.id,(await f.db.query('SELECT id FROM activation_state')).rows[0].id);
 await f.db.query("UPDATE products SET name='Neue PG-Änderung'");const repeated=await migrationCommand(['--apply','--service-stopped','--confirm',...f.args],f.env);assert.equal(repeated.state,'already-committed');assert.equal((await f.db.query('SELECT name FROM products')).rows[0].name,'Neue PG-Änderung');assert.deepEqual(readFileSync(f.path),before);
 assert.equal((await f.db.query("SELECT nspname FROM pg_namespace WHERE nspname LIKE 'rb_stage_%'")).rowCount,0);
});
test('CLI refuses occupied targets, existing reports and a live application lease without changing source',async t=>{
 const f=await fixture(t),before=readFileSync(f.path),report=join(f.dataDir,'existing.json');writeFileSync(report,'KEEP');
 await assert.rejects(migrationCommand(['--check',...f.args,'--report',report],f.env),/exist|EEXIST/i);assert.equal(readFileSync(report,'utf8'),'KEEP');
 const lease=await acquireRuntimeLease(f.config,'retourenboard');try{await assert.rejects(migrationCommand(['--check',...f.args],f.env),/andere.*Instanz/);}finally{await lease.close();}
 await f.db.query('CREATE SCHEMA retourenboard');await f.db.query('CREATE TABLE occupied(id INTEGER)');await assert.rejects(migrationCommand(['--apply','--service-stopped','--confirm',...f.args],f.env),/belegt/);assert.deepEqual(readFileSync(f.path),before);
});
