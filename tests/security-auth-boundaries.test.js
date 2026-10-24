import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import { runtimeFixture, testPassword } from './helpers/runtime.js';
import { enableMfa } from './helpers/mfa.js';
import { createAccountSettings } from '../dist/server/account-settings.js';
const forwarded = address => ({ 'X-Forwarded-For': address });
const login = (f, username, password, address) => f.request('/api/login', 'POST', { username, password }, {}, forwarded(address));
test('the anonymous login frontend can load its authentication-context module', async (t) => {
    const f = await runtimeFixture(t), response = await fetch(f.base + '/auth-context.js');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^text\/javascript/);
});
test('trusted proxy login budgets isolate client/account pairs, normalize names and expire', async (t) => {
    let now = 1791374400000;
    const f = await runtimeFixture(t, { now: () => now, trustedProxies: ['127.0.0.1', '::1'] }), { auth } = await f.setup();
    await f.request('/api/users', 'POST', { username: 'Worker', password: testPassword }, auth);
    for (let i = 0; i < 10; i++)
        assert.equal((await login(f, i % 2 ? ' ADMIN ' : 'admin', 'wrong', `192.0.2.${i + 1}, 198.51.100.10`)).status, 401);
    assert.equal((await login(f, 'Admin', testPassword, '198.51.100.10')).status, 429);
    assert.equal((await login(f, 'Worker', testPassword, '198.51.100.10')).status, 200, 'another account on the same client remains usable');
    assert.equal((await login(f, 'Admin', testPassword, '198.51.100.11')).status, 200, 'another proxy client remains usable');
    assert.equal((await login(f, 'Admin', testPassword, '198.51.100.10')).status, 429, 'another pair cannot clear this budget');
    now += 900001;
    assert.equal((await login(f, 'Admin', testPassword, '198.51.100.10')).status, 200);
});
test('untrusted clients cannot rotate a login budget with forged forwarded headers', async (t) => {
    const f = await runtimeFixture(t);
    await f.setup();
    for (let i = 0; i < 10; i++)
        assert.equal((await login(f, 'Admin', 'wrong', `198.51.100.${i + 1}`)).status, 401);
    assert.equal((await login(f, 'Admin', testPassword, '203.0.113.200')).status, 429);
});
test('MFA challenges use the same trusted client boundary as password login', async (t) => {
    const now = 1791374400000, f = await runtimeFixture(t, { now: () => now, trustedProxies: ['127.0.0.1'] }), { auth } = await f.setup(), mfa = await enableMfa(f, auth, now);
    const first = await (await login(f, 'Admin', testPassword, '198.51.100.10')).json();
    assert.equal(first.mfaRequired, true);
    const other = await f.request('/api/login/mfa', 'POST', { challengeId: first.challengeId, code: mfa.recoveryCodes[0] }, {}, forwarded('198.51.100.11'));
    assert.equal(other.status, 401, 'another proxy client cannot finish this challenge');
    const next = await (await login(f, 'Admin', testPassword, '198.51.100.10')).json();
    const same = await f.request('/api/login/mfa', 'POST', { challengeId: next.challengeId, code: mfa.recoveryCodes[0] }, {}, forwarded('198.51.100.10'));
    assert.equal(same.status, 200);
    assert.equal((await same.json()).unlocked, true);
});
test('audit-only readers cannot receive or search master-data internals, managers retain them', async (t) => {
    const f = await runtimeFixture(t), { auth } = await f.setup();
    for (const [username, masterdataManage] of [['Auditor', false], ['Manager', true]])
        await f.request('/api/users', 'POST', { username, password: testPassword, permissions: { auditView: true, masterdataManage } }, auth);
    const auditor = (await f.login('Auditor')).auth, manager = (await f.login('Manager')).auth;
    const privateCode = 'PRIVATE-CODE-975231', privateNotes = 'PRIVATE-NOTES-975231';
    const created = await (await f.request('/api/masterdata/suppliers', 'POST', { name: 'Visible supplier', code: privateCode, notes: privateNotes }, auth)).json();
    await f.request(`/api/masterdata/${created.id}`, 'PUT', { name: 'Visible supplier updated', code: privateCode + '-changed', notes: privateNotes + '-changed' }, auth);
    const product = await (await f.request('/api/products', 'POST', { sku: 'AUDIT', name: 'Shared' }, auth)).json();
    await f.request('/api/returns', 'POST', { productId: product.id, serialNumber: 'AUDIT-SN', notes: privateNotes }, auth);
    const visible = await (await f.request('/api/admin/audit?entity=masterdata', 'GET', undefined, auditor)).json();
    assert.equal(visible.total, 2);
    for (const entry of visible.items) {
        assert.equal(entry.changes.code, undefined);
        assert.equal(entry.changes.notes, undefined);
    }
    for (const secret of [privateCode, privateNotes]) {
        const query = `/api/admin/audit?entity=masterdata&query=${encodeURIComponent(secret)}&pageSize=10`;
        const hidden = await (await f.request(query, 'GET', undefined, auditor)).json();
        assert.equal(hidden.total, 0);
        assert.deepEqual(hidden.items, []);
        const full = await (await f.request(query, 'GET', undefined, manager)).json();
        assert.equal(full.total, 2);
        assert.equal(full.items.length, 2);
    }
    assert.equal((await (await f.request('/api/admin/audit?entity=masterdata&query=Visible', 'GET', undefined, auditor)).json()).total, 2);
    assert.equal((await (await f.request('/api/admin/audit?entity=returns&query=' + privateNotes, 'GET', undefined, auditor)).json()).total, 1, 'shared return notes remain searchable');
    const managerHistory = await (await f.request('/api/admin/audit?entity=masterdata', 'GET', undefined, manager)).json();
    assert.equal(managerHistory.items[0].changes.code.before, privateCode);
    const managerId = (await f.app.users.credentialsByName('Manager')).id;
    assert.equal((await f.request(`/api/users/${managerId}`, 'PUT', { permissions: { masterdataManage: false } }, auth)).status, 200);
    const revoked = await (await f.request('/api/admin/audit?entity=masterdata&query=' + privateCode, 'GET', undefined, manager)).json();
    assert.equal(revoked.total, 0);
    assert.deepEqual(revoked.items, [], 'existing sessions honor fresh master-data rights');
});
test('identity failures share one account budget across sessions and security routes', async (t) => {
    let now = 1791374400000;
    const f = await runtimeFixture(t, { now: () => now }), { auth } = await f.setup(), second = (await f.login('Admin')).auth;
    const worker = await (await f.request('/api/users', 'POST', { username: 'Worker', password: testPassword }, auth)).json(), workerAuth = (await f.login('Worker')).auth;
    const actions = [
        ['/api/account/mfa/setup', { password: 'wrong' }],
        ['/api/account/mfa/disable', { password: 'wrong' }],
        ['/api/account/mfa/recovery-codes', { password: 'wrong' }],
        ['/api/account/sessions/revoke', { mode: 'others', password: 'wrong' }],
        ['/api/account/password', { currentPassword: 'wrong', newPassword: 'ReplacementPassword123!' }],
        [`/api/users/${worker.id}/mfa/reset`, { confirmed: true, password: 'wrong' }]
    ];
    for (let i = 0; i < 10; i++) {
        const [path, body] = actions[i % actions.length];
        assert.equal((await f.request(path, 'POST', body, i % 2 ? auth : second)).status, 401);
    }
    assert.equal((await f.request('/api/account/sessions/revoke', 'POST', { mode: 'others', password: testPassword }, auth)).status, 429);
    assert.equal((await f.request('/api/account/mfa/setup', 'POST', { password: testPassword }, workerAuth)).status, 200, 'another account retains its identity budget');
    now += 900001;
    assert.equal((await f.request('/api/account/sessions/revoke', 'POST', { mode: 'others', password: testPassword }, auth)).status, 200);
});
test('an invalid factor cannot reset accumulated password identity failures', async (t) => {
    const now = 1791374400000, f = await runtimeFixture(t, { now: () => now }), { auth } = await f.setup(), mfa = await enableMfa(f, auth, now);
    for (let i = 0; i < 9; i++)
        assert.equal((await f.request('/api/account/mfa/recovery-codes', 'POST', { password: 'wrong' }, mfa.auth)).status, 401);
    assert.equal((await f.request('/api/account/sessions/revoke', 'POST', { mode: 'others', password: testPassword, factor: 'invalid' }, mfa.auth)).status, 401);
    assert.equal((await f.request('/api/account/mfa/recovery-codes', 'POST', { password: testPassword, factor: mfa.recoveryCodes[0] }, mfa.auth)).status, 429);
});
test('MFA factor failures for one account do not block another account security operation', async (t) => {
    const now = 1791374400000, f = await runtimeFixture(t, { now: () => now }), { auth } = await f.setup();
    await f.request('/api/users', 'POST', { username: 'Worker', password: testPassword }, auth);
    const workerAuth = (await f.login('Worker')).auth, admin = await enableMfa(f, auth, now), worker = await enableMfa(f, workerAuth, now);
    for (let i = 0; i < 10; i++)
        assert.equal((await f.request('/api/account/sessions/revoke', 'POST', { mode: 'others', password: testPassword, factor: 'invalid' }, admin.auth)).status, 401);
    assert.equal((await f.request('/api/account/sessions/revoke', 'POST', { mode: 'others', password: testPassword, factor: worker.recoveryCodes[0] }, worker.auth)).status, 200);
});
test('identity reservations bound concurrent password checks before awaiting hashing', async (t) => {
    const f = await runtimeFixture(t);
    const { data } = await f.setup(), settings = createAccountSettings(f.app.store.db, f.app.users, f.app.mfa, { now: () => 1791374400000 });
    const attempts = await Promise.allSettled(Array.from({ length: 11 }, async () => settings.verifyIdentity(data.user.id, 'wrong', '', () => { })));
    assert.equal(attempts.filter(result => result.status === 'rejected' && result.reason.status === 401).length, 10);
    assert.equal(attempts.filter(result => result.status === 'rejected' && result.reason.status === 429).length, 1);
});
