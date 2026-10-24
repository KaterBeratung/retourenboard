import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../dist/server/legacy-sqlite/store.js';
import { guessCsvMapping, parseCsv } from '../dist/shared/csv.js';
import { commitImport } from '../dist/server/import.js';
import { runtimeFixture } from './helpers/runtime.js';
test('existing returns retain their serial and creation time through repeated replacement-serial migrations', t => {
    const directory = mkdtempSync(join(tmpdir(), 'retourenboard-replacement-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const file = join(directory, 'test.sqlite');
    let store = createStore(file);
    try {
        const product = store.createProduct({ name: 'Altbestand', sku: 'OLD' }), row = store.createReturn({ productId: product.id, serialNumber: 'ORIGINAL-OLD' });
        store.close();
        store = null;
        const db = new DatabaseSync(file);
        if (db.prepare('PRAGMA table_info(returns)').all().some(c => c.name === 'replacementSerialNumber'))
            db.exec('ALTER TABLE returns DROP COLUMN replacementSerialNumber');
        db.prepare('DELETE FROM migrations WHERE name=?').run('return-replacement-serial-v1');
        db.close();
        store = createStore(file);
        const migrated = store.getReturn(row.id);
        assert.equal(migrated.replacementSerialNumber, '');
        assert.equal(migrated.serialNumber, 'ORIGINAL-OLD');
        assert.equal(migrated.createdAt, row.createdAt);
        store.updateReturn(row.id, { ...migrated, replacementSerialNumber: 'NEW-OLD' });
        store.close();
        store = null;
        store = createStore(file);
        assert.equal(store.getReturn(row.id).replacementSerialNumber, 'NEW-OLD');
    }
    finally {
        store?.close();
    }
});
