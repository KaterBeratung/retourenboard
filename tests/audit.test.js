import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import { runtimeFixture, testPassword } from './helpers/runtime.js';
test('audit tracks actor and before after values through creation update and deletion', async (t) => {
    const f = await runtimeFixture(t), { auth } = await f.setup();
    const p = await (await f.request('/api/products', 'POST', { sku: 'A', name: 'Alt' }, auth)).json();
    const saved=await (await f.request(`/api/products/${p.id}`, 'PUT', { ...p, name: 'Neu' }, auth)).json();
    await f.request(`/api/products/${p.id}`, 'DELETE', {revision:saved.revision}, auth);
    const response = await f.request('/api/admin/audit?entity=products', 'GET', undefined, auth);
    assert.equal(response.status, 200);
    const audit = await response.json();
    assert.equal(audit.total, 3);
    assert.equal(audit.items[0].action, 'delete');
    assert.equal(audit.items[0].actorName, 'Test Admin');
    assert.equal(audit.items[1].changes.name.before, 'Alt');
    assert.equal(audit.items[1].changes.name.after, 'Neu');
});
test('failed imports leave no successful audit and successful import shares an operation id', async (t) => {
    const f = await runtimeFixture(t), { auth } = await f.setup(), payload = { kind: 'products', text: 'SKU;Name\nA;Eins\nB;', mapping: { sku: 0, name: 1 }, duplicates: 'error' };
    assert.equal((await f.request('/api/import/commit', 'POST', payload, auth)).status, 400);
    assert.equal((await (await f.request('/api/admin/audit?entity=products', 'GET', undefined, auth)).json()).total, 0);
    await f.request('/api/import/commit', 'POST', { ...payload, text: 'SKU;Name\nA;Eins\nB;Zwei' }, auth);
    const entries = (await (await f.request('/api/admin/audit?entity=products', 'GET', undefined, auth)).json()).items;
    assert.equal(entries.length, 2);
    assert.ok(entries[0].operationId);
    assert.equal(entries[0].operationId, entries[1].operationId);
});
test('security action audit never contains passwords hashes factors or sessions', async (t) => {
    const f = await runtimeFixture(t), { auth } = await f.setup();
    await f.request('/api/users', 'POST', { username: 'Worker', password: testPassword }, auth);
    const worker = await f.app.users.credentialsByName('Worker');
    await f.request(`/api/users/${worker.id}`, 'PUT', { password: 'ChangedPasswordSecret!' }, auth);
    const text = await (await f.request('/api/admin/audit', 'GET', undefined, auth)).text();
    assert.ok(JSON.parse(text).total >= 2);
    for (const secret of [testPassword, 'ChangedPasswordSecret!', worker.passwordHash, worker.passwordSalt, auth['X-CSRF-Token']])
        assert.equal(text.includes(secret), false);
    const member = (await f.login('Worker', 'ChangedPasswordSecret!')).auth;
    assert.equal((await f.request('/api/admin/audit', 'GET', undefined, member)).status, 403);
    assert.equal((await f.request('/api/admin/audit')).status, 401);
});
