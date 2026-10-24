import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {postgresFixture} from './helpers/postgres.js';
import {openDatabase} from '../dist/server/database/connection.js';
import {createActivation} from '../dist/server/migration/activation.js';
const stage=()=> 'rb_stage_'+randomBytes(16).toString('hex');
for(const point of ['prepared','database','files:attachments:old','files:attachments:new','activated','committed'])test('activation recovers database and files after interruption at '+point,async t=>{
 const f=await postgresFixture(t),next=stage();await f.database.query('CREATE TABLE state(value TEXT)');await f.database.query("INSERT INTO state VALUES('old')");await f.database.query('CREATE SCHEMA "'+next+'"');f.beforeCleanup(()=>f.database.query('DROP SCHEMA IF EXISTS "'+next+'" CASCADE'));
 const incoming=await openDatabase(f.config,next);f.beforeCleanup(()=>incoming.close());await incoming.query('CREATE TABLE state(value TEXT)');await incoming.query("INSERT INTO state VALUES('new')");
 const files=join(f.dataDir,'prepared');mkdirSync(join(files,'attachments'),{recursive:true});writeFileSync(join(files,'attachments','new.pdf'),'new');mkdirSync(join(f.dataDir,'attachments'));writeFileSync(join(f.dataDir,'attachments','old.pdf'),'old');
 const a=createActivation({database:f.database,dataDir:f.dataDir,activeSchema:f.schema,checkpoint:p=>{if(p===point)throw Error('power cut');}});
 let id;try{id=await a.activate({schema:next,files,kind:'restore'});await a.commit();}catch(e){assert.match(e.message,/power cut/);}
 const b=createActivation({database:f.database,dataDir:f.dataDir,activeSchema:f.schema});const result=await b.recover();const db=await openDatabase(f.config,f.schema);f.beforeCleanup(()=>db.close());
 assert.equal((await db.query('SELECT value FROM state')).rows[0].value,point==='committed'?'new':'old');
 assert.equal(readFileSync(join(f.dataDir,'attachments',point==='committed'?'new.pdf':'old.pdf'),'utf8'),point==='committed'?'new':'old');assert.equal(result,point==='committed'?'committed':'rolledBack');
});
test('journal rejects forged paths and a second operation cannot replace unfinished work',async t=>{const f=await postgresFixture(t);mkdirSync(join(f.dataDir,'.operations'));writeFileSync(join(f.dataDir,'.operations','journal.json'),JSON.stringify({format:1,id:'../../other',phase:'activated',schema:'public'}));const a=createActivation({database:f.database,dataDir:f.dataDir,activeSchema:f.schema});await assert.rejects(a.recover(),/Journal/);});
