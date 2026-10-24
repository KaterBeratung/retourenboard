import {randomBytes} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase} from '../../dist/server/database/connection.js';
import {readDatabaseConfig} from '../../dist/server/database/config.js';

export async function postgresFixture(t){
 const url=process.env.RETOURENBOARD_TEST_DATABASE_URL;
 if(!url)throw new Error('Echte PostgreSQL-Testverbindung fehlt. Über scripts/test-postgres.mjs starten.');
 if(url===process.env.DATABASE_URL)throw new Error('Die reguläre Datenbank darf nicht als Testdatenbank verwendet werden.');
 const config=readDatabaseConfig({DATABASE_URL:url}),schema='rb_test_'+randomBytes(16).toString('hex'),dataDir=mkdtempSync(join(tmpdir(),'retourenboard-pg-test-'));
 const admin=await openDatabase(config);let database;const cleanup=[];
 try{await admin.query('CREATE SCHEMA "'+schema+'"');database=await openDatabase(config,schema);}
 catch(error){await admin.query('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE').catch(()=>{});await admin.close();rmSync(dataDir,{recursive:true,force:true});throw error;}
 t.after(async()=>{let failure;try{for(const job of [...cleanup].reverse())try{await job();}catch(error){failure??=error;}await database.close();await admin.query('DROP SCHEMA "'+schema+'" CASCADE');}finally{await database.close();await admin.close();rmSync(dataDir,{recursive:true,force:true});}if(failure)throw failure;});
 return {database,config,dataDir,schema,beforeCleanup:job=>cleanup.push(job)};
}
