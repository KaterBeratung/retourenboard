import {DISPOSAL_TABLES,DISPOSAL_INDEXES} from './disposal-schema.js';
import {createHash} from 'node:crypto';
import {BUILTIN_MASTERDATA} from '../../shared/model.js';
import {TABLE_CONTRACTS,BASELINE_TABLE_CONTRACTS,INDEX_STATEMENTS} from './schema.js';
import type {SqlDatabase} from './types.js';
import {RETURN_SEARCH_MIGRATION,rebuildReturnSerialSearch} from './serial-search.js';
import {RECORD_METADATA_TABLES,backfillRecordMetadata} from './record-metadata.js';
import {SSO_TABLES} from './sso-schema.js';
export const POSTGRES_SCHEMA_VERSION=5;
const statements=[...BASELINE_TABLE_CONTRACTS.map(t=>t.createSql),...INDEX_STATEMENTS];
const checksum=createHash('sha256').update(JSON.stringify(statements)).digest('hex');
const additions=[...DISPOSAL_TABLES.map(t=>t.createSql),...DISPOSAL_INDEXES],additionChecksum=createHash('sha256').update(JSON.stringify(additions)).digest('hex');
const searchChecksum=createHash('sha256').update(JSON.stringify(RETURN_SEARCH_MIGRATION)).digest('hex');
const metadataStatements=RECORD_METADATA_TABLES.map(t=>t.createSql),metadataChecksum=createHash('sha256').update(JSON.stringify(metadataStatements)).digest('hex');
const ssoStatements=SSO_TABLES.map(t=>t.createSql),ssoChecksum=createHash('sha256').update(JSON.stringify(ssoStatements)).digest('hex');
export async function resetIdentitySequences(db:SqlDatabase,highWater:Record<string,number>={}){
 for(const table of TABLE_CONTRACTS){if(!table.identity)continue;const column=table.identity.toLowerCase(),max=(await db.query<{n:number}>('SELECT COALESCE(MAX('+column+'),0) AS n FROM '+table.name)).rows[0].n,value=Math.max(max,highWater[table.sourceName]??highWater[table.name]??0);if(!Number.isSafeInteger(value)||value<0)throw new Error('Ungültiger Identitätssequenzstand.');await db.query('SELECT setval(pg_get_serial_sequence($1,$2),$3,$4)',[db.schema+'.'+table.name,column,Math.max(value,1),value>0]);}
}
export async function migratePostgres(db:SqlDatabase,{seedDefaults=true}:{seedDefaults?:boolean}={}){
 await db.transaction(async()=>{
  // Serialize slow initial bootstraps within the bounded query deadline.
  await db.query("SET LOCAL lock_timeout='30s'");
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[db.schema+':schema']);
  await db.query("SET LOCAL lock_timeout='5s'");
  await db.query('CREATE SCHEMA IF NOT EXISTS "'+db.schema+'"');
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY,name TEXT NOT NULL,checksum TEXT NOT NULL,appliedAt TEXT NOT NULL)');
  const applied=(await db.query<{version:number;checksum:string}>('SELECT version,checksum FROM schema_migrations ORDER BY version')).rows;
  if(applied.some((row,i)=>row.version!==i+1||row.checksum!==({1:checksum,2:additionChecksum,3:searchChecksum,4:metadataChecksum,5:ssoChecksum} as Record<number,string>)[row.version]))throw new Error('Unbekannter oder abweichender PostgreSQL-Schemastand. Anwendung und Datenbankversion prüfen.');
  if(!applied.length){
  if((await db.query("SELECT 1 FROM information_schema.tables WHERE table_schema=current_schema() AND table_name<>'schema_migrations' LIMIT 1")).rowCount)throw Error('PostgreSQL-Anwendungsschema ist bereits belegt. Keine Tabellen werden überschrieben.');
  for(const sql of statements)await db.query(sql);
  if(seedDefaults){const now=new Date().toISOString(),defaults=new Set(['reasons.other','conditions.unchecked','statuses.received','resolutions.pending']);for(const item of BUILTIN_MASTERDATA){const tone=({'statuses.received':'received','statuses.checking':'checking','statuses.working':'working','statuses.completed':'done'} as Record<string,string>)[item.key]??'received';await db.query('INSERT INTO masterdata(id,kind,name,nameKey,builtinKey,isDefault,isClosed,tone,createdAt,updatedAt) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[item.id,item.kind,item.name,item.name.trim().normalize('NFKC').toLocaleLowerCase('de-DE'),item.key,Number(defaults.has(item.key)),Number(item.key==='statuses.completed'),tone,now,now]);}}
  for(const table of BASELINE_TABLE_CONTRACTS)if(table.identity){const max=(await db.query<{n:number}>('SELECT COALESCE(MAX('+table.identity+'),0) AS n FROM '+table.name)).rows[0].n;await db.query('SELECT setval(pg_get_serial_sequence($1,$2),$3,$4)',[db.schema+'.'+table.name,table.identity.toLowerCase(),Math.max(max,1),max>0]);}
  await db.query('INSERT INTO schema_migrations(version,name,checksum,appliedAt) VALUES($1,$2,$3,$4)',[1,'postgresql-baseline',checksum,new Date().toISOString()]);
  }
  if(!applied.some(row=>row.version===2)){for(const sql of additions)await db.query(sql);await db.query('INSERT INTO schema_migrations(version,name,checksum,appliedAt) VALUES($1,$2,$3,$4)',[2,'disposal-workflow',additionChecksum,new Date().toISOString()]);}
  if(!applied.some(row=>row.version===3)){for(const sql of RETURN_SEARCH_MIGRATION)await db.query(sql);await rebuildReturnSerialSearch(db);await db.query('INSERT INTO schema_migrations(version,name,checksum,appliedAt) VALUES($1,$2,$3,$4)',[3,'return-search-indexes',searchChecksum,new Date().toISOString()]);}
  if(!applied.some(row=>row.version===4)){for(const sql of metadataStatements)await db.query(sql);await backfillRecordMetadata(db);await db.query('INSERT INTO schema_migrations(version,name,checksum,appliedAt) VALUES($1,$2,$3,$4)',[4,'record-revisions-and-price-snapshots',metadataChecksum,new Date().toISOString()]);}
  if(!applied.some(row=>row.version===5)){for(const sql of ssoStatements)await db.query(sql);await db.query('INSERT INTO schema_migrations(version,name,checksum,appliedAt) VALUES($1,$2,$3,$4)',[5,'optional-oidc-sign-in',ssoChecksum,new Date().toISOString()]);}
 });
}
