import {existsSync,lstatSync} from 'node:fs';
import type {SqlDatabase} from './types.js';
export async function assertLegacyCutover(db:SqlDatabase,source:string){
 if(!existsSync(source))return;
 if(lstatSync(source).isSymbolicLink()||!lstatSync(source).isFile())throw Error('Ungültige SQLite-Quelle. Keine automatische Initialisierung.');
 const marker=(await db.query("SELECT 1 FROM information_schema.tables WHERE table_schema=$1 AND table_name='activation_state'",[db.schema])).rowCount;
 if(marker){const state=(await db.query('SELECT writesReleased AS "writesReleased" FROM activation_state WHERE singleton=1')).rows[0];if(state?.writesReleased)return;}
 throw Error('Vorhandene SQLite-Daten zuerst mit migrate-sqlite.mjs prüfen und übernehmen. PostgreSQL wird nicht mit einem leeren Bestand gestartet.');
}
