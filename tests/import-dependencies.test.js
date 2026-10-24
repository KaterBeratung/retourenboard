import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import { createStore } from './helpers/postgres-fixtures.js';
import { previewImport, commitImport } from '../dist/server/import.js';
import { guessCsvMapping, parseCsv } from '../dist/shared/csv.js';
import { runtimeFixture } from './helpers/runtime.js';
const options = { duplicates: 'skip', createMissingMasterdata: true, createMissingProducts: true };
const text = 'Artikelnummer;Produktname;EAN;Hersteller;Kategorie;Produktpreis;Seriennummer;Lieferant;Retourengrund;Zustand;Status;Lösung\nNEW-1;Neues Gerät;0012345678905;Neue Marke;Neue Kategorie;29,95;SN-1;Neuer Lieferant;Neuer Grund;Neuer Zustand;Wartet auf Teile;Nachbesserung\nNEW-1;Neues Gerät;0012345678905;Neue Marke;Neue Kategorie;29,95;SN-2;Neuer Lieferant;Neuer Grund;Neuer Zustand;Wartet auf Teile;Nachbesserung';
const mapping = value => guessCsvMapping('returns', parseCsv(value).headers);
async function storeFixture(t) { const store = await createStore(':memory:'); t.after(() => store.close()); return store; }
test('return preview plans all missing references and one shared product without saving anything', async (t) => {
    const store = await storeFixture(t), count = (await store.db.query("SELECT COUNT(*) AS n FROM masterdata", [])).rows[0].n;
    const preview = await previewImport(store, 'returns', text, mapping(text), options);
    assert.deepEqual(preview.errors, []);
    assert.equal(preview.rows.length, 2);
    assert.equal(preview.newProducts.length, 1);
    assert.equal(preview.newProducts[0].name, 'Neues Gerät');
    assert.equal(preview.newMasterdata.length, 7);
    assert.equal((await store.listProducts()).length, 0);
    assert.equal((await store.listReturns()).length, 0);
    assert.equal((await store.db.query("SELECT COUNT(*) AS n FROM masterdata", [])).rows[0].n, count);
});
test('return import creates missing products and references once and links each serial number', async (t) => {
    const store = await storeFixture(t), result = await commitImport(store, 'returns', text, mapping(text), options);
    assert.equal(result.created, 2);
    assert.equal(result.productsCreated, 1);
    assert.equal(result.masterdataCreated, 7);
    const product = (await store.listProducts())[0];
    assert.equal(product.name, 'Neues Gerät');
    assert.equal(product.priceCents, 2995);
    assert.equal(product.ean, '0012345678905');
    assert.equal(product.manufacturer, 'Neue Marke');
    assert.equal(product.category, 'Neue Kategorie');
    assert.deepEqual((await store.listReturns()).map(row => row.serialNumber).sort(), ['SN-1', 'SN-2']);
    assert.ok((await store.listReturns()).every(row => row.productId === product.id && row.status === 'Wartet auf Teile' && row.resolution === 'Nachbesserung'));
});
test('a minimal return CSV can create a clearly identified product using the SKU as its name', async (t) => {
    const store = await storeFixture(t), csv = 'SKU;Serial number\nNEW-MIN;SN-MIN';
    const preview = await previewImport(store, 'returns', csv, mapping(csv), options);
    assert.deepEqual(preview.errors, []);
    assert.equal(preview.newProducts[0].name, 'NEW-MIN');
    await commitImport(store, 'returns', csv, mapping(csv), options);
    assert.equal((await store.findProduct('NEW-MIN')).priceCents, 0);
});
test('repeated device models can fill missing product details while retaining each return supplier', async (t) => {
    const store = await storeFixture(t), csv = 'SKU;Product name;Serial number;Supplier\nMODEL;;S-1;Vendor A\nMODEL;Named model;S-2;Vendor B';
    const preview = await previewImport(store, 'returns', csv, mapping(csv), options);
    assert.deepEqual(preview.errors, []);
    assert.equal(preview.newProducts.length, 1);
    assert.equal(preview.newProducts[0].name, 'Named model');
    await commitImport(store, 'returns', csv, mapping(csv), options);
    assert.deepEqual((await store.listReturns()).map(row => row.supplier).sort(), ['Vendor A', 'Vendor B']);
});
test('English names of unmodified built-in master data reuse the existing identities', async (t) => {
    const store = await storeFixture(t), csv = 'SKU;Serial number;Return reason;Condition;Status;Resolution\nEN;S-EN;Defective;Used;Completed;Refund';
    const preview = await previewImport(store, 'returns', csv, mapping(csv), options);
    assert.deepEqual(preview.errors, []);
    assert.deepEqual(preview.newMasterdata, []);
    await commitImport(store, 'returns', csv, mapping(csv), options);
    const row = (await store.listReturns())[0];
    assert.equal(row.status, 'Abgeschlossen');
    assert.equal(row.isClosed, true);
    assert.equal(row.reason, 'Defekt');
});
test('invalid return input rolls back newly created products and master data together', async (t) => {
    const store = await storeFixture(t), csv = text.replace(';SN-2;', ';;'), count = (await store.db.query("SELECT COUNT(*) AS n FROM masterdata", [])).rows[0].n;
    await assert.rejects(async () => commitImport(store, 'returns', csv, mapping(csv), options), /Seriennummer/);
    assert.equal((await store.listProducts()).length, 0);
    assert.equal((await store.listReturns()).length, 0);
    assert.equal((await store.db.query("SELECT COUNT(*) AS n FROM masterdata", [])).rows[0].n, count);
});
test('return imports keep existing product data and reject archived products', async (t) => {
    const store = await storeFixture(t);
    await store.createProduct({ sku: 'KNOWN', name: 'Original', priceCents: 700 });
    const csv = 'SKU;Product name;Category;Serial number\nKNOWN;Changed;Unused category;SN-A';
    const preview = await previewImport(store, 'returns', csv, mapping(csv), options);
    assert.deepEqual(preview.errors, []);
    assert.deepEqual(preview.newProducts, []);
    assert.deepEqual(preview.newMasterdata, []);
    await commitImport(store, 'returns', csv, mapping(csv), options);
    assert.equal((await store.findProduct('KNOWN')).name, 'Original');
    assert.equal((await store.findProduct('KNOWN')).priceCents, 700);
    await store.updateProduct((await store.findProduct('KNOWN')).id, { sku: 'KNOWN', name: 'Original', active: false });
    assert.match((await previewImport(store, 'returns', csv, mapping(csv), options)).errors[0].message, /archiviert/);
    assert.equal((await store.listProducts()).length, 1);
});
test('automatic API detection works without a kind and previews have no audit or event side effects', async (t) => {
    const f = await runtimeFixture(t), { auth } = await f.setup();
    const productCsv = 'SKU;Product name\nDETECT;Detected product';
    for (const kind of [undefined, 'auto']) {
        const response = await f.request('/api/import/preview', 'POST', { kind, text: productCsv }, auth);
        assert.equal(response.status, 200);
        assert.equal((await response.json()).kind, 'products');
    }
    const before = { audit: (await f.app.store.db.query("SELECT COUNT(*) AS n FROM audit", [])).rows[0].n, events: (await f.app.store.db.query("SELECT COUNT(*) AS n FROM events", [])).rows[0].n };
    const preview = await f.request('/api/import/preview', 'POST', { kind: 'auto', text }, auth);
    assert.equal(preview.status, 200);
    const plan = await preview.json();
    assert.equal(plan.kind, 'returns');
    assert.deepEqual(plan.errors, []);
    assert.equal((await f.app.store.db.query("SELECT COUNT(*) AS n FROM audit", [])).rows[0].n, before.audit);
    assert.equal((await f.app.store.db.query("SELECT COUNT(*) AS n FROM events", [])).rows[0].n, before.events);
    assert.equal((await f.app.store.listProducts()).length, 0);
    const commit = await f.request('/api/import/commit', 'POST', { kind: 'auto', text }, auth);
    assert.equal(commit.status, 200);
    assert.equal((await commit.json()).productsCreated, 1);
});
test('automatic dependency creation cannot grant missing product or master-data permissions', async (t) => {
    const f = await runtimeFixture(t);
    await f.setup();
    await f.app.users.create({ username: 'Importer', role: 'member', password: 'Import-Test-Passwort!', permissions: { returnsImport: true, returnsCreate: true, productsCreate: false, masterdataManage: false } });
    const { auth } = await f.login('Importer', 'Import-Test-Passwort!');
    const csv = 'SKU;Serial number\nLOCKED;SN-LOCKED';
    const denied = await f.request('/api/import/commit', 'POST', { kind: 'auto', text: csv, createMissingProducts: true }, auth);
    assert.equal(denied.status, 403);
    const automatic = await f.request('/api/import/commit', 'POST', { kind: 'auto', text: csv }, auth);
    assert.equal(automatic.status, 400);
    assert.equal((await f.app.store.listProducts()).length, 0);
    assert.equal((await f.app.store.listReturns()).length, 0);
});
test('unrecognized automatic files require a manual choice instead of assuming a product import', async (t) => {
    const f = await runtimeFixture(t), { auth } = await f.setup();
    const res = await f.request('/api/import/preview', 'POST', { kind: 'auto', text: 'Foo;Bar\nx;y' }, auth);
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /automatisch.*erkannt|Importtyp.*erkennen/);
});
