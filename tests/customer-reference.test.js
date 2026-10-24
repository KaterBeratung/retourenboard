import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from './helpers/postgres-fixtures.js';
import { commitImport, previewImport } from '../dist/server/import.js';
import { RETURN_COLUMNS } from '../dist/shared/model.js';
import { runtimeFixture } from './helpers/runtime.js';
test('customer reference is optional, trimmed and validated without altering creation time', async (t) => {
    const store = await createStore(':memory:');
    t.after(() => store.close());
    const product = await store.createProduct({ name: 'Test', sku: 'REF' });
    const row = await store.createReturn({ productId: product.id, serialNumber: '001', customerReference: '  K-00123 / Kunde  ' });
    assert.equal(row.customerReference, 'K-00123 / Kunde');
    const changed = await store.updateReturn(row.id, { ...row, customerReference: 'Neue Referenz', createdAt: '1900-01-01' });
    assert.equal(changed.customerReference, 'Neue Referenz');
    assert.equal(changed.createdAt, row.createdAt);
    assert.equal((await store.createReturn({ productId: product.id, serialNumber: '002' })).customerReference, '');
    for (const customerReference of ['X'.repeat(251), 42])
        await assert.rejects(async () => store.createReturn({ productId: product.id, serialNumber: '003', customerReference }), /Kundenreferenz/);
});
test('CSV import retains leading zeros in customer references and accepts files without the optional column', async (t) => {
    const store = await createStore(':memory:');
    t.after(() => store.close());
    await store.createProduct({ name: 'Test', sku: 'REF' });
    assert.equal(RETURN_COLUMNS.customerReference, 'Kundenreferenz');
    const text = 'Artikelnummer;Seriennummer;Kundenreferenz\nREF;SN-1;001234', mapping = { sku: 0, serialNumber: 1, customerReference: 2 };
    assert.deepEqual((await previewImport(store, 'returns', text, mapping)).errors, []);
    await commitImport(store, 'returns', text, mapping);
    assert.equal((await store.listReturns())[0].customerReference, '001234');
    await commitImport(store, 'returns', 'Artikelnummer;Seriennummer\nREF;SN-2', { sku: 0, serialNumber: 1 });
    assert.equal((await store.listReturns())[0].customerReference, '');
});
test('authenticated API saves and exports customer reference, rejects anonymous access', async (t) => {
    const f = await runtimeFixture(t), { auth } = await f.setup();
    const product = await (await f.request('/api/products', 'POST', { name: 'Test', sku: 'REF' }, auth)).json();
    const res = await f.request('/api/returns', 'POST', { productId: product.id, serialNumber: 'SN-API', customerReference: 'K-API' }, auth);
    assert.equal(res.status, 201);
    assert.equal((await res.json()).customerReference, 'K-API');
    const csv = await f.request('/api/export/returns', 'GET', undefined, auth);
    assert.equal(csv.status, 200);
    assert.match(await csv.text(), /Kundenreferenz/);
    assert.equal((await f.request('/api/returns')).status, 401);
});
