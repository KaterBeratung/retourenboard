import type {ColumnContract,TableContract} from './schema.js';
import type {SqlDatabase} from './types.js';
import {InputError} from '../../shared/model.js';

const column=(name:string,kind:'integer'|'text',primary=0):ColumnContract=>({name,sqlName:name.toLowerCase(),kind,nullable:false,primary,defaultSql:null});
export const RECORD_METADATA_TABLES:readonly TableContract[]=[
 {name:'product_versions',sourceName:'product_versions',identity:null,columns:[column('productId','integer',1),column('revision','integer')],createSql:'CREATE TABLE product_versions(productId BIGINT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,revision BIGINT NOT NULL CHECK(revision>0 AND revision<=9007199254740991))'},
 {name:'return_versions',sourceName:'return_versions',identity:null,columns:[column('returnId','integer',1),column('revision','integer'),column('priceSnapshotCents','integer'),column('priceSnapshotSource','text'),column('priceCapturedAt','text')],createSql:"CREATE TABLE return_versions(returnId BIGINT PRIMARY KEY REFERENCES returns(id) ON DELETE CASCADE,revision BIGINT NOT NULL CHECK(revision>0 AND revision<=9007199254740991),priceSnapshotCents BIGINT NOT NULL CHECK(priceSnapshotCents>=0 AND priceSnapshotCents<=9007199254740991),priceSnapshotSource TEXT NOT NULL CHECK(priceSnapshotSource IN ('creation','audit-create','migration-observed','imported')),priceCapturedAt TEXT NOT NULL)"}
];
type Kind='products'|'returns';
const names=(table:Kind)=>table==='products'?['product_versions','productId']:['return_versions','returnId'];
export function expectedRevision(value:unknown):number {
 if(value===undefined||value===null)throw new InputError('Der gelesene Versionsstand fehlt. Bitte den Eintrag erneut öffnen.',428);
 if(typeof value!=='number'||!Number.isSafeInteger(value)||value<1)throw new InputError('Ungültiger Versionsstand.');
 return value;
}
export async function checkRecordRevision(db:SqlDatabase,table:Kind,id:number,expected?:unknown){
 // Always lock the business row first: metadata follows the same lock order on
 // edits, imports, deletes and undo, including independent database connections.
 const found=await db.query('SELECT id FROM '+table+' WHERE id=$1 FOR UPDATE',[id]);
 if(!found.rowCount)throw new InputError('Eintrag wurde nicht gefunden.',404);
 const [name,key]=names(table),row=(await db.query<{revision:number}>('SELECT revision FROM '+name+' WHERE '+key+'=$1',[id])).rows[0];
 if(!row)throw Error('Versionsmetadaten fehlen.');
 if(expected!==undefined&&expectedRevision(expected)!==row.revision)throw new InputError('Dieser Eintrag wurde inzwischen geändert. Deine Eingaben bleiben erhalten. Bitte den aktuellen Stand prüfen.',409);
 return row.revision;
}
export async function advanceRecordRevision(db:SqlDatabase,table:Kind,id:number){
 const [name,key]=names(table);await db.query('UPDATE '+name+' SET revision=revision+1 WHERE '+key+'=$1',[id]);
}
export async function ensureRecordMetadata(db:SqlDatabase,table:Kind,id:number,options:{source?:string;priceSnapshot?:{cents:number;source:string;capturedAt:string}}={}){
 if(table==='products'){await db.query('INSERT INTO product_versions(productId,revision) VALUES($1,1) ON CONFLICT(productId) DO NOTHING',[id]);return;}
 const snapshot=options.priceSnapshot;
 if(snapshot){if(!Number.isSafeInteger(snapshot.cents)||snapshot.cents<0||!['creation','audit-create','migration-observed','imported'].includes(snapshot.source)||!/^\d{4}-\d{2}-\d{2}T/.test(snapshot.capturedAt)||!Number.isFinite(Date.parse(snapshot.capturedAt)))throw new InputError('Ungültiger gespeicherter Retourenpreis.');
  await db.query('INSERT INTO return_versions(returnId,revision,priceSnapshotCents,priceSnapshotSource,priceCapturedAt) VALUES($1,1,$2,$3,$4) ON CONFLICT(returnId) DO NOTHING',[id,snapshot.cents,snapshot.source,snapshot.capturedAt]);return;
 }
 await db.query('INSERT INTO return_versions(returnId,revision,priceSnapshotCents,priceSnapshotSource,priceCapturedAt) SELECT r.id,1,p.priceCents,$2,$3 FROM returns r JOIN products p ON p.id=r.productId WHERE r.id=$1 ON CONFLICT(returnId) DO NOTHING',[id,options.source??'creation',new Date().toISOString()]);
}
export async function backfillRecordMetadata(db:SqlDatabase){
 await db.query('INSERT INTO product_versions(productId,revision) SELECT id,1 FROM products ON CONFLICT(productId) DO NOTHING');
 let last=0;
 for(;;){const rows=(await db.query<{id:number}>('SELECT id FROM returns WHERE id>$1 ORDER BY id LIMIT 500',[last])).rows;if(!rows.length)break;
  const upper=rows.at(-1)!.id;
  // Only the first create audit is evidence of an original price. Never use a
  // later edit or silently label the present catalog price as historical fact.
  await db.query(`INSERT INTO return_versions(returnId,revision,priceSnapshotCents,priceSnapshotSource,priceCapturedAt)
   SELECT r.id,1,COALESCE(e.price,p.priceCents),CASE WHEN e.price IS NULL THEN 'migration-observed' ELSE 'audit-create' END,CASE WHEN e.price IS NULL THEN $3 ELSE e.createdAt END
   FROM returns r JOIN products p ON p.id=r.productId LEFT JOIN LATERAL(
    SELECT CASE WHEN changes::jsonb#>>'{priceCents,after}' ~ '^[0-9]{1,16}$' THEN CASE WHEN (changes::jsonb#>>'{priceCents,after}')::numeric<=9007199254740991 THEN (changes::jsonb#>>'{priceCents,after}')::bigint END END AS price,createdAt
    FROM audit WHERE entity='returns' AND entityId=r.id::text AND action='create' ORDER BY id LIMIT 1
   ) e ON TRUE WHERE r.id>$1 AND r.id<=$2 ON CONFLICT(returnId) DO NOTHING`,[last,upper,new Date().toISOString()]);
  last=upper;
 }
}
