import {extract} from '../vendor/archive.js';
import {inspectBackupArchive} from './archive-validation.js';
import {lstatSync,readdirSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync,renameSync,rmSync,existsSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {randomBytes} from 'node:crypto';
import {BACKUP_LIMITS,sha256File,type BackupLimits} from '../shared/backup-contract.js';
import {openDatabase} from './database/connection.js';
import {importData,boundedLines,decodedRow} from './database/data-transfer.js';
import {TABLE_CONTRACTS} from './database/schema.js';
import {validateTransferredData} from './database/validate-data.js';
import type {DatabaseConfig} from './database/types.js';
import {createSecrets} from './secrets.js';
import {prepareBackup as prepareLegacy,inspectPreparedAccess as inspectLegacy} from './legacy-sqlite/backup-restore.js';
export type RestoreSummary={version:string;createdAt:string;products:number;returns:number;attachments:number;mfaKeyRequired:boolean;mfaKeySupplied:boolean;administratorAccess:boolean;unavailableMfaAccounts:number};
const member=(p:string)=>['manifest.json','data.jsonl'].includes(p)||/^(attachments|branding|chat-attachments)\/[\w-]+\.(pdf|png|jpe?g|webp)$/i.test(p);
export async function inspectPreparedAccess(target:string){if(existsSync(join(target,'retouren.sqlite')))return inspectLegacy(target);const users:any[]=[],factors:any[]=[];for await(const line of boundedLines(join(target,'data.jsonl'))){const r=JSON.parse(line);if(!['users','user_mfa'].includes(r.table))continue;const t=TABLE_CONTRACTS.find(t=>t.name===r.table)!;const values=decodedRow(t,r.values),row=Object.fromEntries(t.columns.map((c,i)=>[c.name,values[i]]));(r.table==='users'?users:factors).push(row);}const keys=createSecrets(target),readable=new Set();let unavailableMfaAccounts=0;for(const f of factors)if(f.secretEnc){try{keys.decrypt('mfa',String(f.userId),f.secretEnc);readable.add(f.userId);}catch{unavailableMfaAccounts++;}}const administratorAccess=users.some(u=>{if(u.deletedAt||u.active!==1||u.role!=='admin')return false;const f=factors.find(f=>f.userId===u.id);return f?.secretEnc?readable.has(u.id):!f?.forceEnrollment||!factors.some(f=>f.secretEnc)||keys.has('mfa');});return {administratorAccess,unavailableMfaAccounts};}
export async function prepareBackup({archive,target,mfaKey,limits=BACKUP_LIMITS,databaseConfig}:{archive:string;target:string;mfaKey?:string|Buffer;limits?:BackupLimits;databaseConfig?:DatabaseConfig}):Promise<RestoreSummary>{
 archive=resolve(archive);target=resolve(target);const s=lstatSync(archive);if(!s.isFile()||s.isSymbolicLink()||s.size>limits.maxArchiveBytes)throw Error('Ungültiges oder zu großes Archiv.');
 const {members,legacy}=await inspectBackupArchive(archive,limits,member);
 if(legacy){if(members.has('data.jsonl'))throw Error('Mehrdeutiges Sicherungsformat.');return prepareLegacy({archive,target,mfaKey,limits});}
 if(!members.has('data.jsonl')||!members.has('manifest.json'))throw Error('Vollständige Datensicherung fehlt.');if(!databaseConfig)throw Error('PostgreSQL-Verbindung zur Sicherungsprüfung fehlt.');
 if(existsSync(target)&&(!lstatSync(target).isDirectory()||lstatSync(target).isSymbolicLink()||readdirSync(target).length))throw Error('Ziel muss ein leerer Ordner sein.');mkdirSync(dirname(target),{recursive:true,mode:0o700});const work=mkdtempSync(join(dirname(target),'.retourenboard-restore-')),schema='rb_stage_'+randomBytes(16).toString('hex'),admin=await openDatabase(databaseConfig);let db;
 try{await extract({file:archive,cwd:work,strict:true,noChmod:true,noMtime:true,filter:(p:string,e:any)=>e.type==='Directory'?['attachments','branding','chat-attachments'].includes(p.replace(/\/$/,'')):member(p)});const manifest=JSON.parse(readFileSync(join(work,'manifest.json'),'utf8'));if(manifest.format!==2||manifest.engine!=='postgresql'||manifest.payload!=='tables-v1'||![1,2,3,4].includes(manifest.schema)||manifest.database!=='data.jsonl'||!Array.isArray(manifest.files)||manifest.files.length>limits.maxFiles)throw Error('Ungültiges Sicherungsmanifest.');const expected=new Set(['manifest.json']);
  for await(const line of boundedLines(join(work,'data.jsonl'))){if(JSON.parse(line).schema!==manifest.schema)throw Error('Abweichender Sicherungsschemastand.');break;}
  for(const entry of manifest.files){if(!member(entry.path)||entry.path==='manifest.json'||expected.has(entry.path)||!Number.isSafeInteger(entry.size)||entry.size<0||!/^[a-f0-9]{64}$/.test(entry.sha256))throw Error('Ungültiger Manifestpfad.');expected.add(entry.path);const path=join(work,entry.path),stat=lstatSync(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==entry.size||await sha256File(path)!==entry.sha256)throw Error('Prüfsumme der Sicherung stimmt nicht.');}if(members.size!==expected.size||[...members].some(p=>!expected.has(p)))throw Error('Archiv und Manifest stimmen nicht überein.');
  await admin.query('CREATE SCHEMA "'+schema+'"');db=await openDatabase(databaseConfig,schema);const tables=await importData(db,join(work,'data.jsonl'));if(JSON.stringify(tables)!==JSON.stringify(manifest.tables))throw Error('Tabellenmanifest stimmt nicht.');
  // Pending 2FA setup is session-bound and must never survive restore.
  await db.query('DELETE FROM mfa_enrollments');
  await validateTransferredData(db,work,expected);
  if(mfaKey){const value=Buffer.isBuffer(mfaKey)?mfaKey:readFileSync(mfaKey);if(value.length!==32)throw Error('Separater MFA-Schlüssel ist ungültig.');mkdirSync(join(work,'secrets'),{mode:0o700});writeFileSync(join(work,'secrets','mfa.key'),value,{mode:0o600,flag:'wx'});}
  const access=await inspectPreparedAccess(work),count=(table:string)=>tables.find(t=>t.name===table)?.count??0;const summary={version:String(manifest.version??'unbekannt'),createdAt:String(manifest.createdAt??''),products:count('products'),returns:count('returns'),attachments:count('attachments')+count('chat_attachments'),mfaKeyRequired:!!(await db.query('SELECT 1 FROM user_mfa WHERE secretEnc IS NOT NULL LIMIT 1')).rowCount,mfaKeySupplied:!!mfaKey,...access};rmSync(join(work,'manifest.json'));if(existsSync(target))rmSync(target);renameSync(work,target);return summary;
 }finally{await db?.close();await admin.query('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE').catch(()=>{});await admin.close();rmSync(work,{recursive:true,force:true});}
}
export async function restoreBackup(options:Parameters<typeof prepareBackup>[0]){return {target:resolve(options.target),...await prepareBackup(options)};}
