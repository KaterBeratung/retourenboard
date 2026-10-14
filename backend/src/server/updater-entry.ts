import {createServer} from 'node:http';
import {readFileSync,existsSync,lstatSync,chownSync,chmodSync,unlinkSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {createLinuxUpdate,UPDATE_SOCKET,writeUpdateState} from './update-linux.js';
import {createUpdateWorker,updateBusy,type UpdateJob} from './update-worker.js';
import {downloadUpdate} from './update-download.js';
import {createLinuxServiceControl} from './service-control.js';
import {createServiceControlHandler} from './service-control-routes.js';

if(process.platform!=='linux'||process.getuid?.()!==0)throw Error('Der Updaterdienst benötigt Linux und den installierten Systemdienst.');
process.umask(0o077);
const stateDir='/var/lib/retourenboard-updater',stateFile=join(stateDir,'status.json');
const uid=Number(execFileSync('id',['-u','retourenverwaltung'],{encoding:'utf8'}).trim()),gid=Number(execFileSync('id',['-g','retourenverwaltung'],{encoding:'utf8'}).trim());
const config=readFileSync('/etc/retourenverwaltung.env','utf8');if(!/^DB_PATH=\/var\/lib\/retourenverwaltung\/retouren\.sqlite\s*$/m.test(config))throw Error('Der Updater unterstützt nur die Datenpfade der verwalteten Linuxinstallation.');
const service=readFileSync('/etc/systemd/system/retourenboard.service','utf8');if(!/^ExecStart=\/opt\/retourenverwaltung\/node\/bin\/node dist\/server\/index\.js\s*$/m.test(service))throw Error('Die Diensteinheit passt nicht zur verwalteten Linuxinstallation.');
mkdirSync(stateDir,{recursive:true,mode:0o700});const stateInfo=lstatSync(stateDir);if(!stateInfo.isDirectory()||stateInfo.isSymbolicLink()||stateInfo.uid!==0||(stateInfo.mode&0o077)!==0)throw Error('Der Updaterstatus muss in einem privaten Rootordner liegen.');
const adapter=createLinuxUpdate({uid,gid}),previous:UpdateJob=existsSync(stateFile)?JSON.parse(readFileSync(stateFile,'utf8')):{state:'idle'};
const recovered=await adapter.recover();if(updateBusy(previous.state)||recovered||previous.recoveryRequired)writeUpdateState(stateFile,{...previous,recoveryRequired:false,state:recovered?.phase==='committed'?'complete':'failed',finishedAt:new Date().toISOString(),message:recovered?.phase==='committed'?'Update erfolgreich installiert.':'Unterbrochener Updateauftrag beendet. Die bisherige Installation ist wieder erreichbar.',rolledBack:!!recovered&&recovered.phase!=='committed'});
const worker=createUpdateWorker({adapter,initialState:existsSync(stateFile)?JSON.parse(readFileSync(stateFile,'utf8')):{state:'idle'},saveState:value=>writeUpdateState(stateFile,value),download:(version,id)=>downloadUpdate(version,join(stateDir,'downloads',id))});
const serviceControl=createLinuxServiceControl({updateStatus:()=>worker.status(),checkHealth:()=>adapter.checkHealthy()});
const socketDir='/run/retourenboard-updater';mkdirSync(socketDir,{recursive:true,mode:0o750});chownSync(socketDir,0,gid);chmodSync(socketDir,0o750);
if(existsSync(UPDATE_SOCKET)){if(!lstatSync(UPDATE_SOCKET).isSocket())throw Error('Ungültiger Updater-Socket.');unlinkSync(UPDATE_SOCKET);}
const server=createServer(createServiceControlHandler({worker,serviceControl}));
server.requestTimeout=10000;server.headersTimeout=5000;server.listen(UPDATE_SOCKET,()=>{chownSync(UPDATE_SOCKET,0,gid);chmodSync(UPDATE_SOCKET,0o660);console.log('retourenboard. Updaterdienst bereit.');});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
