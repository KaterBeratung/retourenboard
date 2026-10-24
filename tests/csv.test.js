import { test } from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import { parseCsv, exportCsv } from '../shared/csv.js';
import { previewImport, commitImport } from '../server/import.js';
import { createStore } from './helpers/postgres-fixtures.js';
test('CSV parser preserves BOM, zeros, quoted separators, quotes and line breaks', () => {
    const parsed = parseCsv('\uFEFFArtikelnummer;Produktname;Lieferant;EAN\r\nA-1;"Monitor; groß";"Firma ""Nord""\nBerlin";0012345678905\r\n');
    assert.deepEqual(parsed.headers, ['Artikelnummer', 'Produktname', 'Lieferant', 'EAN']);
    assert.deepEqual(parsed.rows[0], { line: 2, values: ['A-1', 'Monitor; groß', 'Firma "Nord"\nBerlin', '0012345678905'] });
    assert.equal(parseCsv('sku,name\nA,Test').rows[0].values[1], 'Test');
});
test('CSV rejects malformed quotes, duplicate headers and inconsistent columns', () => {
    for (const value of ['a;b\n"offen;b', 'a;a\n1;2', 'a;b\n1;2;3', 'a;b\n"x"y;z'])
        assert.throws(() => parseCsv(value));
});
test('CSV export quotes cells and blocks spreadsheet formulas', () => {
    const parsed = parseCsv(exportCsv(['Name', 'EAN'], [['=HYPERLINK("x")', '0012345678905'], ['safe;value', '+42']]));
    assert.equal(parsed.rows[0].values[0], '\'=HYPERLINK("x")');
    assert.equal(parsed.rows[0].values[1], '0012345678905');
    assert.equal(parsed.rows[1].values[0], 'safe;value');
    assert.equal(parsed.rows[1].values[1], '\'+42');
});
test('product imports preview supplier, preserve zeros and require explicit updates', async () => {
    const store = await createStore(':memory:');
    try {
        await store.createMasterData('suppliers', { name: 'Nord' });
        await store.createMasterData('suppliers', { name: 'Süd' });
        const text = 'Artikelnummer;Produktname;Lieferant;EAN;Preis\nA-1;Monitor;Nord;0012345678905;29,95';
        const mapping = { sku: 0, name: 1, supplier: 2, ean: 3, price: 4 };
        assert.equal((await previewImport(store, 'products', text, mapping, false)).rows[0].data.supplier, 'Nord');
        assert.equal((await commitImport(store, 'products', text, mapping, false)).created, 1);
        assert.equal((await store.findProduct('A-1')).priceCents, 2995);
        assert.equal((await previewImport(store, 'products', text, mapping, false)).errors.length, 1);
        assert.equal((await commitImport(store, 'products', text.replace('Nord', 'Süd'), mapping, true)).updated, 1);
        assert.equal((await store.findProduct('A-1')).supplier, 'Süd');
    }
    finally {
        store.close();
    }
});
test('CSV validates masterdata in preview and supports optional return suppliers and custom statuses', async () => {
    const s = await createStore(':memory:');
    try {
        const a = await s.createMasterData('suppliers', { name: 'Nord' });
        await s.createMasterData('suppliers', { name: 'Süd' });
        await s.createMasterData('statuses', { name: 'Erledigt', isClosed: true });
        await s.createProduct({ sku: 'A', name: 'Test', supplierId: a.id });
        await s.createProduct({ sku: 'B', name: 'Ohne' });
        assert.equal((await previewImport(s, 'products', 'sku;name;supplier\nC;Neu;Unbekannt', { sku: 0, name: 1, supplier: 2 })).errors.length, 1);
        await assert.rejects(async () => commitImport(s, 'products', 'sku;name;supplier\nC;Neu;Nord\nD;Neu;Unbekannt', { sku: 0, name: 1, supplier: 2 }));
        assert.equal((await s.listProducts()).length, 2);
        await commitImport(s, 'returns', 'sku;date;supplier;status;sn;resolution\nA;2026-10-05;Süd;Erledigt;S1;Erstattung\nA;2026-10-05;;Eingegangen;S2;Noch offen', { sku: 0, receiptDate: 1, supplier: 2, status: 3, serialNumber: 4,resolution:5 });
        assert.equal((await s.listReturns()).find(x => x.isClosed).supplier, 'Süd');
        assert.equal((await s.listReturns()).find(x => !x.isClosed).supplier, '');
        await commitImport(s, 'returns', 'sku;date;sn\nA;2026-10-05;S3\nB;2026-10-05;S4', { sku: 0, receiptDate: 1, serialNumber: 2 });
        assert.equal((await s.listReturns()).find(x => x.sku === 'B').supplier, '');
        assert.ok((await s.listReturns()).some(x => x.supplier === 'Nord'));
        await commitImport(s, 'products', 'sku;name\nA;Umbenannt', { sku: 0, name: 1 }, true);
        assert.equal((await s.findProduct('A')).supplier, 'Nord');
    }
    finally {
        s.close();
    }
});
test('failed and duplicate imports never partially save', async () => {
    const store = await createStore(':memory:');
    try {
        const mapping = { sku: 0, name: 1 };
        await assert.rejects(async () => commitImport(store, 'products', 'sku;name\nA;Test\nB;', mapping, false));
        assert.equal((await store.listProducts()).length, 0);
        await assert.rejects(async () => commitImport(store, 'products', 'sku;name\nA;Test\nA;Duplikat', mapping, false));
        assert.equal((await store.listProducts()).length, 0);
    }
    finally {
        store.close();
    }
});
test('return imports link by SKU and detect duplicate return numbers', async () => {
    const store = await createStore(':memory:');
    try {
        await store.createProduct({ sku: 'A', name: 'Monitor' });
        const mapping = { sku: 0, receiptDate: 1, returnNumber: 2, serialNumber: 3 };
        const text = 'sku;date;number;serial\nA;2026-10-05;R-1;SN01';
        assert.equal((await commitImport(store, 'returns', text, mapping, false)).created, 1);
        assert.equal((await store.listReturns())[0].serialNumber, 'SN01');
        await assert.rejects(async () => commitImport(store, 'returns', text, mapping, false));
        assert.equal((await store.listReturns()).length, 1);
    }
    finally {
        store.close();
    }
});
