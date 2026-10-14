import {backup} from 'node:sqlite';
import {mkdirSync,lstatSync,mkdtempSync,copyFileSync,readFileSync,renameSync,rmSync,statSync,unlinkSync} from 'node:fs';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {create as archive} from '../vendor/archive.js';
import {InputError} from '../shared/model.js';
import type {Actor,Clock} from '../shared/types.js';
import {BACKUP_LIMITS,checkBackupSizes,sha256File,type BackupLimits} from '../shared/backup-contract.js';
import {storedFilePath} from './stored-files.js';
export function createBackups({store,dataDir,coordinator,clock,preferences,version,limits=BACKUP_LIMITS}:{store:any,dataDir:string,coordinator:any,clock:Clock,preferences:any,version:string,limits?:BackupLimits}){
  const folder=join(dataDir,'backups');let active:Promise<any>|null=null,closed=false;
  store.db.prepare("UPDATE backup_jobs SET state='failed',error='Vorheriger Lauf wurde unterbrochen.' WHERE state='running'").run();
  function directory(){mkdirSync(folder,{recursive:true,mode:0o700});const s=lstatSync(folder);if(!s.isDirectory()||s.isSymbolicLink())throw new InputError('Sicherungsordner ist ungültig.',503);}
  function path(name:string){if(!/^retourenboard-backup-[\da-f-]+\.tar\.gz$/.test(name))throw new InputError('Ungültiges Sicherungsarchiv.',400);const p=resolve(folder,name),r=relative(folder,p);if(isAbsolute(r)||r.startsWith('..'))throw new InputError('Ungültiger Sicherungspfad.');return p;}
  function get(id:string){const r=store.db.prepare('SELECT * FROM backup_jobs WHERE id=?').get(id);if(!r)throw new InputError('Sicherung nicht gefunden.',404);return {...r,metadata:r.metadata?JSON.parse(r.metadata):null};}
  function list(){return store.db.prepare('SELECT * FROM backup_jobs ORDER BY createdAt DESC,id DESC LIMIT 100').all().map((r:any)=>({...r,metadata:r.metadata?JSON.parse(r.metadata):null}));}
  async function run(actor:Actor,mode:'manual'|'auto',beforeCommit:()=>void,slot?:string){
    directory();const id=randomUUID(),filename=`retourenboard-backup-${id}.tar.gz`,target=path(filename),temporary=target+'.part',work=mkdtempSync(join(folder,'.snapshot-'));
    try{
      await coordinator.run(async()=>{
        beforeCommit();
        store.transaction(()=>{store.db.prepare('INSERT INTO backup_jobs(id,mode,state,createdAt) VALUES(?,?,?,?)').run(id,mode,'running',new Date(clock.now()).toISOString());if(slot)store.db.prepare("INSERT INTO app_preferences(section,value) VALUES('backupSlot',?) ON CONFLICT(section) DO UPDATE SET value=excluded.value").run(slot);});
        await backup(store.db,join(work,'retouren.sqlite'));
        const files:string[]=['retouren.sqlite'],sizes=[statSync(join(work,'retouren.sqlite')).size];checkBackupSizes(sizes,limits);
        const references=store.db.prepare('SELECT storedName FROM attachments').all().map((r:any)=>({folder:'attachments',name:r.storedName}));
        if(store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='chat_attachments'").get())for(const r of store.db.prepare('SELECT a.storedName FROM chat_attachments a JOIN chat_messages m ON m.id=a.messageId WHERE m.deleted=0').all())references.push({folder:'chat-attachments',name:r.storedName});
        if(store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='app_logo'").get())for(const r of store.db.prepare('SELECT storedName FROM app_logo').all())references.push({folder:'branding',name:r.storedName});
        for(const ref of references){if(!/^[\w.-]+$/.test(ref.name)||ref.name.includes('..'))throw new Error('Dateireferenz ist ungültig.');const source=storedFilePath(join(dataDir,ref.folder),ref.name,{mustExist:true}),s=lstatSync(source);if(!s.isFile()||s.isSymbolicLink())throw new Error('Dateireferenz ist ungültig.');sizes.push(s.size);checkBackupSizes(sizes,limits);mkdirSync(join(work,ref.folder),{recursive:true});copyFileSync(source,join(work,ref.folder,ref.name));files.push(ref.folder+'/'+ref.name);}
        const fileMetadata=[];for(const p of files)fileMetadata.push({path:p,size:statSync(join(work,p)).size,sha256:await sha256File(join(work,p))});
        const manifest={format:1,version,createdAt:new Date(clock.now()).toISOString(),database:'retouren.sqlite',mfaKeyRequired:Number(store.db.prepare('SELECT COUNT(*) AS n FROM user_mfa WHERE secretEnc IS NOT NULL').get().n)>0,files:fileMetadata};
        const {writeFileSync}=await import('node:fs');writeFileSync(join(work,'manifest.json'),JSON.stringify(manifest,null,2));
        checkBackupSizes([...sizes,statSync(join(work,'manifest.json')).size],{...limits,maxFiles:limits.maxFiles+1});
      });
      await archive({cwd:work,file:temporary,gzip:true,portable:true},['manifest.json','retouren.sqlite',...['attachments','branding','chat-attachments'].filter(f=>{try{return lstatSync(join(work,f)).isDirectory();}catch{return false;}})]);
      const size=statSync(temporary).size;if(size>limits.maxArchiveBytes)throw new InputError('Sicherung überschreitet die unterstützte Archivgröße von 1 GiB. Datenverzeichnis offline sichern.',503);renameSync(temporary,target);
      await coordinator.run(()=>store.withActor(actor,()=>store.transaction(()=>{store.db.prepare("UPDATE backup_jobs SET state='complete',finishedAt=?,filename=?,size=?,metadata=? WHERE id=?").run(new Date(clock.now()).toISOString(),filename,size,JSON.stringify({version,mfaKeySeparate:true}),id);store.recordChange?.({entity:'backups',id,action:'create',after:{size}});})));
      if(mode==='auto')await coordinator.run(()=>{const retain=preferences.get('backups').retain;for(const old of store.db.prepare("SELECT id,filename FROM backup_jobs WHERE mode='auto' AND state='complete' ORDER BY createdAt DESC,rowid DESC LIMIT -1 OFFSET ?").all(retain)){try{const p=path(old.filename);if(!lstatSync(p).isSymbolicLink())unlinkSync(p);store.db.prepare("UPDATE backup_jobs SET state='rotated',filename=NULL WHERE id=?").run(old.id);}catch(error:any){if(error.code==='ENOENT')store.db.prepare("UPDATE backup_jobs SET state='rotated',filename=NULL WHERE id=?").run(old.id);}}});
      return get(id);
    }catch(error){if(error instanceof InputError&&[401,403].includes(error.status))throw error;const message=error instanceof InputError&&error.status===503?error.message:'Sicherung fehlgeschlagen. Speicherplatz und Dateizugriff prüfen.';await coordinator.run(()=>store.transaction(()=>{store.db.prepare("UPDATE backup_jobs SET state='failed',finishedAt=?,error=? WHERE id=?").run(new Date(clock.now()).toISOString(),message,id);store.db.prepare('INSERT OR IGNORE INTO events(id,type,payload,createdAt) VALUES(?,?,?,?)').run('backupError:'+id,'backupError',JSON.stringify({id}),new Date(clock.now()).toISOString());}));throw new InputError(message,503);}
    finally{try{unlinkSync(temporary);}catch{}const r=relative(folder,work);if(!isAbsolute(r)&&!r.startsWith('..')&&r.startsWith('.snapshot-'))rmSync(work,{recursive:true,force:true});}
  }
  return {
    list,get,
    file(id:string){const meta=get(id);if(meta.state!=='complete'||!meta.filename)throw new InputError('Sicherung ist nicht verfügbar.',404);const p=path(meta.filename),s=lstatSync(p);if(!s.isFile()||s.isSymbolicLink())throw new InputError('Ungültiges Archiv.',503);return {meta,path:p};},
    create(actor:Actor,mode:'manual'|'auto'='manual',beforeCommit=()=>{},slot?:string){if(closed)throw new InputError('Server wird beendet.',503);if(active)throw new InputError('Eine Sicherung läuft bereits.',409);active=run(actor,mode,beforeCommit,slot).finally(()=>active=null);return active;},
    read(id:string){const meta=get(id);if(meta.state!=='complete'||!meta.filename)throw new InputError('Sicherung ist nicht verfügbar.',404);const p=path(meta.filename);if(lstatSync(p).isSymbolicLink())throw new InputError('Ungültiges Archiv.',503);return {meta,bytes:readFileSync(p)};},
    status:()=>({running:!!active}),async close(){closed=true;await active?.catch(()=>{});}
  };
}
