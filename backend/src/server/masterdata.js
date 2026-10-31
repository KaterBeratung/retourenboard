import {InputError,MASTER_KINDS,PRODUCT_REFS,RETURN_REFS} from '../shared/model.js';
const requiredKinds=new Set(['reasons','conditions','statuses','resolutions']);
export const STANDARD_STATUSES=[{key:'statuses.received',name:'Eingegangen',tone:'received',isDefault:1,isClosed:0},{key:'statuses.working',name:'In Bearbeitung',tone:'working',isDefault:0,isClosed:0},{key:'statuses.completed',name:'Abgeschlossen',tone:'done',isDefault:0,isClosed:1}];
const nameKey=name=>name.trim().normalize('NFKC').toLocaleLowerCase('de-DE');
export function createMasterDataRepository(db){
 const normalize=r=>r?{...r,active:!!r.active,isDefault:!!r.isDefault,isClosed:!!r.isClosed}:null;
 const get=async id=>normalize((await db.query('SELECT * FROM masterdata WHERE id=$1',[id])).rows[0]);
 function checkKind(kind){if(!Object.hasOwn(MASTER_KINDS,kind))throw new InputError('Unbekannte Stammdatenliste.');}
 async function list(kind){checkKind(kind);return (await db.query('SELECT * FROM masterdata WHERE kind=$1 ORDER BY active DESC,lower(name),id',[kind])).rows.map(normalize);}
 async function transaction(job){try{return await db.transaction(job);}catch(error){if(error.code==='23505')throw new InputError('Dieser Name existiert in der Liste bereits.',409);throw error;}}
 function validate(kind,input){
  const result={name:'',code:'',notes:'',active:true,isDefault:false,isClosed:false,tone:'received'};
  for(const [key,max]of [['name',250],['code',100],['notes',2000]]){const value=input[key]??'';if(typeof value!=='string'||value.length>max)throw new InputError(`Ungültiger Wert für ${key}.`);result[key]=value.trim();}
  if(!result.name)throw new InputError('Name ist erforderlich.');
  for(const key of ['active','isDefault','isClosed']){const value=input[key]??(key==='active');if(typeof value!=='boolean')throw new InputError(`Ungültiger Wert für ${key}.`);result[key]=value;}
  result.isDefault=requiredKinds.has(kind)&&result.isDefault;result.isClosed=kind==='statuses'&&result.isClosed;
  const tone=input.tone??'received';if(typeof tone!=='string'||!['received','checking','working','done','neutral'].includes(tone))throw new InputError('Ungültige Statusfarbe.');result.tone=tone;
  if(!result.active&&result.isDefault)throw new InputError('Ein archivierter Wert kann kein Standard sein.');return result;
 }
 async function ensureDefault(kind){if(!requiredKinds.has(kind))return;const values=(await list(kind)).filter(x=>x.active);if(!values.length)throw new InputError('Mindestens ein aktiver Wert muss erhalten bleiben.');if(!values.some(x=>x.isDefault))await db.query('UPDATE masterdata SET isDefault=1 WHERE id=$1',[values[0].id]);}
 async function used(id){for(const [table,refs]of [['products',PRODUCT_REFS],['returns',RETURN_REFS]])for(const field of Object.keys(refs))if((await db.query(`SELECT id FROM ${table} WHERE ${field}Id=$1 LIMIT 1`,[id])).rows.length)return true;return false;}
 return {get,list,
  async all(){const rows=(await db.query('SELECT * FROM masterdata ORDER BY active DESC,lower(name),id')).rows.map(normalize);return Object.fromEntries(Object.keys(MASTER_KINDS).map(kind=>[kind,rows.filter(row=>row.kind===kind)]));},
  async create(kind,input){checkKind(kind);return transaction(async()=>{
   await db.query("SELECT pg_advisory_xact_lock(hashtextextended(current_schema() || ':masterdata',0))");
   const v=validate(kind,input),now=new Date().toISOString();if(v.isDefault)await db.query('UPDATE masterdata SET isDefault=0 WHERE kind=$1',[kind]);
   const r=await db.query('INSERT INTO masterdata(kind,name,nameKey,code,notes,active,isDefault,isClosed,tone,createdAt,updatedAt) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id',[kind,v.name,nameKey(v.name),v.code,v.notes,Number(v.active),Number(v.isDefault),Number(v.isClosed),v.tone,now,now]);
   await ensureDefault(kind);return get(r.rows[0].id);
  });},
  async update(id,input){return transaction(async()=>{
   await db.query("SELECT pg_advisory_xact_lock(hashtextextended(current_schema() || ':masterdata',0))");
   const old=await get(id);if(!old)throw new InputError('Stammdateneintrag nicht gefunden.',404);const v=validate(old.kind,{...old,...input});if(v.isDefault)await db.query('UPDATE masterdata SET isDefault=0 WHERE kind=$1',[old.kind]);
   await db.query('UPDATE masterdata SET name=$1,nameKey=$2,code=$3,notes=$4,active=$5,isDefault=$6,isClosed=$7,tone=$8,builtinKey=$9,updatedAt=$10 WHERE id=$11',[v.name,nameKey(v.name),v.code,v.notes,Number(v.active),Number(v.isDefault),Number(v.isClosed),v.tone,v.name===old.name?old.builtinKey:'',new Date().toISOString(),id]);await ensureDefault(old.kind);return get(id);
  });},
  async remove(id){return transaction(async()=>{
   await db.query("SELECT pg_advisory_xact_lock(hashtextextended(current_schema() || ':masterdata',0))");
   const old=await get(id);if(!old)throw new InputError('Stammdateneintrag nicht gefunden.',404);const archived=await used(id);if(archived)await db.query('UPDATE masterdata SET active=0,isDefault=0,updatedAt=$1 WHERE id=$2',[new Date().toISOString(),id]);else await db.query('DELETE FROM masterdata WHERE id=$1',[id]);await ensureDefault(old.kind);return {archived};
  });},
  // The standard set of three fixed statuses; every other status is archived (only possible while no return uses it).
  async useStandardStatuses(){return transaction(async()=>{
   await db.query("SELECT pg_advisory_xact_lock(hashtextextended(current_schema() || ':masterdata',0))");
   const rows=(await db.query("SELECT * FROM masterdata WHERE kind='statuses' ORDER BY id")).rows.map(normalize),standard=new Map();
   for(const spec of STANDARD_STATUSES){const row=rows.find(r=>r.builtinKey===spec.key)??rows.find(r=>nameKey(r.name)===nameKey(spec.name));if(row)standard.set(spec.key,row);}
   const keep=new Set([...standard.values()].map(r=>r.id)),others=rows.filter(r=>!keep.has(r.id)),blocked=[];
   for(const row of others){const n=Number((await db.query('SELECT COUNT(*) AS n FROM returns WHERE statusId=$1',[row.id])).rows[0].n);if(n)blocked.push(`${row.name} (${n})`);}
   if(blocked.length)throw new InputError(`Noch Retouren mit eigenen Status vorhanden: ${blocked.join(', ')}. Ändere sie zuerst auf Eingegangen, In Bearbeitung oder Abgeschlossen.`,409);
   const now=new Date().toISOString(),canonical=new Set(STANDARD_STATUSES.map(spec=>nameKey(spec.name)));
   for(const row of others){const name=canonical.has(nameKey(row.name))?`${row.name} (archiviert)`:row.name;await db.query('UPDATE masterdata SET name=$1,nameKey=$2,active=0,isDefault=0,updatedAt=$3 WHERE id=$4',[name,nameKey(name),now,row.id]);}
   for(const spec of STANDARD_STATUSES){
    const row=standard.get(spec.key);
    if(row)await db.query('UPDATE masterdata SET name=$1,nameKey=$2,builtinKey=$3,tone=$4,active=1,isDefault=$5,isClosed=$6,updatedAt=$7 WHERE id=$8',[spec.name,nameKey(spec.name),spec.key,spec.tone,spec.isDefault,spec.isClosed,now,row.id]);
    else await db.query('INSERT INTO masterdata(kind,name,nameKey,builtinKey,active,isDefault,isClosed,tone,createdAt,updatedAt) VALUES($8,$1,$2,$3,1,$4,$5,$6,$7,$7)',[spec.name,nameKey(spec.name),spec.key,spec.isDefault,spec.isClosed,spec.tone,now,'statuses']);
   }
   return list('statuses');
  });},
  async resolve(kind,value,existingId=null,required=false,allowArchived=false){
   checkKind(kind);if(value===undefined&&required)return (await list(kind)).find(x=>x.active&&x.isDefault);if(value===null||value===''||value===undefined){if(required)throw new InputError('Bitte einen Wert auswählen.');return null;}
   let item;if(typeof value==='number'&&Number.isSafeInteger(value)&&value>0)item=await get(value);else if(typeof value==='string')item=normalize((await db.query('SELECT * FROM masterdata WHERE kind=$1 AND nameKey=$2',[kind,nameKey(value)])).rows[0]);
   if(!item||item.kind!==kind)throw new InputError(`${MASTER_KINDS[kind]}: Wert ist unbekannt. Bitte zuerst im Adminbereich anlegen.`);if(!item.active&&item.id!==existingId&&!allowArchived)throw new InputError('Archivierte Werte können nicht neu zugeordnet werden.');return item;
  }
 };
}
