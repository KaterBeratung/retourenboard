import {TABLE_CONTRACTS} from './schema.js';
import type {SqlDatabase,SqlValue} from './types.js';
import {syncReturnSerialSearch} from './serial-search.js';
import {checkRecordRevision,advanceRecordRevision,ensureRecordMetadata} from './record-metadata.js';
export async function writeInventoryRow(db:SqlDatabase,table:'products'|'returns',data:Record<string,unknown>,id?:number,options:Parameters<typeof ensureRecordMetadata>[3]={}):Promise<number>{
 const contract=TABLE_CONTRACTS.find(t=>t.name===table);if(!contract)throw new Error('Unzulässige Bestandstabelle.');
 const keys=Object.keys(data);if(!keys.length||keys.some(key=>!contract.columns.some(column=>column.name===key)))throw new Error('Unzulässiges Bestandsfeld.');
 const values=Object.values(data);if(values.some(value=>value!==null&&typeof value!=='string'&&typeof value!=='boolean'&&!(typeof value==='number'&&Number.isSafeInteger(value))&&!Buffer.isBuffer(value)))throw new Error('Ungültiger Bestandswert.');
 return db.transaction(async()=>{
  const existing=Boolean(id);if(id)await checkRecordRevision(db,table,id);
  if(id){if(!Number.isSafeInteger(id)||id<1)throw new Error('Ungültige Bestands-ID.');await db.query(`UPDATE ${table} SET ${keys.map((key,i)=>key+'=$'+(i+1)).join(',')} WHERE id=$${keys.length+1}`,[...values as SqlValue[],id]);}
  else id=(await db.query<{id:number}>(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING id`,values as SqlValue[])).rows[0].id;
  if(table==='returns')await syncReturnSerialSearch(db,id!);
  if(existing)await advanceRecordRevision(db,table,id!);else await ensureRecordMetadata(db,table,id!,options);
  return id!;
 });
}
