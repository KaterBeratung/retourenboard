import type {DatabaseSync} from 'node:sqlite';
import {InputError,PRODUCT_COLUMNS,RETURN_IMPORT_COLUMNS as RETURN_COLUMNS} from '../shared/model.js';
export type CsvProfile={id:number,revision:number,name:string,kind:'products'|'returns',delimiter:'auto'|';'|','|'\t',mapping:Record<string,string>,duplicates:'error'|'skip'|'update'};
export function resolveProfile(profile:CsvProfile,headers:string[]){
  if(new Set(headers).size!==headers.length)throw new InputError('CSV-Überschriften sind nicht eindeutig.');
  return Object.fromEntries(Object.entries(profile.mapping).map(([field,header])=>{const index=headers.indexOf(header);if(index<0)throw new InputError(`Profilspalte „${header}“ fehlt in der CSV-Datei.`);return [field,index];}));
}
export function createCsvProfiles(db:DatabaseSync){
  const display=(row:any):CsvProfile=>({...JSON.parse(row.value),id:row.id,revision:row.revision,name:row.name,kind:row.kind});
  function get(id:number){const row=db.prepare('SELECT * FROM csv_profiles WHERE id=?').get(id);if(!row)throw new InputError('CSV-Profil nicht gefunden.',404);return display(row);}
  function save(input:any,id?:number){
    if(Object.keys(input).some(k=>!['name','kind','delimiter','mapping','duplicates','id','revision'].includes(k))||typeof input.name!=='string'||!input.name.trim()||input.name.length>100||!['products','returns'].includes(input.kind)||!['auto',';',',','\t'].includes(input.delimiter)||!['error','skip','update'].includes(input.duplicates))throw new InputError('Ungültiges CSV-Profil.');
    const columns=input.kind==='products'?PRODUCT_COLUMNS:RETURN_COLUMNS,map=input.mapping;
    if(!map||typeof map!=='object'||Array.isArray(map)||Object.keys(map).length>50||Object.entries(map).some(([k,v])=>!Object.hasOwn(columns,k)||typeof v!=='string'||!v.trim()||v.length>250)||new Set(Object.values(map)).size!==Object.keys(map).length)throw new InputError('Profil benötigt eindeutige Spaltennamen.');
    const required=input.duplicates==='update'?['sku']:input.kind==='products'?['sku','name']:['sku','serialNumber'];if(required.some(k=>!map[k]))throw new InputError('Pflichtspalten fehlen im Profil.');
    const value=JSON.stringify({delimiter:input.delimiter,mapping:map,duplicates:input.duplicates}),date=new Date().toISOString();
    if(id){get(id);db.prepare('UPDATE csv_profiles SET name=?,kind=?,revision=revision+1,value=?,updatedAt=? WHERE id=?').run(input.name.trim(),input.kind,value,date,id);}else{id=Number(db.prepare('INSERT INTO csv_profiles(name,kind,value,createdAt,updatedAt) VALUES(?,?,?,?,?)').run(input.name.trim(),input.kind,value,date,date).lastInsertRowid);}return get(id);
  }
  return {get,save,list:()=>db.prepare('SELECT * FROM csv_profiles ORDER BY name,id LIMIT 100').all().map(display),remove(id:number){get(id);db.prepare('DELETE FROM csv_profiles WHERE id=?').run(id);return {deleted:true};}};
}
