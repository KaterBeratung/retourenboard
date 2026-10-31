import {BUILTIN_MASTERDATA} from '../shared/model.js';
// Two status models: the standard of three fixed statuses (Eingegangen, In Bearbeitung, Abgeschlossen) and own statuses that an administrator can create, rename and archive.
// The choice is made once per installation, when the setting does not exist yet:
// - a new installation, or one that never changed its statuses, gets the standard (a fourth built-in status that no return uses is archived);
// - an installation with own, renamed or archived statuses, or with returns in the former fourth status, keeps working exactly as before.
export async function ensureStatusMode({db,preferences,masters,initial}:{db:any;preferences:any;masters:any;initial?:boolean}):Promise<boolean>{
 const row=(await db.query("SELECT value FROM app_preferences WHERE section='rules'",[])).rows[0],stored=row?JSON.parse(String(row.value)):{};
 if(typeof stored.customStatuses==='boolean')return stored.customStatuses;
 let custom=initial??await hasCustomisedStatuses(db);
 if(!custom)try{await masters.useStandardStatuses();}catch{custom=true;}
 await preferences.update('rules',{customStatuses:custom});
 return custom;
}
async function hasCustomisedStatuses(db:any):Promise<boolean>{
 const rows:any[]=(await db.query("SELECT name,builtinKey,active,isClosed FROM masterdata WHERE kind='statuses'",[])).rows;
 const keys=new Set(BUILTIN_MASTERDATA.filter(item=>item.kind==='statuses').map(item=>item.key)),standard=['statuses.received','statuses.working','statuses.completed'];
 if(rows.some(item=>!keys.has(item.builtinKey)))return true;
 if(standard.some(key=>!rows.some(item=>item.builtinKey===key&&Number(item.active)===1)))return true;
 return rows.some(item=>(item.builtinKey==='statuses.completed')!==(Number(item.isClosed)===1));
}
