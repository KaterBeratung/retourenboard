import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import { runtimeFixture, testPassword } from './helpers/runtime.js';
import { enableMfa } from './helpers/mfa.js';
test('own profile and appearance are editable without granting admin rights', async (t) => {
    const f = await runtimeFixture(t), { auth } = await f.setup();
    await f.request('/api/users', 'POST', { username: 'Viewer', password: testPassword, role: 'viewer' }, auth);
    const viewer = (await f.login('Viewer')).auth;
    const save = await f.request('/api/account/profile', 'PUT', { displayName: 'Leserin' }, viewer);
    assert.equal(save.status, 200);
    assert.equal((await save.json()).displayName, 'Leserin');
    assert.equal((await f.request('/api/account/profile', 'PUT', { role: 'admin' }, viewer)).status, 400);
    assert.equal((await f.request('/api/account/preferences', 'PUT', { theme: 'dark', reduceMotion: true }, viewer)).status, 200);
    assert.deepEqual(await (await f.request('/api/account/preferences', 'GET', undefined, viewer)).json(), { theme: 'dark', reduceMotion: true });
});
test('session overview and revocation cannot expose or revoke another account', async (t) => {
    const f = await runtimeFixture(t), { auth } = await f.setup(), second = await f.login('Admin');
    await f.request('/api/users', 'POST', { username: 'Worker', password: testPassword }, auth);
    const worker = await f.login('Worker');
    const list = await f.request('/api/account/sessions', 'GET', undefined, auth);
    assert.equal(list.status, 200);
    const sessions = await list.json();
    assert.equal(sessions.length, 2);
    assert.equal(sessions.filter(x => x.current).length, 1);
    assert.equal(JSON.stringify(sessions).includes('csrfToken'), false);
    assert.equal(JSON.stringify(sessions).includes(second.auth.Cookie.slice(second.auth.Cookie.indexOf('=') + 1)), false);
    const workerSessions = await (await f.request('/api/account/sessions', 'GET', undefined, worker.auth)).json();
    assert.equal((await f.request('/api/account/sessions/revoke', 'POST', { id: workerSessions[0].id, password: testPassword }, auth)).status, 404);
    assert.equal((await f.request('/api/account/sessions/revoke', 'POST', { mode: 'others', password: testPassword }, auth)).status, 200);
    assert.equal((await f.request('/api/products', 'GET', undefined, second.auth)).status, 401);
    assert.equal((await f.request('/api/products', 'GET', undefined, worker.auth)).status, 200);
});
test('personal motion modes persist, validate and remain compatible with older clients', async (t) => {
    const f = await runtimeFixture(t), { auth } = await f.setup();
    for (const motionMode of ['on', 'off', 'system']) {
        const response = await f.request('/api/account/preferences', 'PUT', { motionMode }, auth);
        assert.equal(response.status, 200);
        const saved = await response.json();
        assert.equal(saved.motionMode, motionMode);
        assert.equal(saved.reduceMotion, motionMode === 'off');
        assert.deepEqual(await (await f.request('/api/account/preferences', 'GET', undefined, auth)).json(), saved);
    }
    for (const motionMode of ['invalid', null, true, 1]) assert.equal((await f.request('/api/account/preferences', 'PUT', { motionMode }, auth)).status, 400);
    assert.equal((await (await f.request('/api/account/preferences', 'GET', undefined, auth)).json()).motionMode, 'system', 'Rejected inputs must not change stored preferences');
    await f.request('/api/account/preferences', 'PUT', { reduceMotion: true }, auth);
    assert.equal((await (await f.request('/api/account/preferences', 'GET', undefined, auth)).json()).motionMode, 'off');
    await f.request('/api/account/preferences', 'PUT', { reduceMotion: false }, auth);
    assert.equal((await (await f.request('/api/account/preferences', 'GET', undefined, auth)).json()).motionMode, 'system');
    assert.equal((await f.request('/api/account/preferences', 'PUT', { motionMode: 'on', reduceMotion: true }, auth)).status, 400, 'Conflicting old and new preferences are rejected');
});
test('MFA blocks password changes and disabling without a second factor', async (t) => {
    const now = 1791374400000, f = await runtimeFixture(t, { now: () => now }), { auth } = await f.setup(), mfa = await enableMfa(f, auth, now);
    assert.equal((await f.request('/api/account/password', 'POST', { currentPassword: testPassword, newPassword: 'NeuesTest-Passwort!' }, mfa.auth)).status, 401);
    assert.equal((await f.request('/api/account/mfa/disable', 'POST', { password: testPassword }, mfa.auth)).status, 401);
    assert.equal((await f.request('/api/account/mfa/disable', 'POST', { password: testPassword, factor: mfa.recoveryCodes[0] }, mfa.auth)).status, 200);
});
