import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import { unlinkSync } from 'node:fs';
import { createApp } from './helpers/postgres-fixtures.js';
import { join } from 'node:path';
import { runtimeFixture, testPassword } from './helpers/runtime.js';
import { enableMfa, appCode } from './helpers/mfa.js';
test('password challenge cannot access inventory and activation revokes older sessions', async (t) => {
    let now = 1791374400000;
    const f = await runtimeFixture(t, { now: () => now }), first = await f.setup();
    const second = await f.login('Admin');
    const mfa = await enableMfa(f, first.auth, now);
    assert.equal((await f.request('/api/products', 'GET', undefined, second.auth)).status, 401);
    const challenge = await f.login('Admin');
    assert.equal(challenge.data.mfaRequired, true);
    assert.equal(challenge.res.headers.get('set-cookie'), null);
    for (const path of ['/api/products', '/api/returns', '/api/account/profile', '/api/admin/settings', '/api/export/products', '/api/attachments/1/download'])
        assert.equal((await f.request(path, 'GET', undefined, challenge.auth)).status, 401, path);
    now += 30000;
    const finish = await f.request('/api/login/mfa', 'POST', { challengeId: challenge.data.challengeId, code: appCode(mfa.secret, now) });
    assert.equal(finish.status, 200);
    const data = await finish.json();
    assert.equal(data.unlocked, true);
    assert.equal((await f.request('/api/products', 'GET', undefined, f.authFrom(finish, data))).status, 200);
});
test('recovery and app codes are consumed once including concurrent requests', async (t) => {
    let now = 1791374400000;
    const f = await runtimeFixture(t, { now: () => now }), { auth } = await f.setup(), mfa = await enableMfa(f, auth, now);
    const a = await f.login('Admin'), b = await f.login('Admin');
    const results = await Promise.all([a, b].map(async (c) => f.request('/api/login/mfa', 'POST', { challengeId: c.data.challengeId, code: mfa.recoveryCodes[0] })));
    assert.deepEqual(results.map(r => r.status).sort(), [200, 401]);
    now += 30000;
    const c = await f.login('Admin'), d = await f.login('Admin');
    const codes = await Promise.all([c, d].map(async (x) => f.request('/api/login/mfa', 'POST', { challengeId: x.data.challengeId, code: appCode(mfa.secret, now) })));
    assert.deepEqual(codes.map(r => r.status).sort(), [200, 401]);
    assert.equal((await f.app.store.db.query("SELECT COUNT(*) AS n FROM recovery_codes WHERE usedAt IS NULL", [])).rows[0].n, 9);
});
test('expired enrollment and challenge cannot activate or grant a session', async (t) => {
    let now = 1791374400000;
    const f = await runtimeFixture(t, { now: () => now }), { auth } = await f.setup();
    const pending = await (await f.request('/api/account/mfa/setup', 'POST', { password: testPassword }, auth)).json();
    assert.ok(pending.enrollmentId);
    now += 600001;
    assert.equal((await f.request('/api/account/mfa/verify', 'POST', { enrollmentId: pending.enrollmentId, code: appCode(pending.secret, now) }, auth)).status, 401);
    const mfa = await enableMfa(f, auth, now), challenge = await f.login('Admin');
    now += 300001;
    assert.equal((await f.request('/api/login/mfa', 'POST', { challengeId: challenge.data.challengeId, code: appCode(mfa.secret, now) })).status, 401);
});
test('missing encryption key never disables MFA and recovery still requires the password', async (t) => {
    let now = 1791374400000;
    const f = await runtimeFixture(t, { now: () => now }), { auth } = await f.setup(), mfa = await enableMfa(f, auth, now);
    unlinkSync(f.app.secrets.path('mfa'));
    const status = await (await f.request('/api/account/mfa', 'GET', undefined, mfa.auth)).json();
    assert.equal(status.enabled, true);
    assert.equal(status.keyAvailable, false);
    now += 30000;
    const challenge = await f.login('Admin');
    assert.equal((await f.request('/api/login/mfa', 'POST', { challengeId: challenge.data.challengeId, code: appCode(mfa.secret, now) })).status, 503);
    assert.equal((await f.request('/api/login/mfa', 'POST', { challengeId: challenge.data.challengeId, code: mfa.recoveryCodes[0] })).status, 200);
    assert.equal((await f.login('Admin', 'wrong-password')).res.status, 401);
});
test('MFA attempts remain limited across fresh password challenges', async (t) => {
    let now = 1791374400000;
    const f = await runtimeFixture(t, { now: () => now }), { auth } = await f.setup();
    await enableMfa(f, auth, now);
    const first = await f.login('Admin');
    for (let i = 0; i < 5; i++)
        assert.equal((await f.request('/api/login/mfa', 'POST', { challengeId: first.data.challengeId, code: 'not-valid' })).status, 401);
    assert.equal((await f.request('/api/login/mfa', 'POST', { challengeId: first.data.challengeId, code: 'not-valid' })).status, 401);
    const second = await f.login('Admin');
    assert.equal(second.data.mfaRequired, true);
    for (let i = 0; i < 5; i++)
        await f.request('/api/login/mfa', 'POST', { challengeId: second.data.challengeId, code: 'not-valid' });
    const third = await f.login('Admin');
    assert.equal(third.res.status, 429);
});
test('accepted TOTP step remains consumed after restarting the runtime', async (t) => {
    let now = 1791374400000;
    const f = await runtimeFixture(t, { now: () => now }), { auth } = await f.setup(), enabled = await enableMfa(f, auth, now);
    await f.app.close();
    const restarted = await createApp({ dbPath: join(f.dataDir, 'retouren.sqlite'), now: () => now });
    try {
        await assert.rejects(async () => restarted.mfa.verifyFactor(enabled.session.user.id, appCode(enabled.secret, now)), e => e.status === 401);
        now += 30000;
        await assert.doesNotReject(async () => restarted.mfa.verifyFactor(enabled.session.user.id, appCode(enabled.secret, now)));
    }
    finally {
        await restarted.close();
    }
});
test('administrator reset keeps a limited enrollment challenge until new recovery confirmation', async (t) => {
    let now = 1791374400000;
    const f = await runtimeFixture(t, { now: () => now }), { auth } = await f.setup();
    const user = await (await f.request('/api/users', 'POST', { username: 'Worker', password: testPassword }, auth)).json();
    const worker = await f.login('Worker'), mfa = await enableMfa(f, worker.auth, now);
    await f.request(`/api/users/${user.id}`, 'PUT', { password: testPassword }, auth);
    assert.equal((await f.login('Worker')).data.mfaRequired, true);
    const reset = await f.request(`/api/users/${user.id}/mfa/reset`, 'POST', { password: testPassword, confirmed: true }, auth);
    assert.equal(reset.status, 200);
    assert.equal((await f.request('/api/products', 'GET', undefined, mfa.auth)).status, 401);
    const challenge = await f.login('Worker');
    assert.equal(challenge.data.enrollmentRequired, true);
    assert.equal((await f.request('/api/products', 'GET', undefined, challenge.auth)).status, 401);
    const begin = await f.request('/api/login/mfa/setup', 'POST', { challengeId: challenge.data.challengeId });
    assert.equal(begin.status, 200);
    const pending = await begin.json();
    const verify = await f.request('/api/login/mfa/verify', 'POST', { challengeId: challenge.data.challengeId, enrollmentId: pending.enrollmentId, code: appCode(pending.secret, now) });
    assert.equal(verify.status, 200);
    const proof = await verify.json();
    assert.equal((await f.request('/api/products')).status, 401);
    const finish = await f.request('/api/login/mfa/confirm', 'POST', { challengeId: challenge.data.challengeId, confirmationId: proof.confirmationId, saved: true });
    assert.equal(finish.status, 200);
    assert.equal((await finish.json()).unlocked, true);
});
