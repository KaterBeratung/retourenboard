import {existsSync,lstatSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,renameSync,readlinkSync,symlinkSync,unlinkSync,rmSync,readdirSync,chownSync,chmodSync,openSync,fsyncSync,closeSync} from 'node:fs';
import {resolve,join,dirname,relative,isAbsolute} from 'node:path';
import {parseEnv,promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {openDatabase} from '../dist/server/database/connection.js';
import {readDatabaseConfig} from '../dist/server/database/config.js';
import {acquireRuntimeLease} from '../dist/server/database/runtime-lease.js';
import {createActivation} from '../dist/server/migration/activation.js';
import {migrationCommand} from '../dist/server/migration/cli.js';
import {repairInstallBinding} from './install-binding.mjs';
import {installerOwnsMaintenance} from './install-maintenance.mjs';
import {preserveInstallCandidate} from './install-recovery.mjs';
import {legacyListenerPort} from '../dist/server/legacy-sqlite/network.js';
import {createLinuxUpdate,copyPrivateTree,syncPrivateTree,writeUpdateState,UPDATE_MARKER} from '../dist/server/update-linux.js';

if(process.platform!=='linux'||process.getuid()!==0)throw Error('Verwaltete Installation benötigt den Linux-Installer mit root.');
const options={},args=process.argv.slice(2);while(args.length){const flag=args.shift(),value=args.shift();if(flag==='--binding'){if(!['auto','lan','local'].includes(value))throw Error('Ungültige Bindungsoption.');options[flag]=value;continue;}if(!value||value.startsWith('--')||!['--release','--runtime','--previous-config','--previous-unit','--unit'].includes(flag))throw Error('Ungültige Installationsoption.');options[flag]=resolve(value);}
const appDir='/opt/retourenboard',releases=join(appDir,'releases'),dataDir='/var/lib/retourenboard',stateDir='/var/lib/retourenboard-updater',configFile='/etc/retourenboard.env',unit='/etc/systemd/system/retourenboard.service',service='retourenboard.service',journal=join(stateDir,'install-transaction.json');
const execute=promisify(execFile),run=async(command,args)=>{try{return (await execute(command,args,{timeout:45000,maxBuffer:128*1024})).stdout;}catch{throw Error('Systemdienst konnte nicht umgestellt werden. Dienstprotokoll prüfen.');}};
const uid=Number((await run('id',['-u','retourenverwaltung'])).trim()),gid=Number((await run('id',['-g','retourenverwaltung'])).trim());
const config=readDatabaseConfig(),metadata=JSON.parse(readFileSync(join(options['--release'],'dist/package.json'),'utf8')),version=metadata.version;if(metadata.retourenboard?.database!=='postgresql')throw Error('Das Installationspaket benötigt einen vollständigen PostgreSQL-Build.');
function sync(path){const fd=openSync(path,'r');try{fsyncSync(fd);}finally{closeSync(fd);}}
function durableCopy(from,to,mode){const temp=to+'.'+randomUUID()+'.part';copyFileSync(from,temp);chmodSync(temp,mode);sync(temp);renameSync(temp,to);sync(dirname(to));}
function directory(path){const s=lstatSync(path);if(!s.isDirectory()||s.isSymbolicLink())throw Error('Ungültiger Installationsordner.');}
function within(root,path){const rel=relative(root,resolve(path));if(!rel||isAbsolute(rel)||rel.startsWith('..'))throw Error('Ungültiger Installationspfad.');return resolve(path);}
function own(path){const s=lstatSync(path);if(s.isSymbolicLink()||!s.isFile()&&!s.isDirectory()||s.isFile()&&s.nlink!==1)throw Error('Links oder spezielle Dateien sind im Datenbestand nicht erlaubt.');chownSync(path,uid,gid);chmodSync(path,s.isDirectory()?0o700:0o600);if(s.isDirectory())for(const name of readdirSync(path))own(join(path,name));}
function link(name,target){target=within(appDir,target);directory(target);const tmp=join(appDir,'.'+name+'-'+randomUUID());symlinkSync(target,tmp);renameSync(tmp,join(appDir,name));sync(appDir);}
function current(name){const path=join(appDir,name);return existsSync(path)?within(name==='current'?releases:appDir,resolve(appDir,readlinkSync(path))):undefined;}
function readJournal(){if(!existsSync(journal))return null;const s=lstatSync(journal);if(!s.isFile()||s.isSymbolicLink()||s.uid!==0||(s.mode&0o077)!==0||s.size>32768)throw Error('Ungültiges Installationsjournal.');const j=JSON.parse(readFileSync(journal,'utf8'));if(j.format!==1||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(j.id)||!['postgres','sqlite','fresh'].includes(j.kind)||!['staging','prepared','activating','database-committed','committed','rolledBack','forward-required'].includes(j.phase))throw Error('Ungültiges Installationsjournal.');within(releases,j.newRelease);within(appDir,j.newRuntime);if(j.oldRelease)within(releases,j.oldRelease);if(j.oldRuntime)within(appDir,j.oldRuntime);return j;}
const work=j=>join(stateDir,'installations',j.id),save=j=>writeUpdateState(journal,j);
function files(j,prefix){const root=work(j);if(existsSync(join(root,prefix+'.env'))){durableCopy(join(root,prefix+'.env'),configFile,0o600);}else if(prefix==='old'&&!j.hadConfig)rmSync(configFile,{force:true});if(existsSync(join(root,prefix+'.service')))durableCopy(join(root,prefix+'.service'),unit,0o644);else if(prefix==='old'&&!j.hadUnit)rmSync(unit,{force:true});}
function activateCode(j){files(j,'new');repairInstallBinding(configFile,{mode:options['--binding']??'auto'});link('current',j.newRelease);link('node',j.newRuntime);}
function restoreCode(j){files(j,'old');if(existsSync(configFile))repairInstallBinding(configFile,{mode:options['--binding']??'auto'});if(j.oldRelease)link('current',j.oldRelease);else if(existsSync(join(appDir,'current')))unlinkSync(join(appDir,'current'));if(j.oldRuntime)link('node',j.oldRuntime);}
async function health(j,legacy=false,previous=false){const env=parseEnv(readFileSync(configFile,'utf8'));let port=Number(env.PORT??3000);if(legacy)port=legacyListenerPort(env.DB_PATH??join(dataDir,'retouren.sqlite'),port);else{const db=await openDatabase(config);try{const exists=(await db.query("SELECT 1 FROM information_schema.tables WHERE table_schema='retourenboard' AND table_name='server_settings'")).rowCount;const row=exists?(await db.query('SELECT value FROM server_settings WHERE id=1')).rows[0]:null;if(row)port=Number(JSON.parse(row.value).port??port);}finally{await db.close();}}if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Ungültiger Dienstport.');const host=env.HOST&&env.HOST!=='0.0.0.0'&&env.HOST!=='::'?env.HOST:'127.0.0.1';const url='http://'+(host.includes(':')?'['+host+']':host)+':'+port+(legacy?'/api/session':'/health');for(let i=0;i<45;i++){try{const response=await fetch(url,{signal:AbortSignal.timeout(1500)}),body=await response.json();if(response.ok&&body.version===(legacy||previous?j.oldVersion:j.version)&&(legacy||body.ok&&body.databaseEngine==='postgresql'))return;}catch{}await new Promise(r=>setTimeout(r,700));}throw Error('Die Anwendung besteht die Startprüfung nicht. Dienstprotokoll: journalctl -u retourenboard.service -n 80 --no-pager');}
async function cutoverState(){const lease=await acquireRuntimeLease(config,'retourenboard');let db;try{db=await openDatabase(config);const activation=createActivation({database:db,dataDir});return await activation.recover();}finally{await db?.close();await lease.close();}}
async function coldRollback(j){
 if(j.phase==='rolledBack')return;
 await run('systemctl',['stop',service]).catch(()=>{});if(await cutoverState()==='committed')throw Error('PostgreSQL ist bereits freigegeben. Vorwärtswiederherstellung erforderlich.');
 if(j.snapshotComplete){const restored=join(dirname(dataDir),'.retourenboard-install-restore-'+j.id),failed=join(dirname(dataDir),'.retourenboard-install-failed-'+j.id);if(existsSync(restored))rmSync(restored,{recursive:true,force:true});copyPrivateTree(join(work(j),'data'),restored);own(restored);syncPrivateTree(restored);if(existsSync(dataDir)){if(existsSync(failed))rmSync(dataDir,{recursive:true,force:true});else renameSync(dataDir,failed);}renameSync(restored,dataDir);}
 restoreCode(j);await run('systemctl',['daemon-reload']);j.phase='rolledBack';save(j);if(j.oldRelease&&j.hadUnit){await run('systemctl',['enable',service]);await run('systemctl',['start',service]);await health(j,true);}j.phase='rolledBack';save(j);rmSync(join(dataDir,UPDATE_MARKER),{force:true});
}
async function forward(j){activateCode(j);own(dataDir);await run('systemctl',['daemon-reload']);await run('systemctl',['start',service]);await health(j);j.phase='committed';save(j);await run('systemctl',['enable',service]);rmSync(join(dataDir,UPDATE_MARKER),{force:true});}
async function recover(){const j=readJournal();if(!j)return false;
 if(['committed','rolledBack'].includes(j.phase)){
  if(!installerOwnsMaintenance(dataDir,stateDir))return false;
  repairInstallBinding(configFile,{mode:options['--binding']??'auto'});await run('systemctl',['daemon-reload']);await run('systemctl',['start',service]);await health(j,j.phase==='rolledBack'&&j.kind==='sqlite',j.phase==='rolledBack');await run('systemctl',['enable',service]);
  if(existsSync(join(stateDir,'transaction.json')))await createLinuxUpdate({uid,gid,databaseConfig:config}).recover();
  rmSync(join(dataDir,UPDATE_MARKER),{force:true});return true;
 }
 if(j.kind==='postgres'){const tx=join(stateDir,'transaction.json'),committed=existsSync(tx)&&JSON.parse(readFileSync(tx,'utf8')).phase==='committed';if(committed){activateCode(j);await run('systemctl',['daemon-reload']);await run('systemctl',['start',service]);await createLinuxUpdate({uid,gid,databaseConfig:config}).recover();j.phase='committed';save(j);await run('systemctl',['enable',service]);}
  else{restoreCode(j);await run('systemctl',['daemon-reload']);await createLinuxUpdate({uid,gid,databaseConfig:config}).recover();if(j.oldRelease){await run('systemctl',['start',service]);await health(j,false,true);}j.phase='rolledBack';save(j);await run('systemctl',['enable',service]);}}
 else if(j.kind==='fresh'||await cutoverState()==='committed')await forward(j);else await coldRollback(j);
 return true;
}

let active;
try{
 for(const path of [appDir,releases,dataDir])directory(path);mkdirSync(stateDir,{recursive:true,mode:0o700});directory(stateDir);if(lstatSync(stateDir).uid!==0||(lstatSync(stateDir).mode&0o077)!==0)throw Error('Privater Rootordner für Installation fehlt.');
 const previous=await preserveInstallCandidate({configFile,unitFile:unit,previousConfigFile:options['--previous-config'],previousUnitFile:options['--previous-unit'],recover});await run('systemctl',['daemon-reload']);await run('systemctl',['stop',service]).catch(error=>{if(existsSync(unit))throw error;});await cutoverState();own(dataDir);const id=randomUUID(),oldRelease=current('current'),oldRuntime=current('node'),newRelease=within(releases,options['--release']),newRuntime=within(appDir,options['--runtime']);directory(newRelease);directory(newRuntime);const env=parseEnv(readFileSync(configFile,'utf8')),source=env.DB_PATH??join(dataDir,'retouren.sqlite');
 const db=await openDatabase(config);let migrated=false;try{if((await db.query("SELECT 1 FROM information_schema.tables WHERE table_schema='retourenboard' AND table_name='activation_state'")).rowCount)migrated=!!(await db.query('SELECT writesReleased AS "writesReleased" FROM activation_state WHERE singleton=1')).rows[0]?.writesReleased;}finally{await db.close();}
 const kind=existsSync(source)&&!migrated?'sqlite':oldRelease?'postgres':'fresh',j={format:1,id,kind,phase:'staging',oldRelease,oldRuntime,newRelease,newRuntime,version,oldVersion:oldRelease?JSON.parse(readFileSync(existsSync(join(oldRelease,'dist/package.json'))?join(oldRelease,'dist/package.json'):join(oldRelease,'package.json'),'utf8')).version:undefined,hadConfig:!!previous.config,hadUnit:!!previous.unit,snapshotComplete:false};active=j;
 mkdirSync(work(j),{recursive:true,mode:0o700});copyFileSync(configFile,join(work(j),'new.env'));copyFileSync(options['--unit'],join(work(j),'new.service'));if(j.hadConfig)writeFileSync(join(work(j),'old.env'),previous.config,{mode:0o600});if(j.hadUnit)writeFileSync(join(work(j),'old.service'),previous.unit,{mode:0o600});syncPrivateTree(work(j));save(j);
 await run('systemctl',['stop',service]).catch(error=>{if(existsSync(unit))throw error;});await run('systemctl',['disable',service]).catch(error=>{if(existsSync(unit))throw error;});writeUpdateState(join(dataDir,UPDATE_MARKER),id);
 if(kind==='postgres'){
  const adapter=createLinuxUpdate({uid,gid,databaseConfig:config});try{await adapter.snapshot(id);const target=join(releases,'inapp-'+id);renameSync(newRelease,target);j.newRelease=target;save(j);files(j,'new');await run('systemctl',['daemon-reload']);link('node',newRuntime);await adapter.activate(id);j.phase='activating';save(j);await adapter.restart(version);await adapter.commit(id);j.phase='committed';save(j);adapter.unlock();await run('systemctl',['enable',service]);}catch(error){const tx=join(stateDir,'transaction.json');if(j.phase==='committed'||existsSync(tx)&&JSON.parse(readFileSync(tx,'utf8')).phase==='committed'){activateCode(j);j.phase='committed';save(j);throw error;}restoreCode(j);await run('systemctl',['daemon-reload']);await adapter.rollback();adapter.unlock();j.phase='rolledBack';save(j);await run('systemctl',['enable',service]);throw error;}
 }else{
  copyPrivateTree(dataDir,join(work(j),'data'));syncPrivateTree(work(j));j.snapshotComplete=true;j.phase='prepared';save(j);activateCode(j);await run('systemctl',['daemon-reload']);j.phase='activating';save(j);
  if(kind==='sqlite'){await migrationCommand(['--apply','--service-stopped','--confirm','--sqlite',source,'--source-data',dirname(source),'--data-dir',dataDir]);own(dataDir);j.phase='database-committed';save(j);}
  await run('systemctl',['start',service]);await health(j);j.phase='committed';save(j);await run('systemctl',['enable',service]);rmSync(join(dataDir,UPDATE_MARKER),{force:true});
 }
 console.log('PostgreSQL-Installation und Startprüfung abgeschlossen.');
}catch(error){
 try{if(active&&!['committed','rolledBack'].includes(active.phase)){if(active.kind==='postgres'){/* Adapter performs its own coordinated rollback. */}else if(active.kind==='fresh'||await cutoverState()==='committed'){active.phase='forward-required';save(active);console.error('PostgreSQL-Zustand bleibt erhalten. Installer erneut ausführen; bis zur erfolgreichen Startprüfung bleibt die Wartung aktiv.');}else await coldRollback(active);}}
 catch{console.error('Installation benötigt Wiederherstellung. Privates Installationsjournal bleibt erhalten; keine alte SQLite-Version starten.');}
 console.error(error.message);process.exitCode=1;
}
