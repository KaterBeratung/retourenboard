import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from './helpers/postgres-fixtures.js';
import { guessCsvMapping, parseCsv } from '../dist/shared/csv.js';
import { commitImport } from '../dist/server/import.js';
import { runtimeFixture } from './helpers/runtime.js';
test('replacement serial numbers are optional, trimmed, validated and saved without changing the original serial', async (t) => {
    const store = await createStore(':memory:');
    t.after(() => store.close());
    const product = await store.createProduct({ name: 'Gerät', sku: 'REPLACEMENT' });
    const row = await store.createReturn({ productId: product.id, serialNumber: 'ORIGINAL-001', replacementSerialNumber: '  00001234  ' });
    assert.equal(row.replacementSerialNumber, '00001234');
    assert.equal(row.serialNumber, 'ORIGINAL-001');
    const updated = await store.updateReturn(row.id, { ...row, replacementSerialNumber: 'EXCHANGE-002' });
    assert.equal(updated.replacementSerialNumber, 'EXCHANGE-002');
    assert.equal(updated.serialNumber, 'ORIGINAL-001');
    assert.equal(updated.createdAt, row.createdAt);
    assert.equal((await store.createReturn({ productId: product.id, serialNumber: 'ORIGINAL-002' })).replacementSerialNumber, '');
    for (const replacementSerialNumber of [42, 'X'.repeat(251)])
        await assert.rejects(async () => store.updateReturn(row.id, { ...updated, replacementSerialNumber }), /Austauschseriennummer/);
    assert.equal((await store.getReturn(row.id)).replacementSerialNumber, 'EXCHANGE-002');
    const legacyEdit = { ...updated, notes: 'Neue Notiz' };
    delete legacyEdit.replacementSerialNumber;
    assert.equal((await store.updateReturn(row.id, legacyEdit)).replacementSerialNumber, 'EXCHANGE-002');
    assert.equal((await store.updateReturn(row.id, { ...await store.getReturn(row.id), replacementSerialNumber: '' })).replacementSerialNumber, '');
});
test('automatic CSV mapping imports German and English replacement serials and accepts older CSVs', async (t) => {
    const store = await createStore(':memory:');
    t.after(() => store.close());
    await store.createProduct({ name: 'Gerät', sku: 'CSV-R' });
    for (const text of ['Artikelnummer;Seriennummer;Austauschseriennummer\nCSV-R;ORIGINAL-DE;000123', 'SKU;Serial number;Replacement serial number\nCSV-R;ORIGINAL-EN;EXCHANGE-EN']) {
        await commitImport(store, 'returns', text, guessCsvMapping('returns', parseCsv(text).headers));
    }
    assert.equal((await store.listReturns()).find(r => r.serialNumber === 'ORIGINAL-DE').replacementSerialNumber, '000123');
    assert.equal((await store.listReturns()).find(r => r.serialNumber === 'ORIGINAL-EN').replacementSerialNumber, 'EXCHANGE-EN');
    const old = 'Artikelnummer;Seriennummer\nCSV-R;ORIGINAL-LEGACY';
    await commitImport(store, 'returns', old, guessCsvMapping('returns', parseCsv(old).headers));
    assert.equal((await store.listReturns()).find(r => r.serialNumber === 'ORIGINAL-LEGACY').replacementSerialNumber, '');
});
test('authenticated API preserves and exports replacement serials through editing; anonymous reads are blocked', async (t) => {
    const f = await runtimeFixture(t), { auth } = await f.setup();
    const product = await (await f.request('/api/products', 'POST', { name: 'Gerät', sku: 'API-R' }, auth)).json();
    const response = await f.request('/api/returns', 'POST', { productId: product.id, serialNumber: 'ORIGINAL-API', replacementSerialNumber: 'EXCHANGE-API' }, auth);
    assert.equal(response.status, 201);
    const row = await response.json();
    assert.equal(row.replacementSerialNumber, 'EXCHANGE-API');
    const changed = await f.request('/api/returns/' + row.id, 'PUT', { ...row, replacementSerialNumber: 'EXCHANGE-UPDATED' }, auth);
    assert.equal(changed.status, 200);
    assert.equal((await changed.json()).replacementSerialNumber, 'EXCHANGE-UPDATED');
    const exported = parseCsv(await (await f.request('/api/export/returns', 'GET', undefined, auth)).text());
    assert.equal(exported.rows[0].values[exported.headers.indexOf('Austauschseriennummer')], 'EXCHANGE-UPDATED');
    assert.equal((await f.request('/api/returns/' + row.id)).status, 401);
});
