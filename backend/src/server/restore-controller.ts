import {mkdirSync,lstatSync,writeFileSync,readFileSync,rmSync} from 'node:fs';import {open} from 'node:fs/promises';
import {join} from 'node:path';import {randomUUID} from 'node:crypto';import {InputError} from '../shared/model.js';
import type {DatabaseConfig} from './database/types.js';
import {BACKUP_LIMITS,type BackupLimits} from '../shared/backup-contract.js';import {prepareBackup,inspectPreparedAccess,type RestoreSummary} from './backup-restore.js';
export type RestoreOwner={userId:number,sessionId:string,authVersion:number};
export type RestoreView={id:string,expiresAt:number,state:'ready'|'keyRequired'|'accepted'|'failed',summary:RestoreSummary};
export type PreparedRestore={id:string,owner:RestoreOwner,preparedDir:string,summary:RestoreSummary};
type Preparation=PreparedRestore&{work:string,expiresAt:number,state:'preparing'|'ready'|'keyRequired'|'accepted'};
export function createRestoreController({dataDir,clock={now:Date.now},limits=BACKUP_LIMITS,currentMfaKey,databaseConfig}:{dataDir:string,clock?:{now:()=>number},limits?:BackupLimits,databaseConfig?:DatabaseConfig,currentMfaKey?:()=>Buffer|undefined}){
 const entries=new Map<string,Preparation>(),pending=new Set<Promise<any>>();let closed=false;const folder=join(dataDir,'.restore','preparations');
 function ensure(){for(const p of [dataDir,join(dataDir,'.restore'),folder]){mkdirSync(p,{recursive:true,mode:0o700});const s=lstatSync(p);if(!s.isDirectory()||s.isSymbolicLink())throw new InputError('Arbeitsordner für Wiederherstellung ist ungültig.',503);}}
 function cleanup(){for(const [id,item]of entries)if(item.state!=='preparing'&&item.state!=='accepted'&&item.expiresAt<=clock.now()){rmSync(item.work,{recursive:true,force:true});entries.delete(id);}}
 function allocate(owner:RestoreOwner){if(closed)throw new InputError('Server wird beendet.',503);cleanup();if(entries.size>=16||[...entries.values()].filter(e=>e.owner.sessionId===owner.sessionId).length>=4)throw new InputError('Zu viele vorbereitete Wiederherstellungen. Bitte kurz warten.',429);ensure();const id=randomUUID(),work=join(folder,id);mkdirSync(work,{mode:0o700});const item={id,owner:{...owner},work,preparedDir:join(work,'prepared'),expiresAt:clock.now()+900000,state:'preparing'} as Preparation;entries.set(id,item);return item;}
 function owned(id:string,owner:RestoreOwner){const item=entries.get(id);if(!item||item.owner.userId!==owner.userId||item.owner.sessionId!==owner.sessionId||item.owner.authVersion!==owner.authVersion)throw new InputError('Vorbereitung nicht gefunden.',404);if(closed||item.expiresAt<=clock.now())throw new InputError('Vorbereitung ist abgelaufen. Archiv erneut prüfen.',410);if(item.state==='preparing')throw new InputError('Archiv wird noch geprüft.',409);return item;}
 const view=(e:Preparation):RestoreView=>({id:e.id,expiresAt:e.expiresAt,state:e.state as RestoreView['state'],summary:{...e.summary}});
 async function prepared(item:Preparation,archive:string){
  let key=currentMfaKey?.();item.summary=await prepareBackup({archive,target:item.preparedDir,mfaKey:key,limits,databaseConfig});
  if(key&&item.summary.unavailableMfaAccounts){rmSync(join(item.preparedDir,'secrets','mfa.key'),{force:true});item.summary={...item.summary,mfaKeySupplied:false,...await inspectPreparedAccess(item.preparedDir)};}
  if(closed||clock.now()>=item.expiresAt)throw new InputError('Vorbereitung ist abgelaufen.',410);
  item.state=item.summary.administratorAccess?'ready':'keyRequired';return view(item);
 }
 function track<T>(item:Preparation,job:()=>Promise<T>){const p=job().catch(error=>{entries.delete(item.id);rmSync(item.work,{recursive:true,force:true});if(error instanceof InputError)throw error;throw new InputError(error.message||'Sicherung konnte nicht geprüft werden.',400);}).finally(()=>pending.delete(p));pending.add(p);return p;}
 return {
  prepareLocal(archive:string,owner:RestoreOwner){const item=allocate(owner);return track(item,()=>prepared(item,archive));},
  prepareUpload(stream:AsyncIterable<Uint8Array>,owner:RestoreOwner){const item=allocate(owner);return track(item,async()=>{const archive=join(item.work,'upload.tar.gz'),file=await open(archive,'wx',0o600);let size=0;try{for await(const chunk of stream){size+=chunk.length;if(size>limits.maxArchiveBytes)throw new InputError('Sicherungsarchiv ist zu groß (maximal 1 GiB).',413);if(closed||clock.now()>=item.expiresAt)throw new InputError('Upload ist abgelaufen.',410);await file.write(chunk);}}finally{await file.close();}return prepared(item,archive);});},
  get(id:string,owner:RestoreOwner){return view(owned(id,owner));},
  async setKey(id:string,key:Buffer,owner:RestoreOwner){const item=owned(id,owner);if(item.state==='accepted')throw new InputError('Wiederherstellung wurde bereits bestätigt.',409);if(key.length!==32)throw new InputError('Die Schlüsseldatei muss genau 32 Byte enthalten.');const path=join(item.preparedDir,'secrets','mfa.key');mkdirSync(join(item.preparedDir,'secrets'),{recursive:true,mode:0o700});let old:Buffer|undefined;try{old=readFileSync(path);}catch{}writeFileSync(path,key,{mode:0o600});const access=await inspectPreparedAccess(item.preparedDir);if(access.unavailableMfaAccounts||!access.administratorAccess){if(old)writeFileSync(path,old);else rmSync(path,{force:true});throw new InputError('Dieser MFA-Schlüssel passt nicht zur Sicherung.');}item.summary={...item.summary,mfaKeySupplied:true,...access};item.state='ready';return view(item);},
  reserve(id:string,owner:RestoreOwner):PreparedRestore{const item=owned(id,owner);if(item.state==='accepted')throw new InputError('Wiederherstellung wurde bereits bestätigt.',409);if(!item.summary.administratorAccess)throw new InputError('Kein Administrator kann sich anmelden. Passenden MFA-Schlüssel ergänzen.',409);item.state='accepted';return {id:item.id,owner:{...owner},preparedDir:item.preparedDir,summary:{...item.summary}};},
  release(id:string){const item=entries.get(id);if(item?.state==='accepted')item.state=item.summary.administratorAccess?'ready':'keyRequired';},
  discard(id:string){const item=entries.get(id);if(item){rmSync(item.work,{recursive:true,force:true});entries.delete(id);}},
  async close(){closed=true;await Promise.allSettled([...pending]);for(const item of entries.values())rmSync(item.work,{recursive:true,force:true});entries.clear();}
 };
}
