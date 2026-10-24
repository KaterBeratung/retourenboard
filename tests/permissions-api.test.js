import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import { runtimeFixture, testPassword } from './helpers/runtime.js';
test('viewer reads inventory but cannot mutate, import, export or administer', async (t) => {
    const { request, setup, login } = await runtimeFixture(t), { auth } = await setup();
    const created = await request('/api/users', 'POST', { username: 'Viewer', password: testPassword, role: 'viewer' }, auth);
    assert.equal(created.status, 201);
    const viewer = (await login('Viewer')).auth;
    assert.equal((await request('/api/products', 'GET', undefined, viewer)).status, 200);
    for (const [url, method, body] of [['/api/products', 'POST', { sku: 'A', name: 'A' }], ['/api/import/preview', 'POST', {}], ['/api/export/products', 'GET'], ['/api/admin/settings', 'GET']])
        assert.equal((await request(url, method, body, viewer)).status, 403, url);
});
test('individual rights apply to direct endpoints and change existing sessions', async (t) => {
    const { request, setup, login } = await runtimeFixture(t), { auth } = await setup();
    const worker = await (await request('/api/users', 'POST', { username: 'Worker', password: testPassword, permissions: { delete: false, import: false, export: false } }, auth)).json();
    const member = (await login('Worker')).auth;
    const product = await (await request('/api/products', 'POST', { sku: 'A', name: 'A' }, member)).json();
    assert.equal((await request(`/api/products/${product.id}`, 'DELETE', undefined, member)).status, 403);
    assert.equal((await request('/api/export/products', 'GET', undefined, member)).status, 403);
    assert.equal((await request('/api/template/products', 'GET', undefined, member)).status, 403);
    assert.equal((await request('/api/import/preview', 'POST', {}, member)).status, 403);
    await request(`/api/users/${worker.id}`, 'PUT', { permissions: { export: true } }, auth);
    assert.equal((await request('/api/export/products', 'GET', undefined, member)).status, 200);
    const session = await (await request('/api/session', 'GET', undefined, member)).json();
    assert.equal(session.user.capabilities.export, true);
});
