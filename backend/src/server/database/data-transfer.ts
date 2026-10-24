import {createHash} from 'node:crypto';

import {openSync,writeSync,closeSync,createReadStream} from 'node:fs';

import {TABLE_CONTRACTS,BASELINE_TABLE_CONTRACTS,SCHEMA2_TABLE_CONTRACTS,SCHEMA3_TABLE_CONTRACTS,type TableContract} from './schema.js';
import {backfillRecordMetadata} from './record-metadata.js';

import {migratePostgres,resetIdentitySequences} from './migrations.js';

import type {SqlDatabase,SqlValue} from './types.js';
import {rebuildReturnSerialSearch} from './serial-search.js';



export type TableDigest={name:string;count:number;sha256:string};

export const MAX_RECORD_BYTES=24*1024*1024;

export function encodedRow(table:TableContract,row:Record<string,any>){return table.columns.map(c=>{const value=Object.hasOwn(row,c.name)?row[c.name]:row[c.sqlName];if(value===null&&c.nullable)return null;if(c.kind==='binary'){if(!Buffer.isBuffer(value)&&!(value instanceof Uint8Array))throw Error('Ungültige Binärdaten: '+table.name);return {base64:Buffer.from(value).toString('base64')};}if(c.kind==='integer'){if(!Number.isSafeInteger(value))throw Error('Ungültiger Ganzzahlwert: '+table.name);return value;}if(typeof value!=='string'||value.includes('\0'))throw Error('Ungültiger Textwert: '+table.name);return value;});}

export function decodedRow(table:TableContract,values:unknown[]):SqlValue[]{if(!Array.isArray(values)||values.length!==table.columns.length)throw Error('Abweichender Datensatz.');return values.map((value:any,i)=>{const c=table.columns[i];if(value===null&&c.nullable)return null;if(c.kind==='binary'){if(!value||Object.keys(value).length!==1||typeof value.base64!=='string'||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.base64))throw Error('Ungültige Bilddaten.');return Buffer.from(value.base64,'base64');}if(c.kind==='integer'&&Number.isSafeInteger(value))return value;if(c.kind==='text'&&typeof value==='string'&&!value.includes('\0'))return value;throw Error('Ungültiger Feldtyp.');});}

export const orderBy=(t:TableContract)=>t.columns.filter(c=>c.primary).sort((a,b)=>a.primary-b.primary).map(c=>c.sqlName+(c.kind==='text'?' COLLATE "C"':'')).join(',');

export function hashRows(table:TableContract,rows:Iterable<Record<string,any>>){const hash=createHash('sha256');let count=0;for(const row of rows){hash.update(JSON.stringify(encodedRow(table,row))+'\n');count++;}return {name:table.name,count,sha256:hash.digest('hex')};}

export async function postgresDigests(db:SqlDatabase){const result:TableDigest[]=[];for(const t of TABLE_CONTRACTS){const hash=createHash('sha256');let count=0;await db.query('DECLARE rb_transfer NO SCROLL CURSOR FOR SELECT * FROM '+t.name+' ORDER BY '+orderBy(t));try{for(;;){const rows=(await db.query('FETCH FORWARD 20 FROM rb_transfer')).rows;if(!rows.length)break;for(const row of rows){hash.update(JSON.stringify(encodedRow(t,row))+'\n');count++;}}}finally{await db.query('CLOSE rb_transfer');}result.push({name:t.name,count,sha256:hash.digest('hex')});}return result;}

export async function insertRows(db:SqlDatabase,t:TableContract,rows:Iterable<Record<string,any>>){for(const row of rows){const values=decodedRow(t,encodedRow(t,row));await db.query('INSERT INTO '+t.name+'('+t.columns.map(c=>c.sqlName).join(',')+') VALUES('+values.map((_,i)=>'$'+(i+1)).join(',')+')',values);}}

