import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { createStore } from './helpers/postgres-fixtures.js';
import { runtimeFixture } from './helpers/runtime.js';
import { sourceModule } from './helpers/source-module.js';
test('tracking numbers are optional text, preserve leading zeros, and survive edits', async (t) => {
    const store = await createStore(':memory:');
    t.after(() => store.close());
    const product = await store.createProduct({ name: 'Tracking test', sku: 'TRACK' });
    const row = await store.createReturn({ productId: product.id, serialNumber: 'SN-1', trackingNumber: '  001234567890 / AB-42  ' });
    assert.equal(row.trackingNumber, '001234567890 / AB-42');
    assert.equal((await store.createReturn({ productId: product.id, serialNumber: 'SN-2' })).trackingNumber, '');
    const edited = await store.updateReturn(row.id, { ...row, trackingNumber: '0000009876' });
    assert.equal(edited.trackingNumber, '0000009876');
    assert.equal(edited.createdAt, row.createdAt);
    assert.equal(edited.serialNumber, 'SN-1');
    for (const trackingNumber of [123, {}, 'X'.repeat(251)])
        await assert.rejects(async () => store.createReturn({ productId: product.id, serialNumber: 'SN-3', trackingNumber }), /Sendungsnummer/);
    assert.equal((await store.updateReturn(row.id, { ...edited, trackingNumber: '' })).trackingNumber, '');
});
test('API, CSV and combined JSON transfer tracking numbers and preserve them during partial updates', async (t) => {
    const f = await runtimeFixture(t), { auth } = await f.setup();
    const product = await f.app.store.createProduct({ name: 'Tracking test', sku: 'TRACK' });
    const created = await f.request('/api/returns', 'POST', { productId: product.id, returnNumber: 'RET-TRACK',resolutionId:17,serialNumber: 'SN-1', trackingNumber: '0001234567890' }, auth);
    assert.equal(created.status, 201);
    const row = await created.json();
    assert.equal(row.trackingNumber, '0001234567890');
    const text = await (await f.request('/api/export/returns', 'GET', undefined, auth)).text();
    assert.match(text, /Sendungsnummer/);
    assert.match(text, /0001234567890/);
    const json = await (await f.request('/api/export/all', 'GET', undefined, auth)).json();
    assert.equal(json.returns[0].trackingNumber, '0001234567890');
    const labels = await (await f.request(`/api/returns/${row.id}/label`, 'GET', undefined, auth)).json();
    assert.equal(labels.trackingNumber, '0001234567890');
    assert.equal((await f.request('/api/returns')).status, 401);
    const changed = await f.request('/api/import/commit', 'POST', { kind: 'auto', text: 'SKU;Return number;Tracking number\nTRACK;RET-TRACK;000987654321', duplicates: 'update' }, auth);
    assert.equal(changed.status, 200);
    assert.equal((await f.app.store.getReturn(row.id)).trackingNumber, '000987654321');
    assert.equal((await f.app.store.getReturn(row.id)).serialNumber, 'SN-1');
    const partial = await f.request('/api/import/commit', 'POST', { kind: 'auto', text: 'Artikelnummer;Retourennummer;Status\nTRACK;RET-TRACK;Abgeschlossen', duplicates: 'update' }, auth);
    assert.equal(partial.status, 200);
    assert.equal((await f.app.store.getReturn(row.id)).trackingNumber, '000987654321');
    const exported = await (await f.request('/api/export/all', 'GET', undefined, auth)).text();
    const target = await runtimeFixture(t), { auth: targetAuth } = await target.setup();
    assert.equal((await target.request('/api/import/commit', 'POST', { kind: 'all', text: exported, duplicates: 'update' }, targetAuth)).status, 200);
    assert.equal((await target.app.store.findReturn('RET-TRACK')).trackingNumber, '000987654321');
    const auditResponse = await f.request(`/api/admin/audit?entity=returns&entityId=${row.id}`, 'GET', undefined, auth);
    assert.equal(auditResponse.status, 200);
    const audit = (await auditResponse.json()).items;
    assert.equal(audit.find(item => item.changes.trackingNumber?.after === '000987654321')?.changes.trackingNumber.before, '0001234567890', JSON.stringify(audit));
});
test('tracking numbers remain in drafts, appear safely in details/labels, and are searchable', async () => {
    const ui = await sourceModule("export {createReturnDraftStore} from './frontend/src/return-drafts.ts'; export {searchInventory} from './frontend/src/workspace-tools.ts'; export {returnDetailContent} from './frontend/src/inventory-display.ts'; export {renderReturnLabelDocument} from './frontend/src/return-labels.ts';");
    const values = new Map(), drafts = ui.createReturnDraftStore({ getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) }, () => Date.now());
    const number = '000123<script>bad</script>', draft = drafts.write(1, { trackingNumber: number });
    assert.equal(draft.fields.trackingNumber, number);
    const row = { id: 1, returnNumber: 'RET-TRACK', trackingNumber: number, serialNumber: 'SN-1', productName: 'Device', qrDataUrl: 'data:image/png;base64,aGVsbG8=' };
    assert.equal(ui.searchInventory({ returns: [row] }, '000123')[0]?.id, 1);
    const details = String(ui.returnDetailContent({}, row)), label = String(ui.renderReturnLabelDocument(row));
    for (const markup of [details, label]) {
        assert.match(markup, /Sendungsnummer/);
        assert.match(markup, /000123&lt;script&gt;/);
        assert.doesNotMatch(markup, /<script>bad/);
    }
});
test('tracking number validation errors use the selected language', async () => {
    const ui = await sourceModule("export {apiError,setLanguage,addTranslations} from './frontend/src/i18n.js'; export {english} from './frontend/src/i18n-catalog.js';");
    ui.addTranslations(ui.english);
    ui.setLanguage('en');
    try {
        assert.equal(String(ui.apiError('Sendungsnummer: maximal 250 Zeichen erlaubt.')), 'Tracking number: at most 250 characters are allowed.');
    }
    finally {
        ui.setLanguage('de');
    }
    assert.equal(String(ui.apiError('Sendungsnummer: maximal 250 Zeichen erlaubt.')), 'Sendungsnummer: maximal 250 Zeichen erlaubt.');
});
