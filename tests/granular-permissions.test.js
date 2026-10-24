import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import { runtimeFixture, testPassword } from './helpers/runtime.js';
async function worker(f, auth, permissions, username = 'Worker') {
    const response = await f.request('/api/users', 'POST', { username, password: testPassword, permissions }, auth);
    assert.equal(response.status, 201, await response.clone().text());
    return { user: await response.json(), auth: (await f.login(username)).auth };
}
async function inventory(f, auth) {
    const product = await (await f.request('/api/products', 'POST', { sku: 'TEST-1', name: 'Monitor' }, auth)).json();
    const ret = await (await f.request('/api/returns', 'POST', { productId: product.id, serialNumber: 'SN-1',resolutionId:17 }, auth)).json();
    return { product, ret };
}
test('creation and editing are independent for products and returns', async (t) => {
    const f = await runtimeFixture(t), { auth } = await f.setup(), { product, ret } = await inventory(f, auth);
    const w = await worker(f, auth, { productsCreate: false, productsEdit: false, productsDelete: false, returnsCreate: true, returnsEdit: false, returnsDelete: false });
    assert.equal((await f.request('/api/products', 'POST', { sku: 'OTHER', name: 'Other' }, w.auth)).status, 403);
    assert.equal((await f.request(`/api/products/${product.id}`, 'PUT', { ...product, name: 'Changed' }, w.auth)).status, 403);
    assert.equal((await f.request(`/api/products/${product.id}`, 'DELETE', undefined, w.auth)).status, 403);
    assert.equal((await f.request('/api/returns', 'POST', { productId: product.id, serialNumber: 'SN-2' }, w.auth)).status, 201);
    assert.equal((await f.request(`/api/returns/${ret.id}`, 'PUT', { ...ret, notes: 'Changed' }, w.auth)).status, 403);
    assert.equal((await f.request(`/api/returns/${ret.id}`, 'DELETE', {revision:ret.revision}, w.auth)).status, 403);
    assert.equal((await f.request('/api/products', 'GET', undefined, w.auth)).status, 200);
    assert.equal((await f.request('/api/returns', 'GET', undefined, w.auth)).status, 200);
});
test('status-only permission changes status without changing any other return field', async (t) => {
    const f = await runtimeFixture(t), { auth } = await f.setup(), { ret } = await inventory(f, auth);
    const w = await worker(f, auth, { returnsEdit: false, returnsStatus: true });
    const change = await f.request(`/api/returns/${ret.id}/status`, 'PUT', { status: 'In Prüfung',revision:ret.revision }, w.auth);
    assert.equal(change.status, 200, await change.clone().text());
    const updated = await change.json();
    assert.equal(updated.status, 'In Prüfung');
    assert.equal(updated.serialNumber, 'SN-1');
    assert.equal((await f.request(`/api/returns/${ret.id}/status`, 'PUT', { status: 'Abgeschlossen', notes: 'Bypass',revision:updated.revision }, w.auth)).status, 400);
    assert.equal((await f.request(`/api/returns/${ret.id}`, 'PUT', { ...updated, notes: 'Bypass' }, w.auth)).status, 403);
    await f.request(`/api/users/${w.user.id}`, 'PUT', { permissions: { returnsStatus: false, returnsEdit: true } }, auth);
    assert.equal((await f.request(`/api/returns/${ret.id}/status`, 'PUT', { status: 'Abgeschlossen' }, w.auth)).status, 403);
    assert.equal((await f.request(`/api/returns/${ret.id}`, 'PUT', { ...updated, notes: 'Allowed' }, w.auth)).status, 200);
    assert.equal((await f.request(`/api/returns/${ret.id}`, 'PUT', { ...await f.app.store.getReturn(ret.id), status: 'Abgeschlossen', statusId: undefined }, w.auth)).status, 403);
});
test('CSV permissions distinguish resources and cannot bypass disabled creation or editing', async (t) => {
    const f = await runtimeFixture(t), { auth } = await f.setup(), { product } = await inventory(f, auth);
    const w = await worker(f, auth, { productsImport: true, productsCreate: true, productsEdit: false, productsExport: false, returnsImport: false, returnsExport: true });
    assert.equal((await f.request('/api/export/products', 'GET', undefined, w.auth)).status, 403);
    assert.equal((await f.request('/api/export/returns', 'GET', undefined, w.auth)).status, 200);
    assert.equal((await f.request('/api/template/products', 'GET', undefined, w.auth)).status, 200);
    assert.equal((await f.request('/api/template/returns', 'GET', undefined, w.auth)).status, 403);
    const payload = { kind: 'products', text: 'sku;name\nTEST-1;Overwritten', mapping: { sku: 0, name: 1 }, duplicates: 'update' };
    for (const stage of ['preview', 'commit'])
        assert.equal((await f.request('/api/import/' + stage, 'POST', payload, w.auth)).status, 403, stage);
    assert.equal((await f.app.store.getProduct(product.id)).name, 'Monitor');
    await f.request(`/api/users/${w.user.id}`, 'PUT', { permissions: { productsCreate: false, productsEdit: true } }, auth);
    const mixed = { ...payload, text: 'sku;name\nTEST-1;Overwritten\nNEW;New product' };
    assert.equal((await f.request('/api/import/commit', 'POST', mixed, w.auth)).status, 403);
    assert.equal((await f.app.store.getProduct(product.id)).name, 'Monitor', 'Denied mixed import rolls back all rows');
    assert.equal(await f.app.store.findProduct('NEW'), null);
    assert.equal((await f.request('/api/import/commit', 'POST', payload, w.auth)).status, 200);
    assert.equal((await f.request('/api/import/preview', 'POST', { kind: 'returns', text: 'sku;serialNumber\nTEST-1;SN-3', mapping: { sku: 0, serialNumber: 1 } }, w.auth)).status, 403);
});
test('attachment access, upload and deletion are independent and existing sessions honor revocation', async (t) => {
    const f = await runtimeFixture(t), { auth } = await f.setup(), { ret } = await inventory(f, auth);
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082', 'hex');
    const upload = async (who) => fetch(f.base + `/api/returns/${ret.id}/attachments`, { method: 'POST', headers: { Origin: f.base, ...who, 'Content-Type': 'image/png', 'X-File-Name': 'photo.png' }, body: png });
    const file = await (await upload(auth)).json();
    const w = await worker(f, auth, { attachmentsView: false, attachmentsUpload: false, attachmentsDelete: false, returnsDelete: true });
    assert.equal((await (await f.request(`/api/returns/${ret.id}`, 'GET', undefined, w.auth)).json()).attachmentCount, 1, 'Inventory supplies only the count so deletion controls can reflect restricted attachments');
    for (const path of [`/api/returns/${ret.id}/attachments`, `/api/attachments/${file.id}/preview`, `/api/attachments/${file.id}/download`]) {
        assert.equal((await f.request(path, 'GET', undefined, w.auth)).status, 403, path);
        if (path.includes('/api/attachments/'))
            assert.equal((await f.request(path, 'HEAD', undefined, w.auth)).status, 403, path);
    }
    assert.equal((await upload(w.auth)).status, 403);
    assert.equal((await f.request(`/api/attachments/${file.id}`, 'DELETE', undefined, w.auth)).status, 403);
    assert.equal((await f.request(`/api/returns/${ret.id}`, 'DELETE', {revision:ret.revision}, w.auth)).status, 403, 'Deleting a return must not bypass attachment deletion rights');
    await f.request(`/api/users/${w.user.id}`, 'PUT', { permissions: { attachmentsView: true, attachmentsUpload: true } }, auth);
    assert.equal((await f.request(`/api/attachments/${file.id}/preview`, 'GET', undefined, w.auth)).status, 200);
    assert.equal((await upload(w.auth)).status, 201);
    const session = await (await f.request('/api/session', 'GET', undefined, w.auth)).json();
    assert.equal(session.user.permissions.attachmentsDelete, false);
    assert.equal(session.user.permissions.attachmentsUpload, true);
});
test('delegated audit users can list actors without receiving account management data', async (t) => {
    const f = await runtimeFixture(t), { auth, data } = await f.setup(), w = await worker(f, auth, { auditView: true });
    await f.request('/api/products', 'POST', { sku: 'ACTOR', name: 'Audit record' }, w.auth);
    const response = await f.request('/api/admin/audit/actors', 'GET', undefined, w.auth);
    assert.equal(response.status, 200);
    const actors = await response.json();
    assert.ok(actors.some(actor => actor.id === w.user.id && actor.name === 'Worker'));
    assert.equal(actors.some(actor => Object.keys(actor).some(key => !['id', 'name'].includes(key))), false);
    assert.equal((await f.request('/api/users', 'GET', undefined, w.auth)).status, 403);
    await f.request(`/api/users/${w.user.id}`, 'PUT', { permissions: { auditView: false } }, auth);
    assert.equal((await f.request('/api/admin/audit/actors', 'GET', undefined, w.auth)).status, 403);
});
test('permission validation rejects unknown values and a member cannot assign rights to itself', async (t) => {
    const f = await runtimeFixture(t), { auth } = await f.setup(), w = await worker(f, auth, { productsCreate: false });
    for (const permissions of [{ productsCreate: 'yes' }, { productsCreate: null }, { unknown: true }])
        assert.equal((await f.request(`/api/users/${w.user.id}`, 'PUT', { permissions }, auth)).status, 400);
    assert.equal((await f.request(`/api/users/${w.user.id}`, 'PUT', { role: 'admin', permissions: { productsCreate: true } }, w.auth)).status, 403);
    assert.equal((await f.request('/api/admin/settings', 'GET', undefined, w.auth)).status, 403);
    assert.equal((await f.request(`/api/users/${w.user.id}`, 'PUT', { displayName: 'Renamed' }, auth)).status, 200);
    assert.equal((await (await f.request('/api/session', 'GET', undefined, w.auth)).json()).user.permissions.productsCreate, false, 'Unrelated account edit preserves permission overrides');
});
test('delegated administration is limited to explicitly granted sections and is revocable', async (t) => {
    const f = await runtimeFixture(t), { auth } = await f.setup();
    const w = await worker(f, auth, { masterdataManage: true, csvProfilesManage: true, rulesManage: true, auditView: true, diagnosticsView: true });
    for (const path of ['/api/admin/csv-profiles', '/api/admin/rules', '/api/admin/audit', '/api/admin/diagnostics'])
        assert.equal((await f.request(path, 'GET', undefined, w.auth)).status, 200, path);
    const master = await f.request('/api/masterdata/suppliers', 'POST', { name: 'Delegated supplier', notes: 'Internal note' }, w.auth);
    assert.equal(master.status, 201);
    const suppliers = (await (await f.request('/api/masterdata', 'GET', undefined, w.auth)).json()).suppliers;
    assert.equal(suppliers.find(x => x.name === 'Delegated supplier').notes, 'Internal note');
    assert.equal((await f.request('/api/admin/rules', 'PUT', { deadlineDays: 21 }, w.auth)).status, 200);
    for (const path of ['/api/users', '/api/admin/settings', '/api/admin/backups', '/api/admin/backups/list', '/api/admin/notifications'])
        assert.equal((await f.request(path, 'GET', undefined, w.auth)).status, 403, path);
    await f.request(`/api/users/${w.user.id}`, 'PUT', { permissions: { masterdataManage: false, rulesManage: false, auditView: false } }, auth);
    assert.equal((await f.request('/api/admin/rules', 'PUT', { deadlineDays: 22 }, w.auth)).status, 403);
    assert.equal((await f.request('/api/masterdata/suppliers', 'POST', { name: 'Denied' }, w.auth)).status, 403);
    assert.equal((await f.request('/api/admin/audit', 'GET', undefined, w.auth)).status, 403);
    assert.equal((await f.request('/api/admin/csv-profiles', 'GET', undefined, w.auth)).status, 200);
});
test('viewer keeps read-only behavior even when edit or management flags are submitted', async (t) => {
    const f = await runtimeFixture(t), { auth } = await f.setup();
    const res = await f.request('/api/users', 'POST', { username: 'Viewer', password: testPassword, role: 'viewer', permissions: { productsCreate: true, returnsStatus: true, masterdataManage: true, auditView: true, productsExport: true } }, auth);
    assert.equal(res.status, 201);
    const user = await res.json(), viewer = (await f.login('Viewer')).auth;
    assert.equal(user.permissions.productsCreate, false);
    assert.equal(user.permissions.returnsStatus, false);
    assert.equal(user.permissions.masterdataManage, false);
    assert.equal((await f.request('/api/admin/audit', 'GET', undefined, viewer)).status, 200);
    assert.equal((await f.request('/api/export/products', 'GET', undefined, viewer)).status, 200);
    assert.equal((await f.request('/api/export/returns', 'GET', undefined, viewer)).status, 403);
});
test('legacy flags survive migration and unrelated updates while admin sections remain off', async (t) => {
    const f = await runtimeFixture(t), { auth } = await f.setup(), w = await worker(f, auth, {});
    await f.app.store.db.query("UPDATE users SET canDelete=0,canImport=0,canExport=1,permissionOverrides='{}' WHERE id=$1", [w.user.id]);
    const before = await f.app.users.credentialsById(w.user.id);
    assert.equal((await f.request('/api/export/products', 'GET', undefined, w.auth)).status, 200);
    assert.equal((await f.request('/api/template/products', 'GET', undefined, w.auth)).status, 403);
    assert.equal((await f.request('/api/admin/rules', 'GET', undefined, w.auth)).status, 403);
    const result = await f.request(`/api/users/${w.user.id}`, 'PUT', { displayName: 'After migration' }, auth);
    assert.equal(result.status, 200);
    const after = await f.app.users.credentialsById(w.user.id);
    assert.equal(after.passwordHash, before.passwordHash);
    assert.equal(after.id, before.id);
    assert.equal((await result.json()).permissions.productsDelete, false);
    assert.equal((await f.app.users.get(w.user.id)).permissions.returnsImport, false);
    assert.equal((await f.app.users.get(w.user.id)).permissions.rulesManage, false);
});
test('queued writes recheck individual permissions after revocation', async (t) => {
    const f = await runtimeFixture(t), { auth } = await f.setup(), w = await worker(f, auth, { productsCreate: true });
    let release;
    const block = f.app.coordinator.run(() => new Promise(resolve => release = resolve));
    await new Promise(resolve => setImmediate(resolve));
    let arrived;
    const arrival = new Promise(resolve => arrived = resolve), run = f.app.coordinator.run;
    f.app.coordinator.run = async (job) => { arrived(); return run(job); };
    const pending = f.request('/api/products', 'POST', { sku: 'LATE', name: 'Must not be created' }, w.auth);
    await arrival;
    await f.app.users.update(w.user.id, { permissions: { productsCreate: false } });
    release();
    await block;
    assert.equal((await pending).status, 403);
    assert.equal(await f.app.store.findProduct('LATE'), null);
});
test('disabled product archive/delete right also blocks archival through editing and CSV', async (t) => {
    const f = await runtimeFixture(t), { auth } = await f.setup(), { product } = await inventory(f, auth), w = await worker(f, auth, { productsEdit: true, productsImport: true, productsDelete: false });
    assert.equal((await f.request(`/api/products/${product.id}`, 'PUT', { ...product, active: false }, w.auth)).status, 403);
    const payload = { kind: 'products', text: 'sku;name;active\nTEST-1;Archived;nein', mapping: { sku: 0, name: 1, active: 2 }, duplicates: 'update' };
    for (const stage of ['preview', 'commit'])
        assert.equal((await f.request('/api/import/' + stage, 'POST', payload, w.auth)).status, 403);
    assert.equal((await f.app.store.getProduct(product.id)).active, true);
    assert.equal((await f.request(`/api/products/${product.id}`, 'PUT', { ...product, name: 'Edited' }, w.auth)).status, 200);
    await f.request(`/api/users/${w.user.id}`, 'PUT', { permissions: { productsDelete: true } }, auth);
    assert.equal((await f.request('/api/import/commit', 'POST', payload, w.auth)).status, 200);
    assert.equal((await f.app.store.getProduct(product.id)).active, false);
});
