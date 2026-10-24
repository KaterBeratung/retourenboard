import {DatabaseSync,backup} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {mkdirSync,lstatSync,copyFileSync,existsSync,rmSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {SCHEMA2_TABLE_CONTRACTS,BASELINE_TABLE_CONTRACTS} from '../database/schema.js';
import {migratePostgres,resetIdentitySequences,POSTGRES_SCHEMA_VERSION} from '../database/migrations.js';
import {rebuildReturnSerialSearch} from '../database/serial-search.js';
import {backfillRecordMetadata} from '../database/record-metadata.js';
import {hashRows,insertRows,postgresDigests,type TableDigest} from '../database/data-transfer.js';
import {validateTransferredData} from '../database/validate-data.js';
import {upgradeLegacySnapshot,validateLegacy} from '../legacy-sqlite/upgrade.js';
import {assertRestoreFiles} from '../restore-validation.js';
import {createSecrets} from '../secrets.js';
import {storedFilePath} from '../stored-files.js';
import {sha256File} from '../../shared/backup-contract.js';
import type {SqlDatabase} from '../database/types.js';
export type MigrationReport={id:string;sourceFingerprint:string;sourceSchema:string[];targetSchemaVersion:number;tables:TableDigest[];files:{path:string;size:number;sha256:string}[];discardedTransientCounts:{mfaEnrollments:number};checks:{hashes:boolean;foreignKeys:boolean;files:boolean;keys:boolean};state:string};
export async function migrateLegacySnapshot({source,dataDir,workDir,database:target}:{source:string;dataDir:string;workDir:string;database:SqlDatabase}):Promise<MigrationReport>{
 if((await target.query('SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema()')).rows.length)throw Error('PostgreSQL-Zielschema muss leer sein.');
 source=resolve(source);workDir=resolve(workDir);dataDir=resolve(dataDir);if(workDir===dataDir||workDir===source)throw Error('Snapshot benötigt einen eigenen Arbeitsordner.');
 const stat=lstatSync(source);if(!stat.isFile()||stat.isSymbolicLink())throw Error('Ungültige SQLite-Quelldatei.');
 if(existsSync(workDir))throw Error('Arbeitsordner existiert bereits.');mkdirSync(workDir,{recursive:true,mode:0o700});
 const assertNoRollbackJournal=()=>{if(existsSync(source+'-journal')&&lstatSync(source+'-journal').size>0)throw Error('SQLite-Wiederherstellungsjournal vorhanden. Alte Anwendung zuerst zur Recovery starten, sauber stoppen und Migration erneut prüfen.');};assertNoRollbackJournal();
 const sourceHash=await sha256File(source),walHash=existsSync(source+'-wal')&&lstatSync(source+'-wal').size>0?await sha256File(source+'-wal'):null;
 const snapshot=join(workDir,'snapshot.sqlite'),filesRoot=join(workDir,'files');let store:any;
 try{
  // SQLite may create WAL/SHM sidecars even for a read-only connection. Read
  // from private byte-checked copies so a cold source can be mounted read-only.
  const inputPath=join(workDir,'input.sqlite');copyFileSync(source,inputPath);
  if(await sha256File(inputPath)!==sourceHash)throw Error('SQLite-Quelle wurde während der Übernahme geändert.');
  if(walHash){const stat=lstatSync(source+'-wal');if(!stat.isFile()||stat.isSymbolicLink())throw Error('Ungültige SQLite-WAL-Datei.');copyFileSync(source+'-wal',inputPath+'-wal');if(await sha256File(inputPath+'-wal')!==walHash)throw Error('SQLite-WAL wurde während der Übernahme geändert.');}
  const input=new DatabaseSync(inputPath,{readOnly:true});try{validateLegacy(input);await backup(input,snapshot);}finally{input.close();}
  store=upgradeLegacySnapshot(snapshot);const db:DatabaseSync=store.db;
  const sourceSchema=db.prepare('SELECT name FROM migrations ORDER BY name').all().map(r=>String(r.name));
  const highWater=Object.fromEntries(db.prepare('SELECT name,seq FROM sqlite_sequence ORDER BY name').all().map(row=>{if(!Number.isSafeInteger(row.seq)||Number(row.seq)<0)throw Error('Ungültiger SQLite-Sequenzstand.');return [String(row.name),Number(row.seq)];}));
  const discarded=Number(db.prepare('SELECT COUNT(*) AS n FROM mfa_enrollments').get()?.n??0);db.exec('DELETE FROM mfa_enrollments');
  let tables=[...BASELINE_TABLE_CONTRACTS.map(t=>hashRows(t,db.prepare('SELECT * FROM '+t.sourceName+' ORDER BY '+t.columns.filter(c=>c.primary).sort((a,b)=>a.primary-b.primary).map(c=>c.name).join(',')).iterate() as Iterable<any>)),...SCHEMA2_TABLE_CONTRACTS.filter(t=>!BASELINE_TABLE_CONTRACTS.includes(t)).map(t=>hashRows(t,[]))];
  const files:MigrationReport['files']=[];mkdirSync(filesRoot,{mode:0o700});
  async function copy(folder:string,name:string){const from=storedFilePath(join(dataDir,folder),name,{mustExist:true}),toFolder=join(filesRoot,folder);mkdirSync(toFolder,{recursive:true,mode:0o700});const to=storedFilePath(toFolder,name);copyFileSync(from,to);const sha256=await sha256File(from);if(await sha256File(to)!==sha256)throw Error('Datei wurde während der Übernahme geändert.');files.push({path:folder+'/'+name,size:lstatSync(from).size,sha256});}
  for(const [table,folder]of [['attachments','attachments'],['chat_attachments','chat-attachments'],['app_logo','branding']])if(db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?").get(table))for(const row of db.prepare('SELECT storedName FROM '+table).all())await copy(folder,String(row.storedName));
  assertRestoreFiles(db,filesRoot);
  for(const purpose of ['mfa','smtp'] as const)if(existsSync(join(dataDir,'secrets',purpose+'.key')))await copy('secrets',purpose+'.key');const keys=createSecrets(filesRoot);
  for(const row of db.prepare('SELECT userId,secretEnc FROM user_mfa WHERE secretEnc IS NOT NULL').all())keys.decrypt('mfa',String(row.userId),String(row.secretEnc));
  if(existsSync(join(dataDir,'secrets','smtp-password.enc'))){keys.decrypt('smtp','mail',readFileSync(join(dataDir,'secrets','smtp-password.enc'),'utf8'));await copy('secrets','smtp-password.enc');}
  files.sort((a,b)=>Buffer.compare(Buffer.from(a.path),Buffer.from(b.path)));const fingerprint=createHash('sha256').update(JSON.stringify({sourceHash,walHash,files})).digest('hex');
  await target.transaction(async()=>{await migratePostgres(target,{seedDefaults:false});for(const t of BASELINE_TABLE_CONTRACTS)await insertRows(target,t,db.prepare('SELECT * FROM '+t.sourceName).iterate() as Iterable<any>);await resetIdentitySequences(target,highWater);await rebuildReturnSerialSearch(target);await backfillRecordMetadata(target);await validateTransferredData(target,filesRoot);const actual=await postgresDigests(target);if(JSON.stringify(actual.filter(t=>SCHEMA2_TABLE_CONTRACTS.some(s=>s.name===t.name)))!==JSON.stringify(tables))throw Error('Datenprüfsummen stimmen nach Übernahme nicht überein.');tables=actual;assertNoRollbackJournal();if(await sha256File(source)!==sourceHash||(existsSync(source+'-wal')&&lstatSync(source+'-wal').size>0?await sha256File(source+'-wal'):null)!==walHash)throw Error('SQLite-Quelle wurde während der Übernahme geändert. Dienst stoppen und erneut prüfen.');for(const file of files)if(await sha256File(join(dataDir,file.path))!==file.sha256)throw Error('Datei wurde während der Übernahme geändert.');});
  return {id:randomUUID(),sourceFingerprint:fingerprint,sourceSchema,targetSchemaVersion:POSTGRES_SCHEMA_VERSION,tables,files,discardedTransientCounts:{mfaEnrollments:discarded},checks:{hashes:true,foreignKeys:true,files:true,keys:true},state:'verified'};
 }catch(error){store?.close();store=undefined;rmSync(workDir,{recursive:true,force:true});throw error;}finally{store?.close();}
}
