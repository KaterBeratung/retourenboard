import {DatabaseSync} from 'node:sqlite';
import {LEGACY_TABLES} from './catalog.js';
import {createStore} from './store.js';
import {createUsers} from './users.js';
import {assertRestoreSchema} from '../restore-validation.js';
const markers=new Set(['admin-v2','masterdata-builtins-v1','return-workflow-v1','return-customer-reference-v1','return-tracking-number-v1','return-replacement-serial-v1','features-1.4','users-account-deletion-v1']);
export function validateLegacy(db:DatabaseSync){
 assertRestoreSchema(db);
 for(const row of db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()){
  const table=LEGACY_TABLES.find(t=>t.name===row.name);if(!table)throw Error('Unbekannte Quelltabelle.');
  for(const column of db.prepare('PRAGMA table_xinfo("'+table.name+'")').all())if(!table.columns.some(c=>c.name===column.name&&c.type===String(column.type).toUpperCase()))throw Error('Unbekannter Schema- oder Spaltenstand.');
 }
 if(db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='migrations'").get())for(const row of db.prepare('SELECT name FROM migrations').all())if(!markers.has(String(row.name)))throw Error('Unbekannte SQLite-Migration.');
 if(db.prepare('PRAGMA integrity_check').get()?.integrity_check!=='ok')throw Error('SQLite-Datenbank ist beschädigt.');
}
export function ensureLegacyTables(db:DatabaseSync){for(const t of LEGACY_TABLES)if(!db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?").get(t.name))db.exec(t.sql);}
// The caller provides a disposable snapshot, never the original database.
export function upgradeLegacySnapshot(path:string){
 let db=new DatabaseSync(path);try{validateLegacy(db);}finally{db.close();}
 const store=createStore(path);try{createUsers(store);db=store.db;ensureLegacyTables(db);
  validateLegacy(db);if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Ungültige SQLite-Zuordnungen.');
  for(const t of LEGACY_TABLES){const actual=db.prepare('PRAGMA table_info("'+t.name+'")').all();if(actual.length!==t.columns.length||t.columns.some(c=>!actual.some(a=>a.name===c.name)))throw Error('SQLite-Quelle konnte nicht vollständig aktualisiert werden.');}
  return store;
 }catch(error){store.close();throw error;}
}
