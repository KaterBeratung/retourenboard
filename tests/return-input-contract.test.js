import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import { createStore } from './helpers/postgres-fixtures.js';
import { previewImport, commitImport } from '../dist/server/import.js';
import { dueDate, isOverdue } from '../dist/server/return-rules.js';
import { createCsvProfiles } from '../dist/server/csv-profiles.js';
import { createUsers } from '../dist/server/users.js';
async function fixture(t) { const store = await createStore(':memory:'); createUsers(store); t.after(() => store.close()); const product = await store.createProduct({ sku: 'SN-TEST', name: 'Seriennummer-Test' }); return { store, product }; }
test('new returns accept a blank date and require a trimmed serial number', async (t) => {
    const { store, product } = await fixture(t);
    const r = await store.createReturn({ productId: product.id, serialNumber: ' SN-001 ', receiptDate: '' });
    assert.equal(r.serialNumber, 'SN-001');
    assert.equal(r.receiptDate, '');
    assert.equal(r.dueDate, null);
    assert.equal(r.overdue, false);
    for (const serialNumber of [undefined, '', '   '])
        await assert.rejects(async () => store.createReturn({ productId: product.id, serialNumber, receiptDate: '2026-10-07' }), /Seriennummer/);
    await assert.rejects(async () => store.createReturn({ productId: product.id, serialNumber: 'SN', receiptDate: '2026-02-30' }), /Eingangsdatum/);
});
test('historical empty serial remains editable but an existing serial cannot be cleared', async (t) => {
    const { store, product } = await fixture(t), r = await store.createReturn({ productId: product.id, serialNumber: 'OLD', receiptDate: '2026-10-07' });
    await store.db.query("UPDATE returns SET serialNumber='' WHERE id=$1", [r.id]);
    const old = await store.getReturn(r.id);
    assert.equal((await store.updateReturn(r.id, { ...old, notes: 'historisch', receiptDate: '' })).notes, 'historisch');
    await store.updateReturn(r.id, { ...await store.getReturn(r.id), serialNumber: 'NACHGETRAGEN' });
    await assert.rejects(async () => store.updateReturn(r.id, { ...await store.getReturn(r.id), serialNumber: '' }), /Seriennummer/);
});
test('a single-device form defaults to one and editing without a quantity preserves historical counts', async (t) => {
    const { store, product } = await fixture(t);
    const single = await store.createReturn({ productId: product.id, serialNumber: 'SINGLE-DEVICE' });
    assert.equal(single.quantity, 1);
    const historical = await store.createReturn({ productId: product.id, serialNumber: 'HISTORICAL', quantity: 3 });
    const input = { ...historical, notes: 'Neu geprüft', replacementSerialNumber: 'EXCHANGE-DEVICE' };
    delete input.quantity;
    const changed = await store.updateReturn(historical.id, input);
    assert.equal(changed.quantity, 3);
    assert.equal(changed.notes, 'Neu geprüft');
    assert.equal(changed.replacementSerialNumber, 'EXCHANGE-DEVICE');
    assert.equal(changed.serialNumber, historical.serialNumber);
    assert.equal(changed.createdAt, historical.createdAt);
    const singleInput = { ...single, notes: 'Ein Gerät geprüft' };
    delete singleInput.quantity;
    assert.equal((await store.updateReturn(single.id, singleInput)).quantity, 1);
});
test('undated returns never become overdue and CSV accepts serial without date', async (t) => {
    const { store } = await fixture(t);
    assert.equal(dueDate('', 14), null);
    assert.equal(isOverdue({ receiptDate: '' }, { deadlineDays: 14, timezone: 'Europe/Berlin' }, { now: () => Date.parse('2030-01-01') }), false);
    const text = 'Artikelnummer;Seriennummer\nSN-TEST;CSV-SN', mapping = { sku: 0, serialNumber: 1 };
    const preview = await previewImport(store, 'returns', text, mapping);
    assert.deepEqual(preview.errors, []);
    assert.equal(preview.rows[0].data.receiptDate, '');
    assert.equal((await commitImport(store, 'returns', text, mapping)).created, 1);
    const profiles = createCsvProfiles(store.db);
    assert.ok((await profiles.save({ name: 'Ohne Datum', kind: 'returns', delimiter: ';', mapping: { sku: 'Artikelnummer', serialNumber: 'Seriennummer' }, duplicates: 'error' })).id);
    await assert.rejects(async () => profiles.save({ name: 'Ohne Seriennummer', kind: 'returns', delimiter: ';', mapping: { sku: 'Artikelnummer', receiptDate: 'Datum' }, duplicates: 'error' }), /Pflichtspalten/);
});
