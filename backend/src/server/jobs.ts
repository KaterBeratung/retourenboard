import type {BackupSettings,Clock} from '../shared/types.js';
import {calendarDate} from './return-rules.js';
function occurrence(date:string,schedule:BackupSettings):number|null{
  const center=Date.parse(date+'T12:00:00Z'),formatter=new Intl.DateTimeFormat('en-GB',{timeZone:schedule.timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  for(let time=center-30*3600000;time<=center+30*3600000;time+=60000){if(calendarDate(time,schedule.timezone)===date&&formatter.format(time)>=schedule.time)return time;}return null;
}
function dateOffset(date:string,offset:number){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10);}
export function nextBackupAt(schedule:BackupSettings,clock:Clock):number|null{
  if(!schedule.enabled)return null;const time=clock.now(),today=calendarDate(time,schedule.timezone);
  for(let day=0;day<=8;day++){const date=dateOffset(today,day);if(schedule.frequency==='weekly'&&new Date(date+'T12:00:00Z').getUTCDay()!==schedule.weekday)continue;const candidate=occurrence(date,schedule);if(candidate!==null&&candidate>time)return candidate;}return null;
}
export function createJobs({store,preferences,backups,coordinator,clock,onTick=async()=>{}}:{store:any,preferences:any,backups:any,coordinator:any,clock:Clock,onTick?:()=>Promise<void>}){
  let closed=false,pending:Promise<void>|null=null;
  async function run(){
    if(store.db.prepare('SELECT COUNT(*) AS n FROM users WHERE active=1').get().n===0)return;
    const schedule=preferences.get('backups') as BackupSettings;
    if(schedule.enabled){const today=calendarDate(clock.now(),schedule.timezone);let slot:number|null=null;for(let offset=0;offset>=-7;offset--){const date=dateOffset(today,offset);if(schedule.frequency==='weekly'&&new Date(date+'T12:00:00Z').getUTCDay()!==schedule.weekday)continue;const candidate=occurrence(date,schedule);if(candidate!==null&&candidate<=clock.now()){slot=candidate;break;}}
      if(slot!==null){const key=String(slot),last=store.db.prepare("SELECT value FROM app_preferences WHERE section='backupSlot'").get();if(!last||last.value!==key){try{await backups.create({id:null,name:'Automatische Sicherung',source:'system'},'auto',()=>{},key);await coordinator.run(()=>store.db.prepare("INSERT INTO app_preferences(section,value) VALUES('backupSlot',?) ON CONFLICT(section) DO UPDATE SET value=excluded.value").run(key));}catch{}}}
    }
    await onTick();
  }
  const tick=()=>{if(closed)return Promise.resolve();if(!pending)pending=run().catch(()=>{}).finally(()=>pending=null);return pending;};
  const timer=setInterval(()=>void tick(),60000);timer.unref();
  return {tick,status:()=>({nextBackupAt:nextBackupAt(preferences.get('backups'),clock),running:!!pending}),async close(){closed=true;clearInterval(timer);await pending;}};
}
