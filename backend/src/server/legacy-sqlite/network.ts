import {DatabaseSync} from 'node:sqlite';
import {assertRestoreSchema} from './restore-validation.js';
export function legacyListenerPort(source:string,fallback:number){const db=new DatabaseSync(source,{readOnly:true});try{assertRestoreSchema(db);if(!db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='server_settings'").get())return fallback;const row=db.prepare('SELECT value FROM server_settings WHERE id=1').get();return row?Number(JSON.parse(String(row.value)).port??fallback):fallback;}finally{db.close();}}