export async function exportData(db:SqlDatabase,path:string){const fd=openSync(path,'wx',0o600);const write=(value:unknown)=>{const line=JSON.stringify(value)+'\n';if(Buffer.byteLength(line)>MAX_RECORD_BYTES)throw Error('Sicherungsdatensatz ist zu groß.');writeSync(fd,line);};let tables:TableDigest[]=[];try{await db.transaction(async()=>{await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');const sequences:Record<string,number>={};for(const t of TABLE_CONTRACTS)if(t.identity){const result=(await db.query('SELECT last_value,is_called FROM '+t.name+'_'+t.identity.toLowerCase()+'_seq')).rows[0];sequences[t.name]=result.is_called?result.last_value:0;}write({format:2,schema:4,sequences});for(const t of TABLE_CONTRACTS){const hash=createHash('sha256');let count=0;await db.query('DECLARE rb_export NO SCROLL CURSOR FOR SELECT * FROM '+t.name+' ORDER BY '+orderBy(t));try{for(;;){const rows=(await db.query('FETCH FORWARD 20 FROM rb_export')).rows;if(!rows.length)break;for(const row of rows){const values=encodedRow(t,row);hash.update(JSON.stringify(values)+'\n');write({table:t.name,values});count++;}}}finally{await db.query('CLOSE rb_export');}tables.push({name:t.name,count,sha256:hash.digest('hex')});}write({end:true,tables});});}finally{closeSync(fd);}return tables;}

// Bound each line before decoding JSON, including malicious input without newlines.

export async function* boundedLines(path:string){let pending=Buffer.alloc(0);for await(const chunk of createReadStream(path,{highWaterMark:64*1024})){pending=Buffer.concat([pending,chunk]);let end;while((end=pending.indexOf(10))>=0){if(end>MAX_RECORD_BYTES)throw Error('Sicherungsdatensatz ist zu groß.');yield pending.subarray(0,end).toString('utf8');pending=pending.subarray(end+1);}if(pending.length>MAX_RECORD_BYTES)throw Error('Sicherungsdatensatz ist zu groß.');}if(pending.length)throw Error('Unvollständige Sicherung.');}

export async function importData(db:SqlDatabase,path:string){
 let header:any,footer:any,index=0,source:readonly TableContract[]=[],digests:{name:string;count:number;hash:ReturnType<typeof createHash>}[]=[];
 await db.transaction(async()=>{
  if((await db.query('SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema()')).rows.length)throw Error('Zieldatenbank muss leer sein.');
  await migratePostgres(db,{seedDefaults:false});
  for await(const line of boundedLines(path)){
   const record=JSON.parse(line);
   if(!header){header=record;source=header.schema===1?BASELINE_TABLE_CONTRACTS:header.schema===2?SCHEMA2_TABLE_CONTRACTS:header.schema===3?SCHEMA3_TABLE_CONTRACTS:TABLE_CONTRACTS;
    if(header.format!==2||![1,2,3,4].includes(header.schema)||!header.sequences||typeof header.sequences!=='object'||Array.isArray(header.sequences)||Object.keys(header.sequences).sort().join(',')!==source.filter(t=>t.identity).map(t=>t.name).sort().join(',')||Object.keys(header).sort().join(',')!=='format,schema,sequences')throw Error('Ungültiges Datenformat.');
    digests=source.map(t=>({name:t.name,count:0,hash:createHash('sha256')}));continue;
   }
   if(footer)throw Error('Daten nach Sicherungsende.');
   if(record.end===true){if(Object.keys(record).sort().join(',')!=='end,tables')throw Error('Ungültiger Abschlussdatensatz.');footer=record;continue;}
   while(index<source.length&&source[index].name!==record.table)index++;
   const t=source[index];if(!t||Object.keys(record).sort().join(',')!=='table,values')throw Error('Unbekannte Tabelle oder Tabellenreihenfolge.');
   const values=decodedRow(t,record.values);await db.query('INSERT INTO '+t.name+'('+t.columns.map(c=>c.sqlName).join(',')+') VALUES('+values.map((_,i)=>'$'+(i+1)).join(',')+')',values);
   digests[index].count++;digests[index].hash.update(JSON.stringify(record.values)+'\n');
  }
  const expected=digests.map(({name,count,hash})=>({name,count,sha256:hash.digest('hex')}));
  if(!header||!footer||JSON.stringify(footer.tables)!==JSON.stringify(expected))throw Error('Sicherungsprüfsummen stimmen nicht.');
  for(const [name,value]of Object.entries(header.sequences))if(!source.some(t=>t.name===name&&t.identity)||!Number.isSafeInteger(value)||Number(value)<0)throw Error('Ungültiger Sequenzstand.');
  await resetIdentitySequences(db,header.sequences);
  await rebuildReturnSerialSearch(db);
  if(header.schema<3)await backfillRecordMetadata(db);
  const actual=(await postgresDigests(db)).filter(t=>source.some(s=>s.name===t.name));if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('Datenprüfung fehlgeschlagen.');
 });return footer.tables as TableDigest[];
}
