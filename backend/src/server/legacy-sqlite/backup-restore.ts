import {list,extract} from '../../vendor/archive.js';
import {DatabaseSync} from 'node:sqlite';
import {lstatSync,readdirSync,mkdirSync,mkdtempSync,readFileSync,renameSync,rmSync,writeFileSync} from 'node:fs';
import {resolve,join,dirname,relative,isAbsolute} from 'node:path';
import {BACKUP_LIMITS,sha256File,type BackupLimits} from '../../shared/backup-contract.js';
import {createStore} from './store.js';
import {createUsers} from './users.js';
import {createSecrets} from '../secrets.js';
import {assertRestoreSchema,assertRestoreFiles} from './restore-validation.js';
export type RestoreSummary={version:string,createdAt:string,products:number,returns:number,attachments:number,mfaKeyRequired:boolean,mfaKeySupplied:boolean,administratorAccess:boolean,unavailableMfaAccounts:number};
const member=(p:string)=>p==='manifest.json'||p==='retouren.sqlite'||/^(attachments|branding|chat-attachments)\/[\w-]+\.(pdf|png|jpe?g|webp)$/i.test(p);
export function inspectPreparedAccess(target:string){
 const db=new DatabaseSync(join(target,'retouren.sqlite'),{readOnly:true});
 try{
  const secrets=createSecrets(target);
  const factors=db.prepare('SELECT userId,secretEnc,forceEnrollment FROM user_mfa').all() as any[];
  let unavailableMfaAccounts=0;const readable=new Set<number>();
  for(const factor of factors)if(factor.secretEnc){try{secrets.decrypt('mfa',String(factor.userId),factor.secretEnc);readable.add(factor.userId);}catch{unavailableMfaAccounts++;}}
  const administratorAccess=(db.prepare("SELECT id FROM users WHERE active=1 AND role='admin'").all() as any[]).some(admin=>{
   const factor=factors.find(f=>f.userId===admin.id);
   if(factor?.secretEnc)return readable.has(admin.id);
   return !factor?.forceEnrollment||!factors.some(f=>f.secretEnc)||secrets.has('mfa');
  });
  return {administratorAccess,unavailableMfaAccounts};
 }finally{db.close();}
}
export async function prepareBackup({archive,target,mfaKey,limits=BACKUP_LIMITS}:{archive:string,target:string,mfaKey?:string|Buffer,limits?:BackupLimits}):Promise<RestoreSummary>{
 archive=resolve(archive);target=resolve(target);
 const s=lstatSync(archive);if(!s.isFile()||s.isSymbolicLink()||s.size>limits.maxArchiveBytes)throw new Error('Ungültiges oder zu großes Archiv.');
 function empty(){try{const s=lstatSync(target);if(!s.isDirectory()||s.isSymbolicLink()||readdirSync(target).length)throw new Error('Ziel muss ein leerer Ordner sein.');}catch(error:any){if(error.code!=='ENOENT')throw error;}}
 empty();mkdirSync(dirname(target),{recursive:true});let invalid=false,total=0;const members=new Set<string>();
 await list({file:archive,strict:true,onReadEntry:(e:any)=>{const p=e.path.replace(/\/$/,'');if(e.type==='Directory'&&['attachments','branding','chat-attachments'].includes(p))return;if(e.type!=='File'||!member(p)||members.has(p)||!Number.isSafeInteger(e.size)||e.size<0||e.size>limits.maxFileBytes)invalid=true;members.add(p);total+=e.size;if(total>limits.maxTotalBytes||members.size>limits.maxFiles+1)invalid=true;e.resume();}});
 if(invalid||!members.has('manifest.json')||!members.has('retouren.sqlite'))throw new Error('Archiv enthält unzulässige Pfade, Links oder Dateitypen.');
 const work=mkdtempSync(join(dirname(target),'.retourenboard-restore-'));let failure:unknown;
 try{
  await extract({file:archive,cwd:work,strict:true,noChmod:true,noMtime:true,filter:(p:string,e:any)=>e.type==='Directory'?['attachments','branding','chat-attachments'].includes(p.replace(/\/$/,'')):member(p)});
  const manifest=JSON.parse(readFileSync(join(work,'manifest.json'),'utf8'));
  if(manifest.format!==1||manifest.database!=='retouren.sqlite'||!Array.isArray(manifest.files)||manifest.files.length>limits.maxFiles)throw new Error('Ungültiges Sicherungsmanifest.');
  const expected=new Set(['manifest.json']);
  for(const entry of manifest.files){if(typeof entry.path!=='string'||!member(entry.path)||entry.path==='manifest.json'||expected.has(entry.path)||!Number.isSafeInteger(entry.size)||entry.size<0||!/^[a-f0-9]{64}$/.test(entry.sha256))throw new Error('Ungültiger Manifestpfad.');expected.add(entry.path);const p=join(work,entry.path),s=lstatSync(p);if(!s.isFile()||s.isSymbolicLink()||s.size!==entry.size||await sha256File(p)!==entry.sha256)throw new Error('Prüfsumme der Sicherung stimmt nicht.');}
  if(members.size!==expected.size||[...members].some(p=>!expected.has(p)))throw new Error('Archiv und Manifest stimmen nicht überein.');
  const db=new DatabaseSync(join(work,'retouren.sqlite'),{readOnly:true});
  try{
   for(const table of ['products','returns','users','attachments'])if(!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table))throw new Error('Sicherung enthält keine vollständige Retourenboard-Datenbank.');
   assertRestoreSchema(db);
   if(db.prepare('PRAGMA integrity_check').get()?.integrity_check!=='ok')throw new Error('Datenbankprüfung fehlgeschlagen.');
  }finally{db.close();}
  const store=createStore(join(work,'retouren.sqlite'));try{
   createUsers(store);const db=store.db;
   if(db.prepare('PRAGMA foreign_key_check').all().length)throw new Error('Datenbank enthält ungültige Zuordnungen.');
   assertRestoreSchema(db);assertRestoreFiles(db,work,expected);
   db.exec('DELETE FROM mfa_enrollments;');db.prepare("DELETE FROM app_preferences WHERE section='notifications'").run();db.prepare("UPDATE backup_jobs SET state='unavailable',filename=NULL WHERE state='complete'").run();db.prepare("UPDATE mail_outbox SET state='cancelled' WHERE state IN ('pending','sending')").run();
   assertRestoreFiles(db,work,expected);
  }finally{store.close();}
  if(mfaKey){let value:Buffer;if(Buffer.isBuffer(mfaKey))value=mfaKey;else{const p=resolve(mfaKey),s=lstatSync(p);if(!s.isFile()||s.isSymbolicLink())throw new Error('Separater MFA-Schlüssel ist ungültig.');value=readFileSync(p);}if(value.length!==32)throw new Error('Separater MFA-Schlüssel ist ungültig.');mkdirSync(join(work,'secrets'),{mode:0o700});writeFileSync(join(work,'secrets','mfa.key'),value,{mode:0o600,flag:'wx'});}
  const access=inspectPreparedAccess(work),count=new DatabaseSync(join(work,'retouren.sqlite'),{readOnly:true});let summary:RestoreSummary;
  const chatCount=count.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='chat_attachments'").get()?Number(count.prepare('SELECT COUNT(*) AS n FROM chat_attachments').get()?.n):0;
  try{summary={version:String(manifest.version??'unbekannt'),createdAt:String(manifest.createdAt??''),products:Number(count.prepare('SELECT COUNT(*) AS n FROM products').get()?.n),returns:Number(count.prepare('SELECT COUNT(*) AS n FROM returns').get()?.n),attachments:Number(count.prepare('SELECT COUNT(*) AS n FROM attachments').get()?.n)+chatCount,mfaKeyRequired:Number(count.prepare('SELECT COUNT(*) AS n FROM user_mfa WHERE secretEnc IS NOT NULL').get()?.n)>0,mfaKeySupplied:!!mfaKey,...access};}finally{count.close();}
  rmSync(join(work,'manifest.json'));empty();try{rmSync(target);}catch(error:any){if(error.code!=='ENOENT')throw error;}renameSync(work,target);return summary;
 }catch(error){failure=error;throw error;}finally{const r=relative(dirname(target),work);if(!isAbsolute(r)&&!r.startsWith('..')&&r.startsWith('.retourenboard-restore-'))try{rmSync(work,{recursive:true,force:true,maxRetries:3,retryDelay:100});}catch(error){if(!failure)throw error;}}
}
export async function restoreBackup(options:Parameters<typeof prepareBackup>[0]){const summary=await prepareBackup(options);return {target:resolve(options.target),...summary};}
