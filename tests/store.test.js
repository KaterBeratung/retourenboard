import { test } from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from './helpers/postgres-fixtures.js';
test('SKU uniqueness is enforced and product changes persist', async () => {
    const store = await createStore(':memory:');
    try {
        await store.createMasterData('suppliers', { name: 'Lieferant A' });
        await store.createMasterData('suppliers', { name: 'Lieferant B' });
        const p = await store.createProduct({ name: 'Monitor', sku: 'M-1', supplier: 'Lieferant A' });
        await assert.rejects(async () => store.createProduct({ name: 'Duplicate', sku: 'M-1' }));
        await store.updateProduct(p.id, { ...p, supplierId: undefined, supplier: 'Lieferant B' });
        assert.equal((await store.getProduct(p.id)).supplier, 'Lieferant B');
    }
    finally {
        store.close();
    }
});
test('linked products archive and returns retain product information', async () => {
    const store = await createStore(':memory:');
    try {
        const p = await store.createProduct({ name: 'Monitor', sku: 'M-1' });
        const r = await store.createReturn({ productId: p.id, receiptDate: '2026-10-05', serialNumber: 'ABC' });
        assert.match(r.returnNumber, /^RET-\d{4}-\d{6,}$/);
        assert.equal((await store.deleteProduct(p.id)).archived, true);
        assert.equal((await store.getProduct(p.id)).active, false);
        assert.equal((await store.listReturns())[0].productName, 'Monitor');
        await assert.rejects(async () => store.createReturn({ serialNumber: 'TEST-SN', productId: p.id, receiptDate: '2026-10-05' }));
        await store.updateReturn(r.id, { ...r, resolutionId:17,statusId: undefined, status: 'Abgeschlossen' });
        assert.equal((await store.getReturn(r.id)).status, 'Abgeschlossen');
    }
    finally {
        store.close();
    }
});
test('database data survives reopening and transactions roll back', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'retouren-test-'));
    const file = join(dir, 'test.sqlite');
    let store = await createStore(file);
    try {
        await store.createProduct({ name: 'Bestand', sku: 'P-1' });
        await assert.rejects(async () => store.transaction(async () => {
            await store.createProduct({ name: 'Neu', sku: 'P-2' });
            throw new Error('abbruch');
        }));
        store.close();
        store = await createStore(file);
        assert.equal((await store.listProducts()).length, 1);
        assert.equal((await store.listProducts())[0].sku, 'P-1');
    }
    finally {
        store.close();
        rmSync(dir, { recursive: true, force: true });
    }
});
