import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../dist/server/legacy-sqlite/store.js';
import { commitImport, previewImport } from '../dist/server/import.js';
import { RETURN_COLUMNS } from '../dist/shared/model.js';
import { runtimeFixture } from './helpers/runtime.js';
test('an existing database gains an empty customer reference and keeps timestamps and records on repeated starts', t => {
    const directory = mkdtempSync(join(tmpdir(), 'retourenboard-reference-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const file = join(directory, 'test.sqlite');
    let store = createStore(file);
    try {
        const product = store.createProduct({ name: 'Altbestand', sku: 'ALT' }), row = store.createReturn({ productId: product.id, serialNumber: 'ALT-SN' });
        store.close();
        store = null;
        const old = new DatabaseSync(file);
        if (old.prepare('PRAGMA table_info(returns)').all().some(c => c.name === 'customerReference'))
            old.exec('ALTER TABLE returns DROP COLUMN customerReference');
        old.prepare('DELETE FROM migrations WHERE name=?').run('return-customer-reference-v1');
        old.close();
        store = createStore(file);
        assert.equal(store.getReturn(row.id).customerReference, '');
        assert.equal(store.getReturn(row.id).createdAt, row.createdAt);
        store.updateReturn(row.id, { ...store.getReturn(row.id), customerReference: 'Migriert' });
        store.close();
        store = null;
        store = createStore(file);
        assert.equal(store.getReturn(row.id).customerReference, 'Migriert');
    }
    finally {
        store?.close();
    }
});
