import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { runtimeFixture, testPassword } from './helpers/runtime.js';
import { createStore } from '../dist/server/legacy-sqlite/store.js';
import { validateReturn } from '../dist/shared/model.js';
import { parseCsv, guessCsvMapping } from '../dist/shared/csv.js';
import { previewImport, commitImport } from '../dist/server/import.js';
import { exportInventory, commitInventoryImport } from '../dist/server/inventory-transfer.js';
async function team(t) {
    const f = await runtimeFixture(t), { auth, data } = await f.setup();
    const response = await f.request('/api/users', 'POST', { username: 'Handler', displayName: 'Bearbeiter', role: 'member', password: testPassword }, auth);
    const member = await response.json();
    const viewer = await (await f.request('/api/users', 'POST', { username: 'Reader', role: 'viewer', password: testPassword }, auth)).json();
    const product = f.app.store.createProduct({ name: 'Workflow Produkt', sku: 'WORKFLOW-1' });
    const create = (input = {}) => f.app.store.createReturn({ productId: product.id, serialNumber: 'SN-WORKFLOW', ...input });
    return { ...f, auth, admin: data.user, member, viewer, product, create, memberAuth: (await f.login('Handler')).auth, viewerAuth: (await f.login('Reader')).auth };
}
test('workflow migration adds defaults exactly once without altering existing return data', () => {
    const dir = mkdtempSync(join(tmpdir(), 'retouren-workflow-migration-')), path = join(dir, 'data.sqlite');
    let store = createStore(path);
    try {
        const p = store.createProduct({ name: 'Bestand', sku: 'OLD-WF' });
        store.createReturn({ productId: p.id, serialNumber: 'OLD-SN', notes: 'unverändert' });
        store.close();
        const db = new DatabaseSync(path);
        for (const field of ['assignedUserId', 'assignedDisplayName', 'nextStep'])
            if (db.prepare('PRAGMA table_info(returns)').all().some(c => c.name === field))
                db.exec(`ALTER TABLE returns DROP COLUMN ${field}`);
        db.prepare('DELETE FROM migrations WHERE name=?').run('return-workflow-v1');
        const before = { ...db.prepare('SELECT * FROM returns').get() };
        db.close();
        store = createStore(path);
        const row = { ...store.db.prepare('SELECT * FROM returns').get() };
        assert.equal(row.assignedUserId, null);
        assert.equal(row.assignedDisplayName, '');
        assert.equal(row.nextStep, '');
        for (const field of ['assignedUserId', 'assignedDisplayName', 'nextStep'])
            delete row[field];
        assert.deepEqual(row, before);
        store.close();
        store = createStore(path);
        assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM migrations WHERE name='return-workflow-v1'").get().n, 1);
    }
    finally {
        store.close();
        rmSync(dir, { recursive: true, force: true });
    }
});
