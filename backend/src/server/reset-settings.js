import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createSettings } from './settings.js';
const db = new DatabaseSync(resolve(process.env.DB_PATH || 'data/retouren.sqlite'));
try {
    createSettings(db, { port: 3000, publicOrigin: '', secureCookies: false }).resetNetwork();
    console.log('Gespeicherte Netzwerkeinstellungen entfernt. Nach dem Neustart gelten wieder die Werte der Umgebungskonfiguration.');
}
finally {
    db.close();
}
