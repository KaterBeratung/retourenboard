import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import { runtimeFixture, testPassword } from './helpers/runtime.js';
import { commitInventoryImport } from '../dist/server/inventory-transfer.js';
async function sourceFixture(t) {
    const f = await runtimeFixture(t), { auth } = await f.setup();
    f.auth = auth;
    const supplier = await f.app.store.createMasterData('suppliers', { name: 'Vendor' });
    const status = await f.app.store.createMasterData('statuses', { name: 'Erledigt beim Lieferanten', isClosed: true, tone: 'done' });
    const product = await f.app.store.createProduct({ sku: 'P-1', name: '=Gerät; "A"', ean: '0012345678905', supplier: 'Vendor', priceCents: 2995, description: 'Erste Zeile\nZweite Zeile' });
    await f.app.store.createProduct({ sku: 'P-2', name: 'Ohne Retoure', priceCents: 100 });
    await f.app.store.createReturn({ productId: product.id, returnNumber: 'RET-1', serialNumber: 'SN-1', replacementSerialNumber: 'SN-NEW', supplier: 'Vendor', customerReference: 'Customer-42',resolutionId:17,status: status.name, notes: '@person; Rückfrage' });
    await f.app.store.updateProduct(product.id, { ...product, active: false });
    await f.app.store.updateMasterData(supplier.id, { active: false });
    await f.app.store.db.query("UPDATE returns SET createdAt=$1,updatedAt=$2", ['2025-01-02T03:04:05.000Z', '2025-01-03T03:04:05.000Z']);
    return f;
}
async function exportAll(f) { const res = await f.request('/api/export/all', 'GET', undefined, f.auth); assert.equal(res.status, 200); return res; }
test('combined export contains every product and return with original values and no account data', async (t) => {
    const f = await sourceFixture(t), res = await exportAll(f), data = await res.json();
    assert.match(res.headers.get('content-type'), /application\/json/);
    assert.match(res.headers.get('content-disposition'), /\.json/);
    assert.equal(data.format, 'retourenboard.inventory');
    assert.equal(data.formatVersion, 1);
    assert.equal(data.currency, 'EUR');
    assert.equal(data.products.length, 2);
    assert.equal(data.returns.length, 1);
    const product = data.products.find(p => p.sku === 'P-1');
    assert.equal(product.priceCents, 2995);
    assert.equal(product.name, '=Gerät; "A"');
    assert.equal(product.active, false);
    assert.equal(data.returns[0].sku, 'P-1');
    assert.equal(data.returns[0].replacementSerialNumber, 'SN-NEW');
    assert.equal(data.returns[0].createdAt, '2025-01-02T03:04:05.000Z');
    assert.equal(data.users, undefined);
    assert.equal(data.settings, undefined);
    assert.equal(product.id, undefined);
    assert.ok(data.masterdata.some(m => m.name === 'Erledigt beim Lieferanten' && m.isClosed));
});
test('a combined export can be previewed without writes and imported with archived products and original references', async (t) => {
    const source = await sourceFixture(t), text = await (await exportAll(source)).text(), target = await runtimeFixture(t), { auth } = await target.setup();
    const auditBefore = (await target.app.store.db.query("SELECT COUNT(*) AS n FROM audit", [])).rows[0].n;
    const preview = await target.request('/api/import/preview', 'POST', { kind: 'auto', text }, auth);
    assert.equal(preview.status, 200);
    const plan = await preview.json();
    assert.equal(plan.kind, 'all');
    assert.equal(plan.created, 3);
    assert.equal(plan.products.created, 2);
    assert.equal(plan.returns.created, 1);
    assert.equal((await target.app.store.listProducts()).length, 0);
    assert.equal((await target.app.store.listReturns()).length, 0);
    assert.equal((await target.app.store.db.query("SELECT COUNT(*) AS n FROM audit", [])).rows[0].n, auditBefore);
    assert.equal((await target.app.store.masters.list('suppliers')).length, 0);
    const commit = await target.request('/api/import/commit', 'POST', { kind: 'auto', text }, auth);
    assert.equal(commit.status, 200);
    const product = await target.app.store.findProduct('P-1'), returned = await target.app.store.findReturn('RET-1');
    assert.equal(product.active, false);
    assert.equal(product.supplier, 'Vendor');
    assert.equal(product.priceCents, 2995);
    assert.equal(product.description, 'Erste Zeile\nZweite Zeile');
    assert.equal(returned.productId, product.id);
    assert.equal(returned.isClosed, true);
    assert.equal(returned.serialNumber, 'SN-1');
    assert.equal(returned.customerReference, 'Customer-42');
    assert.equal(returned.notes, '@person; Rückfrage');
    assert.equal(returned.createdAt, '2025-01-02T03:04:05.000Z');
    assert.equal((await target.app.store.masters.list('suppliers'))[0].active, false);
});
test('invalid returns roll back product and master data changes from a combined import', async (t) => {
    const f = await sourceFixture(t), data = await (await exportAll(f)).json(), target = await runtimeFixture(t), { auth } = await target.setup();
    data.returns[0].quantity = 0;
    const auditBefore = (await target.app.store.db.query("SELECT COUNT(*) AS n FROM audit", [])).rows[0].n;
    const res = await target.request('/api/import/commit', 'POST', { kind: 'all', text: JSON.stringify(data) }, auth);
    assert.equal(res.status, 400);
    assert.equal((await target.app.store.listProducts()).length, 0);
    assert.equal((await target.app.store.listReturns()).length, 0);
    assert.equal((await target.app.store.masters.list('suppliers')).length, 0);
    assert.equal((await target.app.store.db.query("SELECT COUNT(*) AS n FROM audit", [])).rows[0].n, auditBefore);
});
test('reimporting combined data updates existing returns and products only when update is selected', async (t) => {
    const f = await sourceFixture(t), data = await (await exportAll(f)).json();
    data.products.find(p => p.sku === 'P-2').name = 'Updated';
    data.returns[0].status = 'In Prüfung';
    data.returns[0].notes = 'Updated notes';
    const skip = await f.request('/api/import/commit', 'POST', { kind: 'all', text: JSON.stringify(data), duplicates: 'skip' }, f.auth);
    assert.equal(skip.status, 200);
    assert.equal((await skip.json()).skipped, 3);
    assert.equal((await f.app.store.findProduct('P-2')).name, 'Ohne Retoure');
    const closed=await f.app.store.findReturn('RET-1');assert.equal((await f.request('/api/returns/'+closed.id+'/reopen','POST',{statusId:12,reason:'Import correction',revision:closed.revision,expectedUpdatedAt:closed.updatedAt},f.auth)).status,200);
    const update = await f.request('/api/import/commit', 'POST', { kind: 'all', text: JSON.stringify(data), duplicates: 'update' }, f.auth);
    assert.equal(update.status, 200);
    const result = await update.json();
    assert.equal(result.updated, 3);
    assert.equal(result.skipped, 0);
    assert.equal((await f.app.store.findProduct('P-2')).name, 'Updated');
    assert.equal((await f.app.store.listReturns()).length, 1);
    assert.equal((await f.app.store.findReturn('RET-1')).status, 'In Prüfung');
    assert.equal((await f.app.store.findReturn('RET-1')).notes, 'Updated notes');
    assert.equal((await f.app.store.findReturn('RET-1')).createdAt, '2025-01-02T03:04:05.000Z');
});
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5WQAAAAASUVORK5CYII=', 'base64');
const image = { name: 'Gerät.png', data: png.toString('base64') };
async function addImage(f) { const product = await f.app.store.findProduct('P-1'); await f.app.store.updateProduct(product.id, { ...product, image }); return f.app.store.getProduct(product.id); }
test('combined JSON embeds portable product images and restores them without writes during preview', async (t) => {
    const source = await sourceFixture(t);
    await addImage(source);
    const data = await (await exportAll(source)).json(), exported = data.products.find(p => p.sku === 'P-1');
    assert.deepEqual(exported.image, image);
    assert.equal(exported.imageVersion, undefined);
    assert.equal(exported.imageUrl, undefined);
    const target = await runtimeFixture(t), { auth } = await target.setup(), text = JSON.stringify(data);
    const preview = await target.request('/api/import/preview', 'POST', { kind: 'all', text }, auth);
    assert.equal(preview.status, 200);
    assert.equal((await preview.json()).errors.length, 0);
    assert.equal((await target.app.store.db.query("SELECT COUNT(*) AS n FROM product_images", [])).rows[0].n, 0);
    assert.equal((await target.request('/api/import/commit', 'POST', { kind: 'all', text }, auth)).status, 200);
    const restored = await target.app.store.findProduct('P-1'), response = await target.request(`/api/products/${restored.id}/image`, 'GET', undefined, auth);
    assert.equal(response.status, 200);
    assert.equal(restored.imageName, image.name);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
});
test('updating JSON replaces supplied images while old files preserve images and omitted record fields', async (t) => {
    const f = await sourceFixture(t), product = await addImage(f), data = await (await exportAll(f)).json();
    const closed=await f.app.store.findReturn('RET-1');assert.equal((await f.request('/api/returns/'+closed.id+'/reopen','POST',{statusId:12,reason:'Update imported fields',revision:closed.revision,expectedUpdatedAt:closed.updatedAt},f.auth)).status,200);
    data.products = [{ sku: 'P-1', name: 'Changed product' }];
    data.returns = [{ sku: 'P-1', returnNumber: 'RET-1', status: 'In Prüfung' }];
    assert.equal((await f.request('/api/import/commit', 'POST', { kind: 'all', text: JSON.stringify(data), duplicates: 'update' }, f.auth)).status, 200);
    const unchanged = await f.app.store.findProduct('P-1'), returned = await f.app.store.findReturn('RET-1');
    assert.equal(unchanged.imageVersion, product.imageVersion);
    assert.equal(unchanged.priceCents, 2995);
    assert.equal(unchanged.active, false);
    assert.equal(unchanged.description, 'Erste Zeile\nZweite Zeile');
    assert.equal(returned.serialNumber, 'SN-1');
    assert.equal(returned.replacementSerialNumber, 'SN-NEW');
    assert.equal(returned.notes, '@person; Rückfrage');
    assert.equal(returned.status, 'In Prüfung');
    data.products[0].image = { ...image, name: 'Replacement.png' };
    assert.equal((await f.request('/api/import/commit', 'POST', { kind: 'all', text: JSON.stringify(data), duplicates: 'update' }, f.auth)).status, 200);
    assert.equal((await f.app.store.findProduct('P-1')).imageName, 'Replacement.png');
    assert.notEqual((await f.app.store.findProduct('P-1')).imageVersion, product.imageVersion);
    data.products[0].image = null;
    assert.equal((await f.request('/api/import/commit', 'POST', { kind: 'all', text: JSON.stringify(data), duplicates: 'update',clearEmptyFields:true }, f.auth)).status, 200);
    assert.equal((await f.app.store.db.query("SELECT COUNT(*) AS n FROM product_images", [])).rows[0].n, 0);
});
test('combined update respects return edit and status permissions before products or images change', async (t) => {
    const f = await sourceFixture(t), product = await addImage(f), data = await (await exportAll(f)).json();
    const closed=await f.app.store.findReturn('RET-1');assert.equal((await f.request('/api/returns/'+closed.id+'/reopen','POST',{statusId:12,reason:'Permission fixture',revision:closed.revision,expectedUpdatedAt:closed.updatedAt},f.auth)).status,200);
    data.products.find(p => p.sku === 'P-1').image = { ...image, name: 'Denied.png' };
    data.products.find(p => p.sku === 'P-2').name = 'Denied product';
    data.returns[0].status = 'In Prüfung';
    await f.request('/api/users', 'POST', { username: 'Importer', password: testPassword, role: 'member', permissions: { productsImport: true, returnsImport: true, productsEdit: true, returnsEdit: true, returnsStatus: false } }, f.auth);
    const member = (await f.login('Importer')).auth;
    for (const endpoint of ['preview', 'commit'])
        assert.equal((await f.request('/api/import/' + endpoint, 'POST', { kind: 'all', text: JSON.stringify(data), duplicates: 'update', createMissingMasterdata: false }, member)).status, 403);
    assert.equal((await f.app.store.findProduct('P-2')).name, 'Ohne Retoure');
    assert.equal((await f.app.store.findProduct('P-1')).imageVersion, product.imageVersion);
    assert.equal((await f.app.store.findReturn('RET-1')).status, 'Eingegangen');
    const account = (await f.app.users.list()).find(u => u.username === 'Importer');
    await f.request('/api/users/' + account.id, 'PUT', { permissions: { returnsStatus: true, returnsEdit: false } }, f.auth);
    assert.equal((await f.request('/api/import/commit', 'POST', { kind: 'all', text: JSON.stringify(data), duplicates: 'update', createMissingMasterdata: false }, member)).status, 403);
});
test('invalid images or return updates leave existing product images and records unchanged', async (t) => {
    const f = await sourceFixture(t), product = await addImage(f), original = await (await exportAll(f)).json(), audit = (await f.app.store.db.query("SELECT COUNT(*) AS n FROM audit", [])).rows[0].n;
    for (const change of [d => d.products[0].image = { name: 'Remote.png', url: 'https://example.com/private.png' }, d => d.products[0].image = { ...image, name: 'Disguised.jpg' }, d => d.products[0].image = { ...image, data: Buffer.alloc(1024 * 1024 + 1).toString('base64') }, d => d.returns[0].quantity = 0]) {
        const data = structuredClone(original);
        data.products.find(p => p.sku === 'P-1').image = { ...image, name: 'Must roll back.png' };
        data.products.find(p => p.sku === 'P-2').name = 'Must roll back';
        change(data);
        const response = await f.request('/api/import/commit', 'POST', { kind: 'all', text: JSON.stringify(data), duplicates: 'update' }, f.auth);
        assert.ok([400, 413].includes(response.status));
        assert.equal((await f.app.store.findProduct('P-2')).name, 'Ohne Retoure');
        assert.equal((await f.app.store.findProduct('P-1')).imageVersion, product.imageVersion);
        assert.equal((await f.app.store.findReturn('RET-1')).quantity, 1);
    }
    assert.equal((await f.app.store.db.query("SELECT COUNT(*) AS n FROM audit", [])).rows[0].n, audit);
});
test('a storage failure after product image updates rolls back every record, image and audit entry', async (t) => {
    const f = await sourceFixture(t), product = await addImage(f);const closed=await f.app.store.findReturn('RET-1');await f.request('/api/returns/'+closed.id+'/reopen','POST',{statusId:12,reason:'Rollback fixture',revision:closed.revision,expectedUpdatedAt:closed.updatedAt},f.auth);const data = await (await exportAll(f)).json(), audit = (await f.app.store.db.query("SELECT COUNT(*) AS n FROM audit", [])).rows[0].n;
    data.products.find(p => p.sku === 'P-1').image = { ...image, name: 'Rollback.png' };
    data.products.find(p => p.sku === 'P-2').name = 'Rollback name';
    data.returns[0].notes = 'Rollback return';
    const originalQuery = f.app.store.db.query;
    f.app.store.db.query = async function (sql, values) {
        if (/^INSERT INTO audit/i.test(sql) && values?.includes('returns') && values?.includes('update'))
            throw Error('Return audit cannot be stored');
        return originalQuery.call(this, sql, values);
    };
    await assert.rejects(async () => commitInventoryImport(f.app.store, JSON.stringify(data), { duplicates: 'update', createMissingMasterdata: true }, () => { }), /Return audit cannot be stored/);
    assert.equal((await f.app.store.findProduct('P-1')).imageVersion, product.imageVersion);
    assert.equal((await f.app.store.findProduct('P-1')).imageName, image.name);
    assert.equal((await f.app.store.findProduct('P-2')).name, 'Ohne Retoure');
    assert.equal((await f.app.store.findReturn('RET-1')).notes, '@person; Rückfrage');
    assert.equal((await f.app.store.db.query("SELECT COUNT(*) AS n FROM audit", [])).rows[0].n, audit);
});
test('combined files above the CSV size limit can round-trip several validated images while other request limits stay small', async (t) => {
    const source = await sourceFixture(t), large = Buffer.concat([png, Buffer.alloc(1024 * 1024 - png.length)]);
    for (let index = 0; index < 3; index++)
        await source.app.store.createProduct({ sku: 'LARGE-' + index, name: 'Large image ' + index, image: { name: 'Large.png', data: large.toString('base64') } });
    const text = await (await exportAll(source)).text();
    assert.ok(Buffer.byteLength(text) > 3000000);
    const target = await runtimeFixture(t), { auth } = await target.setup();
    const preview = await target.request('/api/import/preview', 'POST', { kind: 'all', text }, auth);
    assert.equal(preview.status, 200);
    assert.equal((await preview.json()).errors.length, 0);
    assert.equal((await target.request('/api/import/commit', 'POST', { kind: 'all', text }, auth)).status, 200);
    assert.equal((await target.app.store.db.query("SELECT COUNT(*) AS n FROM product_images", [])).rows[0].n, 3);
    assert.equal((await target.request('/api/login', 'POST', { username: 'Admin', password: testPassword, padding: 'x'.repeat(3000001) })).status, 413);
});
test('combined image counts and total bytes are bounded before any records are changed', async (t) => {
    const f = await sourceFixture(t), original = await (await exportAll(f)).json(), large = Buffer.concat([png, Buffer.alloc(1024 * 1024 - png.length)]).toString('base64');
    for (const products of [Array.from({ length: 1001 }, (_, i) => ({ sku: 'COUNT-' + i, name: 'Image', image })), Array.from({ length: 21 }, (_, i) => ({ sku: 'BYTES-' + i, name: 'Image', image: { name: 'Large.png', data: large } }))]) {
        const data = { ...original, products: [...original.products, ...products] };
        assert.equal((await f.request('/api/import/commit', 'POST', { kind: 'all', text: JSON.stringify(data), duplicates: 'update' }, f.auth)).status, 413);
        assert.equal((await f.app.store.listProducts()).length, 2);
        assert.equal((await f.app.store.db.query("SELECT COUNT(*) AS n FROM product_images", [])).rows[0].n, 0);
    }
});
test('combined export and import require both data permissions and the applicable create permissions', async (t) => {
    const f = await sourceFixture(t), text = await (await exportAll(f)).text();
    await f.request('/api/users', 'POST', { username: 'member', displayName: 'Member', password: testPassword, role: 'member', permissions: { productsExport: false, productsImport: false } }, f.auth);
    const member = (await f.login('member')).auth;
    assert.equal((await f.request('/api/export/all', 'GET', undefined, member)).status, 403);
    assert.equal((await f.request('/api/import/preview', 'POST', { kind: 'auto', text }, member)).status, 403);
    assert.equal((await f.request('/api/export/all')).status, 401);
    const user = (await f.app.users.list()).find(u => u.username === 'member');
    await f.request('/api/users/' + user.id, 'PUT', { permissions: { productsImport: true, productsExport: true, productsCreate: false, productsEdit: false } }, f.auth);
    const data = JSON.parse(text);
    data.products.push({ sku: 'FORBIDDEN', name: 'Forbidden', priceCents: 0, active: true });
    assert.equal((await f.request('/api/import/commit', 'POST', { kind: 'all', text: JSON.stringify(data), duplicates: 'skip', createMissingMasterdata: false }, member)).status, 403);
    assert.equal(await f.app.store.findProduct('FORBIDDEN'), null);
});
test('unknown formats, currencies, duplicate SKUs and invalid timestamps cannot commit a combined file', async (t) => {
    const f = await sourceFixture(t), original = await (await exportAll(f)).json(), before = (await f.app.store.listProducts()).length;
    for (const change of [d => d.formatVersion = 99, d => d.currency = 'USD', d => d.products.push({ ...d.products[0] }), d => d.returns[0].createdAt = 'invalid', d => d.returns[0].sku = 'UNKNOWN']) {
        const data = structuredClone(original);
        change(data);
        assert.equal((await f.request('/api/import/commit', 'POST', { kind: 'all', text: JSON.stringify(data) }, f.auth)).status, 400);
        assert.equal((await f.app.store.listProducts()).length, before);
        assert.equal((await f.app.store.listReturns()).length, 1);
    }
});
test('historical import options cannot bypass archived-product checks through the normal return API', async (t) => {
    const f = await sourceFixture(t), product = await f.app.store.findProduct('P-1');
    const response = await f.request('/api/returns', 'POST', { productId: product.id, serialNumber: 'SN-BYPASS', allowArchivedProduct: true, allowArchivedReferences: true }, f.auth);
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /Archivierte Produkte/);
    assert.equal((await f.app.store.listReturns()).length, 1);
});
