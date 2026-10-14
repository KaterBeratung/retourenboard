import type {DatabaseSync} from 'node:sqlite';
import {join,extname} from 'node:path';
import {statSync,openSync,readSync,closeSync} from 'node:fs';
import {assertStoredName,storedFilePath} from './stored-files.js';
import {detect,uploadFormats} from './attachments.js';

const tables=new Set(['products','product_images','returns','users','attachments','chat_attachments','migrations','masterdata','server_settings','currency_rates','app_preferences','account_preferences','audit','events','csv_profiles','user_mfa','recovery_codes','mfa_enrollments','notifications','mail_outbox','backup_jobs','chat_channels','chat_members','chat_messages','chat_message_pins','return_comments','overdue_state','app_logo','sqlite_sequence','sqlite_stat1','sqlite_stat4']);
export function assertRestoreSchema(db:DatabaseSync):void{
 // Inspect schema before integrity checks, migrations or any row mutations.
 // Official databases use ordinary tables/indexes; executable schema is never
 // part of a Retourenboard backup and must not acquire authority on restore.
 db.exec('PRAGMA trusted_schema=OFF');
 for(const row of db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_schema').all()){
  if(row.type==='table'&&tables.has(String(row.name))&&typeof row.sql==='string'&&/^CREATE\s+TABLE\s/i.test(row.sql))continue;
  if(row.type==='index'&&tables.has(String(row.tbl_name))&&(row.sql===null||typeof row.sql==='string'&&/^CREATE\s+(?:UNIQUE\s+)?INDEX\s/i.test(row.sql)))continue;
  throw new Error('Sicherung enthält ein unzulässiges Datenbankschema.');
 }
 for(const row of db.prepare('PRAGMA table_list').all())if(row.schema==='main'&&row.name!=='sqlite_schema'){
  const name=String(row.name).replaceAll('"','""');
  if(row.type!=='table'||db.prepare(`PRAGMA table_xinfo("${name}")`).all().some(column=>Number(column.hidden)!==0))throw new Error('Sicherung enthält ein unzulässiges Datenbankschema.');
  for(const index of db.prepare(`PRAGMA index_list("${name}")`).all()){
   const indexName=String(index.name).replaceAll('"','""');
   if(index.partial||db.prepare(`PRAGMA index_xinfo("${indexName}")`).all().some(column=>Number(column.cid)===-2))throw new Error('Sicherung enthält ein unzulässiges Datenbankschema.');
  }
 }
 if(db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='chat_message_pins'").get()){
  // The pin table is optional in older backups. If present, accept exactly
  // the persisted contract; its name alone must not authorize extra schema.
  const columns=db.prepare('PRAGMA table_xinfo(chat_message_pins)').all();
  const expected=[{name:'messageId',type:'INTEGER',notnull:0,pk:1},{name:'pinnedById',type:'INTEGER',notnull:0,pk:0},{name:'pinnedAt',type:'TEXT',notnull:1,pk:0}];
  if(columns.length!==expected.length||columns.some((column,i)=>column.name!==expected[i].name||String(column.type).toUpperCase()!==expected[i].type||column.notnull!==expected[i].notnull||column.pk!==expected[i].pk||column.dflt_value!==null||column.hidden!==0))throw new Error('Sicherung enthält ein unzulässiges Datenbankschema.');
  const references=db.prepare('PRAGMA foreign_key_list(chat_message_pins)').all();
  const foreignKeys=[{from:'messageId',table:'chat_messages',to:'id',on_delete:'CASCADE'},{from:'pinnedById',table:'users',to:'id',on_delete:'SET NULL'}];
  if(references.length!==foreignKeys.length||foreignKeys.some(expected=>!references.some(reference=>reference.from===expected.from&&reference.table===expected.table&&reference.to===expected.to&&reference.on_delete===expected.on_delete&&reference.on_update==='NO ACTION'&&reference.match==='NONE'&&reference.seq===0)))throw new Error('Sicherung enthält ein unzulässiges Datenbankschema.');
 }
}
export function assertRestoreFiles(db:DatabaseSync,target:string,expected?:Set<string>):void{
 for(const [table,folder,message]of [['attachments','attachments','Ein Dateianhang fehlt in der Sicherung.'],['app_logo','branding','Das Logo fehlt in der Sicherung.']]){
  if(!db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name=?").get(table))continue;
  for(const row of db.prepare(`SELECT storedName FROM ${table}`).all()){
   if(expected&&!expected.has(folder+'/'+row.storedName))throw new Error(message);
   storedFilePath(join(target,folder),row.storedName,{mustExist:true});
  }
 }
 const chatReferences=new Set<string>();
 if(db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name='chat_attachments'").get()){
  if(db.prepare('SELECT messageId FROM chat_attachments GROUP BY messageId HAVING COUNT(*)>1').get())throw new Error('Sicherung enthält ungültige Chat-Dateianhänge.');
  for(const row of db.prepare('SELECT a.*,m.deleted,c.id AS channelExists FROM chat_attachments a LEFT JOIN chat_messages m ON m.id=a.messageId LEFT JOIN chat_channels c ON c.id=m.channelId').all()){
   if(row.deleted!==0||!row.channelExists||!Number.isSafeInteger(row.size)||Number(row.size)<1||typeof row.originalName!=='string')throw new Error('Sicherung enthält ungültige Chat-Dateianhänge.');
   assertStoredName(row.originalName);const extension=extname(row.originalName).toLowerCase();
   if(uploadFormats[extension as keyof typeof uploadFormats]!==row.mediaType)throw new Error('Sicherung enthält ungültige Chat-Dateianhänge.');
   const ref='chat-attachments/'+row.storedName;chatReferences.add(ref);if(expected&&!expected.has(ref))throw new Error('Ein Chat-Dateianhang fehlt in der Sicherung.');
   const path=storedFilePath(join(target,'chat-attachments'),row.storedName,{mustExist:true});if(statSync(path).size!==row.size)throw new Error('Größe eines Chat-Dateianhangs stimmt nicht.');
   const fd=openSync(path,'r');try{const bytes=Buffer.alloc(16),n=readSync(fd,bytes,0,16,0);if(detect(bytes.subarray(0,n))!==row.mediaType)throw new Error('Dateityp eines Chat-Dateianhangs stimmt nicht.');}finally{closeSync(fd);}
  }
 }
 if(expected&&[...expected].some(path=>path.startsWith('chat-attachments/')&&!chatReferences.has(path)))throw new Error('Sicherung enthält nicht zugeordnete Chat-Dateianhänge.');
}
