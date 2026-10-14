import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateOrigin } from './settings.js';
// Read-only helper for the installer: never migrate the database as root.
let port = Number(process.env.PORT || 3000), publicOrigin = process.env.PUBLIC_ORIGIN || '';
const path = resolve(process.env.DB_PATH || 'data/retouren.sqlite');
if (existsSync(path)) {
    const db = new DatabaseSync(path, { readOnly: true });
    try {
        if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='server_settings'").get()) {
            const row = db.prepare('SELECT value FROM server_settings WHERE id=1').get();
            if (row) {
                const value = JSON.parse(row.value);
                if (!value || typeof value !== 'object' || Array.isArray(value))
                    throw new Error('Ungültige Servereinstellungen.');
                const saved = value;
                if (saved.port !== undefined) {
                    if (typeof saved.port !== 'number' || !Number.isInteger(saved.port) || saved.port < 1024 || saved.port > 65535)
                        throw new Error('Ungültiger gespeicherter Port.');
                    port = saved.port;
                }
                if (saved.publicOrigin !== undefined)
                    publicOrigin = validateOrigin(saved.publicOrigin);
            }
        }
    }
    finally {
        db.close();
    }
}
if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Ungültiger Serverport.');
publicOrigin = validateOrigin(publicOrigin);
console.log(`PORT=${port}\nPUBLIC_ORIGIN=${publicOrigin}`);
