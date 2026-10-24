// Rename managed Linux storage while both application services are stopped.
// Original paths remain compatibility links for older releases and rollbacks.
import {lstatSync,existsSync,readFileSync,writeFileSync,mkdirSync,renameSync,readlinkSync,symlinkSync,readdirSync,openSync,fsyncSync,closeSync,chmodSync,chownSync,unlinkSync} from 'node:fs';
import {join,resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';

const paths=[['/opt/retourenverwaltung','/opt/retourenboard','dir'],['/var/lib/retourenverwaltung','/var/lib/retourenboard','dir'],['/etc/retourenverwaltung.env','/etc/retourenboard.env','file']];
const stat=p=>{try{return lstatSync(p);}catch(error){if(error.code==='ENOENT')return null;throw error;}};
function sync(path){if(process.platform==='win32')return;const fd=openSync(path,'r');try{fsyncSync(fd);}finally{closeSync(fd);}}
function atomic(file,contents,mode=0o600){
 const old=stat(file),temporary=file+'.'+randomUUID()+'.part',fd=openSync(temporary,'wx',old?old.mode&0o777:mode);
 try{writeFileSync(fd,contents);fsyncSync(fd);}finally{closeSync(fd);}
 if(old&&process.platform!=='win32')chownSync(temporary,old.uid,old.gid);
 try{renameSync(temporary,file);sync(dirname(file));}finally{if(existsSync(temporary))unlinkSync(temporary);}
}
function ordinary(file,directory=false){const s=stat(file);if(s&&(s.isSymbolicLink()||(directory?!s.isDirectory():!s.isFile()||s.nlink!==1)))throw Error('Ungültiger oder verlinkter Installationspfad: '+file);return s;}
function mapped(value){for(const [old,next] of paths)if(value===old||old!==paths[2][0]&&value.startsWith(old+'/'))return next+value.slice(old.length);return value;}
function environment(text){return text.replace(/^(\s*(?:DATA_DIR|DB_PATH)\s*=\s*["']?)\/var\/lib\/retourenverwaltung(?=\/|["'\s]|$)/gm,'$1/var/lib/retourenboard');}
function unit(text){for(const [old,next] of paths)text=text.replace(new RegExp(old.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?=/|[\\s"\']|$)','g'),next);return text;}

export function migrateInstallPaths({root='/'}={}){
 root=resolve(root);const local=p=>join(root,p),state=local('/var/lib/retourenboard-updater'),journal=join(state,'paths-migration.json');
 ordinary(state,true);if(!existsSync(state))mkdirSync(state,{recursive:true,mode:0o700});
 let prior=null;if(ordinary(journal)){prior=JSON.parse(readFileSync(journal,'utf8'));if(prior.format!==1||!['started','complete'].includes(prior.phase))throw Error('Ungültiges Pfadmigrationsjournal.');}
 const pairs=paths.map(([old,next,type])=>({old:local(old),next:local(next),type}));
 // Check every destination before moving anything. Independent stores must never
 // be merged, and an unrelated symlink must never redirect a root operation.
 for(const pair of pairs){const old=stat(pair.old),next=ordinary(pair.next,pair.type==='dir');if(old?.isSymbolicLink()){if(resolve(dirname(pair.old),readlinkSync(pair.old))!==pair.next)throw Error('Ungültiger alter Installationslink: '+pair.old);}
  else if(old){ordinary(pair.old,pair.type==='dir');if(next)throw Error('Konflikt: Beide Installationspfade enthalten einen eigenen Bestand. '+pair.old+' und '+pair.next);}}
 const migrating=!!prior||pairs.some(p=>stat(p.old));if(!migrating)return {migrated:false};
 if(!prior)atomic(journal,JSON.stringify({format:1,phase:'started'}));
 for(const pair of pairs){const old=stat(pair.old);if(old&&!old.isSymbolicLink()){renameSync(pair.old,pair.next);sync(dirname(pair.next));}
  if(stat(pair.next)&&!stat(pair.old)){symlinkSync(pair.next,pair.old,pair.type==='dir'&&process.platform==='win32'?'junction':pair.type);sync(dirname(pair.old));}}
 const app=local('/opt/retourenboard');
 for(const name of ['current','node']){const file=join(app,name),s=stat(file);if(!s)continue;if(!s.isSymbolicLink())throw Error('Ungültiger Laufzeitlink: '+file);
  const target=resolve(app,readlinkSync(file)),oldBase=local('/opt/retourenverwaltung'),rel=relative(oldBase,target);if(rel&&!rel.startsWith('..')&&!rel.includes(':')){const temporary=file+'.'+randomUUID()+'.part';symlinkSync(join(app,rel),temporary,process.platform==='win32'?'junction':'dir');if(process.platform==='win32')unlinkSync(file);renameSync(temporary,file);sync(app);}}
 const edits=[];
 const add=(file,convert)=>{if(ordinary(file)){const before=readFileSync(file,'utf8'),after=convert(before);if(after!==before)edits.push([file,after]);}};
 add(local('/etc/retourenboard.env'),environment);
 for(const name of ['retourenboard.service','retourenverwaltung.service','retourenboard-updater.service']){const file=local('/etc/systemd/system/'+name);if(!stat(file)?.isSymbolicLink())add(file,unit);}
 for(const name of ['install-transaction.json','transaction.json'])add(join(state,name),text=>{const j=JSON.parse(text);for(const field of ['newRelease','oldRelease','newRuntime','oldRuntime'])if(typeof j[field]==='string')j[field]=mapped(j[field]);return JSON.stringify(j);});
 const installations=join(state,'installations');if(ordinary(installations,true))for(const name of readdirSync(installations)){const stage=join(installations,name);ordinary(stage,true);for(const prefix of ['new','old']){add(join(stage,prefix+'.env'),environment);add(join(stage,prefix+'.service'),unit);}}
 for(const [file,text] of edits)atomic(file,text);
 atomic(journal,JSON.stringify({format:1,phase:'complete'}));return {migrated:true};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.platform!=='linux'||process.getuid()!==0)throw Error('Pfadmigration benötigt den Linux-Installer mit root.');
 if(process.argv.length!==2)throw Error('Keine zusätzlichen Pfadoptionen erlaubt.');
 const result=migrateInstallPaths();if(result.migrated)console.log('Installationspfade auf retourenboard umgestellt; bisherige Pfade bleiben als Kompatibilitätslinks erhalten.');
}
