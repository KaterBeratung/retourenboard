import {mkdirSync,lstatSync,readdirSync,readFileSync,writeFileSync,renameSync,rmSync,openSync,fsyncSync,closeSync} from 'node:fs';
import {resolve,join,dirname,basename,relative,isAbsolute} from 'node:path';
type Entry={relativePath:string,hadOriginal:boolean};
type Journal={format:1,operationId:string,phase:'switching'|'activated'|'committed'|'rolledBack',entries:Entry[]};
export function createRestoreTransaction({dataDir,dbPath,io}:{dataDir:string,dbPath:string,io?:{checkpoint:(point:string)=>void}}){
 dataDir=resolve(dataDir);dbPath=resolve(dbPath);const dbName=basename(dbPath);
 if(dirname(dbPath)!==dataDir||['.restore','attachments','branding','chat-attachments','secrets','backups','journal.json'].includes(dbName))throw Error('Ungültiger Datenbankpfad.');
 const legacyNames=[dbName,dbName+'-wal',dbName+'-shm','attachments','branding','secrets/mfa.key'],names=[...legacyNames,'chat-attachments'],folder=join(dataDir,'.restore'),journalPath=join(folder,'journal.json');
 function exists(path:string){try{lstatSync(path);return true;}catch(error:any){if(error.code==='ENOENT')return false;throw error;}}
 function safe(path:string,recursive=false){
  const r=relative(dataDir,resolve(path));if(isAbsolute(r)||r.startsWith('..'))throw Error('Ungültiger Wiederherstellungspfad.');
  let p=dataDir;for(const part of r.split(/[\\/]/).filter(Boolean)){p=join(p,part);if(exists(p)&&lstatSync(p).isSymbolicLink())throw Error('Links sind für die Wiederherstellung nicht erlaubt.');}
  if(recursive&&exists(path)&&lstatSync(path).isDirectory())for(const name of readdirSync(path))safe(join(path,name),true);
 }
 function syncDirectory(path:string){if(process.platform==='win32')return;const fd=openSync(path,'r');try{fsyncSync(fd);}finally{closeSync(fd);}}
 function persist(j:Journal){safe(folder);mkdirSync(folder,{recursive:true,mode:0o700});const temp=journalPath+'.tmp';safe(temp);writeFileSync(temp,JSON.stringify(j),{mode:0o600});const fd=openSync(temp,'r+');try{fsyncSync(fd);}finally{closeSync(fd);}renameSync(temp,journalPath);syncDirectory(folder);}
 function read():Journal|null{
  safe(journalPath);if(!exists(journalPath))return null;if(lstatSync(journalPath).size>16384)throw Error('Ungültiges Restore-Journal.');
  const j=JSON.parse(readFileSync(journalPath,'utf8'));
  if(j.format!==1||!/^[a-f0-9-]{36}$/.test(j.operationId)||!['switching','activated','committed','rolledBack'].includes(j.phase)||!Array.isArray(j.entries)||![names.length,legacyNames.length].includes(j.entries.length)||j.entries.some((e:any,i:number)=>e.relativePath!==names[i]||typeof e.hadOriginal!=='boolean'))throw Error('Ungültiges Restore-Journal.');
  return j;
 }
 function move(source:string,target:string){safe(source,true);safe(target);mkdirSync(dirname(target),{recursive:true,mode:0o700});io?.checkpoint('beforeRename');renameSync(source,target);syncDirectory(dirname(source));syncDirectory(dirname(target));io?.checkpoint('afterRename');}
 async function rollback(){
  const j=read();if(!j||['committed','rolledBack'].includes(j.phase))return;
  const work=join(folder,j.operationId);safe(work,true);
  for(const e of [...j.entries].reverse()){
   const active=join(dataDir,e.relativePath),old=join(work,'previous',e.relativePath),incoming=join(work,'incoming',e.relativePath);safe(active,true);
   if(exists(old)){if(exists(active))rmSync(active,{recursive:true,force:true});mkdirSync(dirname(active),{recursive:true});renameSync(old,active);syncDirectory(dirname(active));}
   else if(!e.hadOriginal&&!exists(incoming)&&exists(active)){rmSync(active,{recursive:true,force:true});syncDirectory(dirname(active));}
  }
  j.phase='rolledBack';persist(j);
 }
 return {
  async activate(preparedDir:string,operationId:string){
   if(!/^[a-f0-9-]{36}$/.test(operationId))throw Error('Ungültige Vorgangskennung.');
   const existing=read();if(existing&&!['committed','rolledBack'].includes(existing.phase))throw Error('Eine Wiederherstellung ist noch offen.');
   preparedDir=resolve(preparedDir);safe(preparedDir,true);if(!exists(join(preparedDir,'retouren.sqlite')))throw Error('Vorbereitete Datenbank fehlt.');
   const work=join(folder,operationId),incoming=join(work,'incoming');safe(work);if(exists(work))throw Error('Vorgang existiert bereits.');mkdirSync(incoming,{recursive:true,mode:0o700});
   for(const name of names){safe(join(dataDir,name),true);const source=join(preparedDir,name===dbName?'retouren.sqlite':name);if(exists(source)){safe(source,true);const target=join(incoming,name);mkdirSync(dirname(target),{recursive:true});renameSync(source,target);}}
   const j:Journal={format:1,operationId,phase:'switching',entries:names.map(relativePath=>({relativePath,hadOriginal:exists(join(dataDir,relativePath))}))};persist(j);
   for(const e of j.entries){const active=join(dataDir,e.relativePath),next=join(incoming,e.relativePath);if(e.hadOriginal)move(active,join(work,'previous',e.relativePath));if(exists(next))move(next,active);}
   j.phase='activated';persist(j);
  },rollback,
  async commit(){const j=read();if(!j||j.phase!=='activated')throw Error('Wiederherstellung ist nicht aktiviert.');j.phase='committed';persist(j);},
  async recover(){const j=read();if(!j)return 'none' as const;if(j.phase==='committed')return 'committed' as const;await rollback();return 'rolledBack' as const;}
 };
}
