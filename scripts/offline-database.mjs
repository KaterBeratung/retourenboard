import {existsSync,mkdirSync,lstatSync,writeFileSync} from 'node:fs';
import {resolve,join,relative,isAbsolute} from 'node:path';
import {execFileSync} from 'node:child_process';
import {openDatabase} from '../dist/server/database/connection.js';
import {readDatabaseConfig} from '../dist/server/database/config.js';
import {acquireRuntimeLease} from '../dist/server/database/runtime-lease.js';
import {technicalSnapshot} from '../dist/server/database/technical-snapshot.js';
import {copyPrivateTree,syncPrivateTree} from '../dist/server/update-linux.js';

export function requireStopped(args){
 if(!args.includes('--service-stopped')||!args.includes('--confirm'))throw Error('Dienst zuerst stoppen; --service-stopped und --confirm sind erforderlich.');
 if(process.platform==='linux')for(const service of ['retourenboard','retourenverwaltung']){
  let state='';try{state=execFileSync('systemctl',['is-active',service],{encoding:'utf8',timeout:10000,stdio:['ignore','pipe','ignore']}).trim();}catch{}
  if(['active','activating'].includes(state))throw Error('Anwendungsdienst läuft noch. Zuerst stoppen.');
 }
}
export async function offlineDatabase({dataDir,databaseConfig=readDatabaseConfig(),schema='retourenboard'},job){
 dataDir=resolve(dataDir);const stat=lstatSync(dataDir);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Ungültiges Datenverzeichnis.');
 const lease=await acquireRuntimeLease(databaseConfig,schema);let database;
 try{database=await openDatabase(databaseConfig,schema);return await job({database,config:databaseConfig,dataDir,schema});}
 finally{await database?.close();await lease.close();}
}
export async function safetySnapshot({config,dataDir,schema},target,binDir){
 target=resolve(target);const rel=relative(dataDir,target);if(!rel||!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+(process.platform==='win32'?'\\':'/')))throw Error('Sicherung außerhalb des Datenverzeichnisses anlegen.');
 if(existsSync(target))throw Error('Sicherungsziel existiert bereits.');
 mkdirSync(target,{mode:0o700});
 const metadata=await technicalSnapshot({config,schema,file:join(target,'database.dump'),binDir});
 copyPrivateTree(dataDir,join(target,'data'));
 writeFileSync(join(target,'metadata.json'),JSON.stringify(metadata),{mode:0o600,flag:'wx'});syncPrivateTree(target);
 return {target,metadata};
}
