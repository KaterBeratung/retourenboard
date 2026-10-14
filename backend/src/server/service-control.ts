import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {boundedEntries,redactLog,type LogEntry} from './server-log.js';
import {updateBusy} from './update-worker.js';
const run=promisify(execFile);
// This privileged adapter only ever addresses the installed application unit.
// No command, path, unit, time range or journal argument comes from the client.
export function createLinuxServiceControl({execute=run,updateStatus,checkHealth=async()=>{},now=Date.now}:{execute?:any;updateStatus:()=>any;checkHealth?:()=>Promise<void>;now?:()=>number}){
 let state:any={state:'idle'},pending:Promise<void>|null=null;
 function status(){if(state.state==='prepared'&&state.expiresAt<=now())state={state:'idle'};return {available:true,mode:'service',...state};}
 function allowed(){const update=updateStatus();if(updateBusy(update.state)||update.recoveryRequired)throw Error('Ein Update läuft oder benötigt Wiederherstellung.');}
 return {status,
  async logs(){
   const {stdout}=await execute('journalctl',['--unit=retourenboard.service','--lines=200','--output=json','--no-pager'],{timeout:5000,maxBuffer:512*1024,encoding:'utf8'});
   const entries:LogEntry[]=[];
   for(const line of String(stdout).split('\n').slice(-202)){if(!line.trim())continue;try{const value=JSON.parse(line),ms=Number(value.__REALTIME_TIMESTAMP)/1000;if(!Number.isFinite(ms)||ms<0||ms>8640000000000000)continue;const priority=Number(value.PRIORITY);entries.push({id:String(value.__CURSOR??entries.length).slice(0,250),time:new Date(ms).toISOString(),level:priority<=3?'error':priority===4?'warn':'info',message:redactLog(typeof value.MESSAGE==='string'?value.MESSAGE:'[Binärer Protokolleintrag]')});}catch{}}
   return {source:'journal',entries:boundedEntries(entries),checkedAt:new Date(now()).toISOString(),message:'Die letzten 200 Einträge des Dienstes retourenboard.service.'};
  },
  prepareRestart(){allowed();if(['prepared','restarting'].includes(status().state)||pending)throw Error('Ein Neustart läuft bereits.');state={id:randomUUID(),state:'prepared',expiresAt:now()+15000};return status();},
  cancelRestart(id:string){if(state.state==='prepared'&&state.id===id)state={state:'idle'};},
  commitRestart(id:string){allowed();if(status().state!=='prepared'||state.id!==id)throw Error('Ungültiger oder abgelaufener Neustartauftrag.');state={id,state:'restarting',startedAt:new Date(now()).toISOString()};
   pending=(async()=>{try{await execute('systemctl',['restart','retourenboard.service'],{timeout:45000,maxBuffer:32768});await execute('systemctl',['is-active','--quiet','retourenboard.service'],{timeout:5000,maxBuffer:32768});await checkHealth();state={...state,state:'complete',finishedAt:new Date(now()).toISOString(),message:'Dienstneustart abgeschlossen.'};}catch{state={...state,state:'failed',finishedAt:new Date(now()).toISOString(),message:'Dienstneustart fehlgeschlagen. Dienstprotokoll prüfen.'};throw Error(state.message);}})();
   return pending.finally(()=>{pending=null;});
  }
 };
}
