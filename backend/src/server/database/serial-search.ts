import {serialKey} from '../../shared/serial-number.js';
import type {SqlDatabase} from './types.js';

// Derived only: portable backups keep their original schema and rebuild this
// search table from original serial text on import. No unique serial constraint:
// the same device may legitimately be returned several times.
export const RETURN_SEARCH_MIGRATION=[
 'CREATE TABLE return_serial_search(returnId BIGINT PRIMARY KEY REFERENCES returns(id) ON DELETE CASCADE,serialKey TEXT COLLATE "C" NOT NULL,replacementKey TEXT COLLATE "C" NOT NULL)',
 'CREATE INDEX return_serial_original ON return_serial_search(serialKey,returnId)',
 'CREATE INDEX return_serial_replacement ON return_serial_search(replacementKey,returnId)',
 'CREATE INDEX returns_created ON returns(createdAt DESC,id DESC)',
 'CREATE INDEX returns_status_created ON returns(statusId,createdAt DESC,id DESC)',
 'CREATE INDEX returns_assignee_created ON returns(assignedUserId,createdAt DESC,id DESC)',
 `CREATE INDEX audit_returns_completion ON audit(entityId,id DESC) WHERE entity='returns' AND action='update' AND jsonb_typeof(changes::jsonb#>'{isClosed,after}')='boolean'`
] as const;

async function indexRows(db:SqlDatabase,rows:any[]){
 if(!rows.length)return;
 const data=rows.map(row=>({returnid:row.id,serialkey:serialKey(row.serialNumber),replacementkey:serialKey(row.replacementSerialNumber)}));
 await db.query(`INSERT INTO return_serial_search(returnId,serialKey,replacementKey)
 SELECT returnid,serialkey,replacementkey FROM jsonb_to_recordset($1::jsonb) AS x(returnid bigint,serialkey text,replacementkey text)
 ON CONFLICT(returnId) DO UPDATE SET serialKey=excluded.serialKey,replacementKey=excluded.replacementKey`,[JSON.stringify(data)]);
}
export async function syncReturnSerialSearch(db:SqlDatabase,id:number){
 await indexRows(db,(await db.query('SELECT id,serialNumber,replacementSerialNumber FROM returns WHERE id=$1',[id])).rows);
}
export async function rebuildReturnSerialSearch(db:SqlDatabase){
 // Call within the owning migration/import transaction. Bounded batches keep
 // old installations and large restore files out of the application heap.
 let after=0;
 for(;;){const rows=(await db.query('SELECT id,serialNumber,replacementSerialNumber FROM returns WHERE id>$1 ORDER BY id LIMIT 500',[after])).rows;if(!rows.length)break;await indexRows(db,rows);after=rows.at(-1)!.id;}
}
