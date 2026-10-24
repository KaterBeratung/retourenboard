import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import {createStore} from '../dist/server/legacy-sqlite/store.js';
import {createUsers} from '../dist/server/legacy-sqlite/users.js';
function createApp({dbPath}){const store=createStore(dbPath);return {store,users:createUsers(store),close:()=>store.close()};}
import { runtimeFixture } from './helpers/runtime.js';
test('migration preserves account ids and hashes while adding rights and viewer role', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'retourenboard-migration-features-')), path = join(dir, 'db.sqlite');
    let app;
    try {
        const db = new DatabaseSync(path);
        db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY AUTOINCREMENT,username TEXT NOT NULL,usernameKey TEXT NOT NULL UNIQUE,displayName TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','member')),active INTEGER NOT NULL DEFAULT 1,passwordHash TEXT NOT NULL,passwordSalt TEXT NOT NULL,authVersion INTEGER NOT NULL DEFAULT 1,createdAt TEXT NOT NULL,updatedAt TEXT NOT NULL);
      INSERT INTO users VALUES(7,'Admin','admin','Admin','admin',1,'fake-hash','fake-salt',1,'2026-10-01','2026-10-01');
      INSERT INTO users VALUES(11,'Worker','worker','Worker','member',1,'worker-hash','worker-salt',1,'2026-10-01','2026-10-01');`);
        db.close();
        app = createApp({ dbPath: path });
        assert.equal(app.users.credentialsById(11).passwordHash, 'worker-hash');
        assert.deepEqual(app.users.get(11).capabilities, { edit: true, delete: true, import: true, export: true, admin: false });
        await app.close();
        app = createApp({ dbPath: path });
        assert.equal(app.users.get(7).id, 7);
        const viewer = await app.users.create({ username: 'Viewer', password: 'Testkonto-Passwort!', role: 'viewer' });
        assert.deepEqual(viewer.capabilities, { edit: false, delete: false, import: false, export: false, admin: false });
    }
    finally {
        if (app)
            await app.close();
        const rel = relative(tmpdir(), dir);
        assert.equal(isAbsolute(rel) || rel.startsWith('..'), false);
        rmSync(dir, { recursive: true, force: true });
    }
});
