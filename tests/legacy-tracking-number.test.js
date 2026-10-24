import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { createStore } from '../dist/server/legacy-sqlite/store.js';
import { runtimeFixture } from './helpers/runtime.js';
import { sourceModule } from './helpers/source-module.js';
test('old databases gain an empty tracking number without changing existing returns; migration is idempotent', t => {
    const parent = realpathSync(tmpdir()), folder = mkdtempSync(join(parent, 'retourenboard-tracking-'));
    t.after(() => { const resolved = realpathSync(folder); assert.equal(dirname(resolved), parent); assert.ok(basename(resolved).startsWith('retourenboard-tracking-')); rmSync(resolved, { recursive: true, force: true }); });
    const path = join(folder, 'legacy.sqlite');
    let store = createStore(path);
    try {
        const product = store.createProduct({ name: 'Legacy', sku: 'OLD' }), old = store.createReturn({ productId: product.id, serialNumber: '001', customerReference: 'KEEP', notes: 'Preserve' });
        store.close();
        store = null;
        const db = new DatabaseSync(path);
        if (db.prepare('PRAGMA table_info(returns)').all().some(column => column.name === 'trackingNumber'))
            db.exec('ALTER TABLE returns DROP COLUMN trackingNumber');
        db.prepare('DELETE FROM migrations WHERE name=?').run('return-tracking-number-v1');
        db.close();
        store = createStore(path);
        const row = store.getReturn(old.id);
        assert.equal(row.trackingNumber, '');
        assert.equal(row.customerReference, 'KEEP');
        assert.equal(row.createdAt, old.createdAt);
        store.updateReturn(old.id, { ...row, trackingNumber: '00042' });
        store.close();
        store = null;
        store = createStore(path);
        assert.equal(store.getReturn(old.id).trackingNumber, '00042');
    }
    finally {
        store?.close();
    }
});
