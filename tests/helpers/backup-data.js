import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {extract,create} from '../../dist/vendor/archive.js';
import {sha256File} from '../../dist/shared/backup-contract.js';
import {LEGACY_TABLES} from '../../dist/server/legacy-sqlite/catalog.js';
import {BASELINE_TABLE_CONTRACTS as TABLE_CONTRACTS} from '../../dist/server/database/schema.js';
import {importData} from '../../dist/server/database/data-transfer.js';
import {createApp} from '../../dist/server/app.js';
import {postgresFixture} from './postgres.js';

export async function snapshotDatabase(t,path){const f=await postgresFixture(t);await importData(f.database,join(path,'data.jsonl'));return f.database;}
export async function appFromPrepared(t,path,options={}){const f=await postgresFixture(t);await importData(f.database,join(path,'data.jsonl'));const app=await createApp({...options,databaseConfig:f.config,internalSchema:f.schema,dataDir:path});f.beforeCleanup(()=>app.close());return app;}

// Explicit historic format-1 fixture. Runtime backups are always data-only format 2.
export async function legacyArchive(f,label,mutate=()=>{}){
 const saved=await f.app.backups.create({id:null,name:'Fixture',source:'system'}),dir=join(f.dataDir??f.dir,label);mkdirSync(dir);await extract({cwd:dir,file:join(f.dataDir??f.dir,'backups',saved.filename)});
 const db=new DatabaseSync(join(dir,'retouren.sqlite'));let hasChatFiles=true;
 try{
  db.exec('PRAGMA foreign_keys=OFF');for(const table of LEGACY_TABLES)db.exec(table.sql);
  for(const table of TABLE_CONTRACTS){const statement=db.prepare('INSERT INTO '+table.sourceName+'('+table.columns.map(c=>c.name).join(',')+') VALUES('+table.columns.map(()=>'?').join(',')+')');for(const row of(await f.app.store.db.query('SELECT * FROM '+table.name)).rows)statement.run(...table.columns.map(c=>row[c.name]??row[c.sqlName]??null));}
  for(const name of ['admin-v2','masterdata-builtins-v1','return-workflow-v1','return-customer-reference-v1','return-tracking-number-v1','return-replacement-serial-v1','features-1.4','users-account-deletion-v1'])db.prepare('INSERT OR IGNORE INTO migrations(name) VALUES(?)').run(name);
  assertForeignKeys(db);mutate(db,dir);hasChatFiles=!!db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='chat_attachments'").get();
 }finally{db.close();}
 const manifest=JSON.parse(readFileSync(join(dir,'manifest.json'),'utf8'));manifest.format=1;manifest.database='retouren.sqlite';delete manifest.tables;manifest.files=manifest.files.filter(f=>f.path!=='data.jsonl');rmSync(join(dir,'data.jsonl'));
 if(!hasChatFiles){manifest.files=manifest.files.filter(f=>!f.path.startsWith('chat-attachments/'));rmSync(join(dir,'chat-attachments'),{recursive:true,force:true});}
 manifest.files.unshift({path:'retouren.sqlite',size:readFileSync(join(dir,'retouren.sqlite')).length,sha256:await sha256File(join(dir,'retouren.sqlite'))});
 for(const file of manifest.files){file.size=readFileSync(join(dir,file.path)).length;file.sha256=await sha256File(join(dir,file.path));}
 writeFileSync(join(dir,'manifest.json'),JSON.stringify(manifest));const file=join(f.dataDir??f.dir,label+'.tar.gz');await create({cwd:dir,file,gzip:true},['manifest.json',...manifest.files.map(f=>f.path)]);return file;
}
function assertForeignKeys(db){if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Ungültige historische Testdaten.');}
