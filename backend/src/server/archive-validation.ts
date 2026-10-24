import {createReadStream} from 'node:fs';
import {list} from '../vendor/archive.js';
import type {BackupLimits} from '../shared/backup-contract.js';

export async function inspectBackupArchive(file:string,limits:BackupLimits,allowed:(path:string)=>boolean){
 const members=new Set<string>(),folded=new Set<string>();let total=0,legacy=false;
 await new Promise<void>((resolve,reject)=>{
  const input=createReadStream(file,{highWaterMark:64*1024});let settled=false;
  const finish=(error?:Error)=>{if(settled)return;settled=true;clearTimeout(timer);input.destroy();error?reject(error):resolve();};
  const parser=list({strict:true,maxMetaEntrySize:16384,maxDecompressionRatio:1000,onReadEntry:(entry:any)=>{
   const path=entry.path.replace(/\/$/,'');
   const directory=entry.type==='Directory'&&['attachments','branding','chat-attachments'].includes(path);
   const key=path.toLowerCase();
   if(folded.has(key)||!directory&&(entry.type!=='File'||!allowed(path)&&path!=='retouren.sqlite')||!Number.isSafeInteger(entry.size)||entry.size<0||entry.size>limits.maxFileBytes||path==='manifest.json'&&entry.size>32*1024*1024){parser.abort(Error('Archiv enthält unzulässige Pfade, Links, Größen oder Dateitypen.'));return;}
   folded.add(key);total+=entry.size;
   if(total>limits.maxTotalBytes||folded.size>limits.maxFiles+4){parser.abort(Error('Archiv überschreitet die unterstützten Grenzen.'));return;}
   if(!directory){members.add(path);if(path==='retouren.sqlite')legacy=true;}entry.resume();
  }});
  const timer=setTimeout(()=>parser.abort(Error('Archivprüfung überschreitet das Zeitlimit.')),120000);timer.unref();
  input.on('error',finish);parser.on('error',finish);parser.on('end',()=>finish());input.pipe(parser);
 });
 return {members,legacy};
}
