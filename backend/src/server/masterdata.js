import {InputError,MASTER_KINDS,PRODUCT_REFS,RETURN_REFS} from '../shared/model.js';
const requiredKinds=new Set(['reasons','conditions','statuses','resolutions']);
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
  async resolve(kind,value,existingId=null,required=false,allowArchived=false){
   checkKind(kind);if(value===undefined&&required)return (await list(kind)).find(x=>x.active&&x.isDefault);if(value===null||value===''||value===undefined){if(required)throw new InputError('Bitte einen Wert auswählen.');return null;}
   let item;if(typeof value==='number'&&Number.isSafeInteger(value)&&value>0)item=await get(value);else if(typeof value==='string')item=normalize((await db.query('SELECT * FROM masterdata WHERE kind=$1 AND nameKey=$2',[kind,nameKey(value)])).rows[0]);
   if(!item||item.kind!==kind)throw new InputError(`${MASTER_KINDS[kind]}: Wert ist unbekannt. Bitte zuerst im Adminbereich anlegen.`);if(!item.active&&item.id!==existingId&&!allowArchived)throw new InputError('Archivierte Werte können nicht neu zugeordnet werden.');return item;
  }
 };
}
