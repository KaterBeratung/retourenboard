import type {DatabaseSync} from 'node:sqlite';
import type {PreferenceSections} from '../shared/types.js';
import {InputError} from '../shared/model.js';
const defaults:PreferenceSections={
  rules:{requiredFields:[],deadlineDays:14,numberPrefix:'RET',timezone:'Europe/Berlin'},
  backups:{enabled:true,frequency:'daily',time:'02:00',weekday:0,timezone:'Europe/Berlin',retain:7},
  notifications:{inApp:true,newReturn:true,overdue:true,backupError:true,emailEnabled:false,smtpHost:'',smtpPort:587,smtpMode:'starttls',smtpUser:'',from:'',recipients:[],eventTypes:['newReturn','overdue','backupError']}
};
function fail():never{throw new InputError('Ungültige Einstellung. Bitte Werte und Grenzen prüfen.');}
const integer=(value:unknown,min:number,max:number)=>typeof value==='number'&&Number.isInteger(value)&&value>=min&&value<=max;
function timezone(value:unknown):boolean{try{if(typeof value!=='string'||value.length>100)return false;new Intl.DateTimeFormat('de-DE',{timeZone:value});return true;}catch{return false;}}
const email=(value:unknown)=>typeof value==='string'&&value.length<=254&&/^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(value);

export function createPreferences(db:DatabaseSync){
  function get<K extends keyof PreferenceSections>(section:K):PreferenceSections[K]{
    const row=db.prepare('SELECT value FROM app_preferences WHERE section=?').get(section);
    return structuredClone({...defaults[section],...(row?JSON.parse(String(row.value)): {})});
  }
  function update<K extends keyof PreferenceSections>(section:K,input:unknown):PreferenceSections[K]{
    if(!input||typeof input!=='object'||Array.isArray(input))fail();
    const patch=input as Record<string,unknown>;
    for(const key of Object.keys(patch))if(!Object.hasOwn(defaults[section],key))throw new InputError('Unbekannte Einstellung.');
    const value={...get(section),...patch} as PreferenceSections[K];
    const v=value as unknown as Record<string,unknown>;
    for(const [key,old]of Object.entries(defaults[section])){
      if(typeof old==='boolean'&&typeof v[key]!=='boolean')fail();
      if(typeof old==='string'&&(typeof v[key]!=='string'||String(v[key]).length>300||/[\x00-\x1f]/.test(String(v[key]))))fail();
    }
    if(section==='rules'){
      if(!integer(v.deadlineDays,0,365)||!timezone(v.timezone)||!(/^[A-Z0-9_-]{1,16}$/.test(String(v.numberPrefix))))fail();
      if(!Array.isArray(v.requiredFields)||v.requiredFields.some(x=>!['serialNumber','orderNumber','supplier','notes'].includes(x))||new Set(v.requiredFields).size!==v.requiredFields.length)fail();
    }
    if(section==='backups'){
      if(!['daily','weekly'].includes(String(v.frequency))||!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v.time))||!integer(v.weekday,0,6)||!integer(v.retain,1,90)||!timezone(v.timezone))fail();
    }
    if(section==='notifications'){
      if(!integer(v.smtpPort,1,65535)||!['tls','starttls'].includes(String(v.smtpMode))||!/^([a-z0-9.-]*|\[[a-f0-9:]+\])$/i.test(String(v.smtpHost))||String(v.smtpUser).length>250)fail();
      if(!Array.isArray(v.recipients)||v.recipients.length>10||!v.recipients.every(email)||!Array.isArray(v.eventTypes)||v.eventTypes.some(x=>!['newReturn','overdue','backupError'].includes(x)))fail();
      if(v.emailEnabled&&(!v.smtpHost||!email(v.from)||v.recipients.length===0))fail();
      if(v.from!==''&&!email(v.from))fail();
    }
    db.prepare('INSERT INTO app_preferences(section,value) VALUES(?,?) ON CONFLICT(section) DO UPDATE SET value=excluded.value').run(section,JSON.stringify(value));
    return get(section);
  }
  return {get,update};
}
