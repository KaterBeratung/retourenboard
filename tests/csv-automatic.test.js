import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import { createStore } from './helpers/postgres-fixtures.js';
import { previewImport, commitImport } from '../dist/server/import.js';
import * as csv from '../dist/shared/csv.js';
import { runtimeFixture } from './helpers/runtime.js';
const productText = '"Artikelnummer";"Produktname";"EAN";"Hersteller";"Lieferant";"Kategorie";"Preis";"Beschreibung";"Aktiv"\n"0012345678905";"Beispielgerät";"0012345678905";"Beispielhersteller";"Beispiellieferant";"Geräte";"639,00";"";"ja"';
const returnText = '"Retourennummer";"Artikelnummer";"Lieferant";"Seriennummer";"Bestellnummer";"Eingangsdatum";"Menge";"Retourengrund";"Zustand";"Status";"Lösung";"Notizen"\n"RET-EXAMPLE";"0012345678905";"Beispiellieferant";"SN-001";"";"2026-10-02";"1";"Defekt";"Defekt";"In Bearbeitung";"Austausch";"Beispiel"';
test('CSV kind and columns are detected for exported German and English headers', () => {
    assert.equal(typeof csv.guessCsvMapping, 'function');
    assert.equal(typeof csv.inferCsvKind, 'function');
    assert.equal(csv.inferCsvKind(csv.parseCsv(productText).headers, 'returns'), 'products');
    assert.equal(csv.inferCsvKind(csv.parseCsv(returnText).headers, 'products'), 'returns');
    assert.deepEqual(csv.guessCsvMapping('returns', ['Serial number', 'SKU', 'Customer reference', 'Date received']), { returnNumber: -1, sku: 1, productName: -1, supplier: -1, serialNumber: 0, replacementSerialNumber: -1, orderNumber: -1, customerReference: 2, trackingNumber: -1, receiptDate: 3, quantity: -1, reason: -1, condition: -1, status: -1, resolution: -1, notes: -1, assignedUserId: -1, nextStep: -1, ean: -1, manufacturer: -1, category: -1, price: -1, description: -1 });
});
test('status update CSV is recognized by SKU and return number without mistaking weak product columns for returns', () => {
    for (const headers of [['Artikelnummer', 'Retourennummer', 'Status'], ['SKU', 'Return number', 'Status'], ['returnNumber', 'sku', 'status']]) {
        assert.equal(csv.inferCsvKind(headers, null), 'returns');
        const mapping = csv.guessCsvMapping('returns', headers);
        assert.ok(mapping.sku >= 0);
        assert.ok(mapping.returnNumber >= 0);
        assert.equal(mapping.serialNumber, -1);
    }
    assert.equal(csv.inferCsvKind(['Artikelnummer', 'Status'], null), null);
    assert.equal(csv.inferCsvKind(['Retourennummer', 'Status'], null), null);
    assert.equal(csv.inferCsvKind(['SKU', 'Name', 'Status'], null), 'products');
});
test('automatic status CSV preview and commit update matched returns while preserving serial numbers', async (t) => {
    const f = await runtimeFixture(t), { auth } = await f.setup();
    const one = await f.app.store.createProduct({ sku: 'KB-080', name: 'Product one' }), two = await f.app.store.createProduct({ sku: 'HOME-012', name: 'Product two' });
    await f.app.store.createReturn({ productId: one.id, resolutionId:17,returnNumber: 'RET-2026-000008', serialNumber: 'ORIGINAL-8' });
    await f.app.store.createReturn({ productId: two.id, resolutionId:17,returnNumber: 'RET-2026-000004', serialNumber: 'ORIGINAL-4' });
    const payload = { kind: 'auto', duplicates: 'update', text: 'Artikelnummer;Retourennummer;Status\nKB-080;RET-2026-000008;Abgeschlossen\nHOME-012;RET-2026-000004;Abgeschlossen' };
    const preview = await f.request('/api/import/preview', 'POST', payload, auth);
    assert.equal(preview.status, 200);
    const plan = await preview.json();
    assert.equal(plan.kind, 'returns');
    assert.equal(plan.updated, 2);
    assert.deepEqual(plan.errors, []);
    assert.equal((await f.app.store.findReturn('RET-2026-000008')).status, 'Eingegangen');
    const response = await f.request('/api/import/commit', 'POST', payload, auth);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).updated, 2);
    assert.equal((await f.app.store.findReturn('RET-2026-000008')).status, 'Abgeschlossen');
    assert.equal((await f.app.store.findReturn('RET-2026-000008')).serialNumber, 'ORIGINAL-8');
    assert.equal((await f.app.store.findReturn('RET-2026-000004')).status, 'Abgeschlossen');
    assert.equal((await f.app.store.findReturn('RET-2026-000004')).serialNumber, 'ORIGINAL-4');
    assert.equal((await f.app.store.listReturns()).length, 2);
});
test('automatic master data preview leaves the database unchanged and commit creates references once', async (t) => {
    const store = await createStore(':memory:');
    t.after(() => store.close());
    const mapping = { sku: 0, name: 1, ean: 2, manufacturer: 3, supplier: 4, category: 5, price: 6, description: 7, active: 8 }, options = { duplicates: 'update', createMissingMasterdata: true };
    const count = (await store.db.query("SELECT COUNT(*) AS n FROM masterdata", [])).rows[0].n;
    const preview = await previewImport(store, 'products', productText, mapping, options);
    assert.deepEqual(preview.errors, []);
    assert.equal(preview.newMasterdata.length, 3);
    assert.equal((await store.listProducts()).length, 0);
    assert.equal((await store.db.query("SELECT COUNT(*) AS n FROM masterdata", [])).rows[0].n, count);
    assert.equal((await commitImport(store, 'products', productText, mapping, options)).created, 1);
    assert.equal((await commitImport(store, 'products', productText, mapping, options)).updated, 1);
    assert.equal((await store.db.query("SELECT COUNT(*) AS n FROM masterdata", [])).rows[0].n, count + 3);
    assert.equal((await store.listProducts())[0].ean, '0012345678905');
    assert.equal((await store.listProducts())[0].priceCents, 63900);
});
test('invalid CSV never leaves automatically planned master data or a partial product behind', async (t) => {
    const store = await createStore(':memory:');
    t.after(() => store.close());
    const text = 'SKU;Name;Lieferant;EAN\nA;Gut;Neu;12345678\nB;Fehler;Neu;invalid', mapping = { sku: 0, name: 1, supplier: 2, ean: 3 }, options = { createMissingMasterdata: true };
    await assert.rejects(async () => commitImport(store, 'products', text, mapping, options));
    assert.equal((await store.listProducts()).length, 0);
    assert.equal((await store.listMasterData()).suppliers.length, 0);
});
test('default API import accepts exported products then returns and repeated imports without changing options', async (t) => {
    const f = await runtimeFixture(t), { auth } = await f.setup();
    for (const [kind, text] of [['products', productText], ['returns', returnText]]) {
        const payload = { kind, text };
        const res = await f.request('/api/import/preview', 'POST', payload, auth);
        assert.equal(res.status, 200);
        assert.deepEqual((await res.json()).errors, []);
        const commit = await f.request('/api/import/commit', 'POST', payload, auth);
        assert.equal(commit.status, 200);
        assert.equal((await commit.json()).created, 1);
        const repeated = await f.request('/api/import/commit', 'POST', payload, auth);
        assert.equal(repeated.status, 200);
        const result = await repeated.json();
        assert.equal(kind === 'products' ? result.updated : result.skipped, 1);
    }
    assert.equal((await f.app.store.listProducts()).length, 1);
    assert.equal((await f.app.store.listReturns()).length, 1);
});
test('automatic import cannot create master data or update products without the corresponding permissions', async (t) => {
    const f = await runtimeFixture(t), { auth } = await f.setup();
    await f.app.users.create({ username: 'Importer', displayName: 'Importer', role: 'member', password: 'Import-Test-Passwort!', permissions: { productsImport: true, productsCreate: true, productsEdit: false, masterdataManage: false } });
    const { auth: member } = await f.login('Importer', 'Import-Test-Passwort!');
    const result = await f.request('/api/import/commit', 'POST', { kind: 'products', text: productText }, member);
    assert.equal(result.status, 400);
    assert.equal((await f.app.store.listProducts()).length, 0);
    const explicit = await f.request('/api/import/commit', 'POST', { kind: 'products', text: productText, createMissingMasterdata: true }, member);
    assert.equal(explicit.status, 403);
    assert.equal((await f.app.store.listMasterData()).suppliers.length, 0);
    const admin = await f.request('/api/import/commit', 'POST', { kind: 'products', text: productText }, auth);
    assert.equal(admin.status, 200);
    const repeat = await f.request('/api/import/commit', 'POST', { kind: 'products', text: productText.replace('Beispielgerät', 'Überschrieben') }, member);
    assert.equal(repeat.status, 200);
    assert.equal((await repeat.json()).skipped, 1);
    assert.equal((await f.app.store.listProducts())[0].name, 'Beispielgerät');
});
