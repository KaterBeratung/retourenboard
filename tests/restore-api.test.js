import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';
import { once } from 'node:events';
import { restoreFixture } from './helpers/restore-runtime.js';
import { enableMfa, appCode } from './helpers/mfa.js';
import { testPassword } from './helpers/runtime.js';
import { InputError } from '../dist/shared/model.js';
const archive = async (app) => app.backups.create({ id: 1, name: 'Admin', source: 'user' });
const preview = async (f, auth, id) => { const r = await f.request('/api/admin/backups/restore/prepare', 'POST', { backupId: id }, auth); assert.equal(r.status, 201); return r.json(); };
test('restore API denies anonymous, member, viewer, wrong origin and another administrator session', async (t) => {
    const f = await restoreFixture(t), { auth } = await f.setup();
    const saved = await archive(f.app);
    assert.equal((await f.request('/api/admin/backups/restore/prepare', 'POST', { backupId: saved.id })).status, 401);
    for (const role of ['member', 'viewer']) {
        await f.app.users.create({ username: role, password: testPassword, role });
        const login = await f.login(role);
        assert.equal((await f.request('/api/admin/backups/restore/prepare', 'POST', { backupId: saved.id }, login.auth)).status, 403);
    }
    assert.equal((await f.request('/api/admin/backups/restore/prepare', 'POST', { backupId: saved.id }, auth, { Origin: 'http://foreign.example' })).status, 403);
    const view = await preview(f, auth, saved.id), other = await f.login('Admin');
    assert.equal((await f.request(`/api/admin/backups/restore/${view.id}`, 'GET', undefined, other.auth)).status, 404);
});
test('demotion while preparation is running cannot yield a usable preview', async (t) => {
    const f = await restoreFixture(t), { auth } = await f.setup();
    await f.app.users.create({ username: 'OtherAdmin', role: 'admin', password: testPassword });
    const saved = await archive(f.app);
    const c = f.app.server.listeners('request');
    let finish, started;
    const ready = new Promise(r => started = r);
    const original = f.app.backups.file;
    f.app.backups.file = id => { const result = original(id); started(); return result; };
    // Pause the actual archive checker through an upload body instead of bypassing its verification.
    const bytes = readFileSync(join(f.dataDir, 'backups', saved.filename));
    const { Readable } = await import('node:stream');
    const stream = new Readable({ read() {
            if (!this.sent) {
                this.sent = true;
                this.push(bytes.subarray(0, 20));
                finish = () => { this.push(bytes.subarray(20)); this.push(null); };
            }
        } });
    const pending = fetch(f.base + '/api/admin/backups/restore/upload', { method: 'POST', duplex: 'half', headers: { Origin: f.base, 'Content-Type': 'application/octet-stream', ...auth }, body: stream });
    while (!finish)
        await new Promise(r => setTimeout(r, 1));
    await f.app.users.update(1, { role: 'member' });
    finish();
    assert.equal((await pending).status, 403);
    assert.equal((await f.app.store.listProducts()).length, 0);
});
test('snapshot failure retains the current database and releases maintenance for retry', async (t) => {
    const f = await restoreFixture(t), { auth } = await f.setup();
    await f.app.store.createProduct({ name: 'Aktuell', sku: 'A' });
    const saved = await archive(f.app), view = await preview(f, auth, saved.id), original = f.app.backups.create;
    f.app.backups.create = async () => Promise.reject(new InputError('Speicherplatz fehlt.', 503));
    assert.equal((await f.request(`/api/admin/backups/restore/${view.id}/commit`, 'POST', { confirmed: true, password: testPassword }, auth)).status, 503);
    assert.equal((await f.request('/api/products', 'POST', { name: 'Weiter', sku: 'B' }, auth)).status, 201);
    f.app.backups.create = original;
    assert.equal((await f.app.store.listProducts()).length, 2);
});
test('failed start rolls back to the previous data and resets sessions', async (t) => {
    let instances = 0;
    const f = await restoreFixture(t, { onApp() {
            if (++instances === 2)
                throw Error('Simulierter Startfehler');
        } }), { auth } = await f.setup();
    await f.app.store.createProduct({ name: 'Archiv', sku: 'A' });
    const saved = await archive(f.app);
    await f.app.store.createProduct({ name: 'Aktuell', sku: 'B' });
    const view = await preview(f, auth, saved.id);
    const res = await f.request(`/api/admin/backups/restore/${view.id}/commit`, 'POST', { confirmed: true, password: testPassword }, auth);
    assert.equal(res.status, 202);
    await res.json();
    await assert.rejects(async () => f.runtime.waitForRestore());
    assert.equal((await f.app.store.listProducts()).length, 2);
    assert.equal((await (await f.request('/api/session', 'GET', undefined, auth)).json()).unlocked, false);
});
test('same-account restored factors cannot replay consumed TOTP and retired recovery codes', async (t) => {
    let now = Date.parse('2026-10-07T10:00:00Z');
    const f = await restoreFixture(t, { now: () => now }), first = await f.setup(), mfa = await enableMfa(f, first.auth, now), auth = mfa.auth, saved = await archive(f.app);
    now += 30000;
    await f.app.mfa.verifyFactor(1, mfa.recoveryCodes[0]);
    const current = f.app.mfa.replaceRecoveryCodes(1), view = await preview(f, auth, saved.id), code = appCode(mfa.secret, now);
    const res = await f.request(`/api/admin/backups/restore/${view.id}/commit`, 'POST', { confirmed: true, password: testPassword, factor: code }, auth);
    assert.equal(res.status, 202);
    await res.json();
    await f.runtime.waitForRestore();
    await assert.rejects(async () => f.app.mfa.verifyFactor(1, code));
    await assert.rejects(async () => f.app.mfa.verifyFactor(1, mfa.recoveryCodes[0]));
    await assert.rejects(async () => f.app.mfa.verifyFactor(1, mfa.recoveryCodes[1]));
    now += 30000;
    await assert.doesNotReject(async () => f.app.mfa.verifyFactor(1, appCode(mfa.secret, now)));
});
test('a password change after backup cannot revive already consumed codes of the same factor', async (t) => {
    let now = Date.parse('2026-10-07T10:00:00Z');
    const f = await restoreFixture(t, { now: () => now }), first = await f.setup(), mfa = await enableMfa(f, first.auth, now), saved = await archive(f.app);
    await f.app.users.update(1, { password: 'Neues-Testpasswort!' });
    const challenge = await f.login('Admin', 'Neues-Testpasswort!');
    now += 30000;
    const login = await f.request('/api/login/mfa', 'POST', { challengeId: challenge.data.challengeId, code: appCode(mfa.secret, now) });
    const auth = f.authFrom(login, await login.json()), view = await preview(f, auth, saved.id);
    now += 30000;
    const code = appCode(mfa.secret, now);
    const res = await f.request(`/api/admin/backups/restore/${view.id}/commit`, 'POST', { confirmed: true, password: 'Neues-Testpasswort!', factor: code }, auth);
    assert.equal(res.status, 202);
    await res.json();
    await f.runtime.waitForRestore();
    await assert.rejects(async () => f.app.mfa.verifyFactor(1, code));
});
test('disconnect during the safety snapshot releases maintenance without activating the archive', async (t) => {
    const f = await restoreFixture(t), { auth } = await f.setup();
    await f.app.store.createProduct({ name: 'Archiv', sku: 'A' });
    const saved = await archive(f.app);
    await f.app.store.createProduct({ name: 'Aktuell', sku: 'B' });
    const view = await preview(f, auth, saved.id);
    let entered, finish;
    const started = new Promise(r => entered = r), original = f.app.backups.create;
    f.app.backups.create = async (...args) => { const value = await original(...args); entered(); await new Promise(r => finish = r); return value; };
    let closeObserved;
    const closed = new Promise(r => closeObserved = r);
    f.app.server.once('request', (req, res) => res.once('close', closeObserved));
    const request = httpRequest(f.base + `/api/admin/backups/restore/${view.id}/commit`, { method: 'POST', headers: { Origin: f.base, 'Content-Type': 'application/json', ...auth } });
    request.on('error', () => { });
    request.end(JSON.stringify({ confirmed: true, password: testPassword }));
    await started;
    request.destroy();
    await closed;
    finish();
    await new Promise(r => setTimeout(r, 50));
    f.app.backups.create = original;
    assert.equal((await f.app.store.listProducts()).length, 2);
    assert.equal((await f.request('/api/products', 'POST', { name: 'Weiter', sku: 'C' }, auth)).status, 201);
});
test('MFA login begun before maintenance cannot consume a code after state is carried', async (t) => {
    let now = Date.parse('2026-10-07T10:00:00Z');
    const f = await restoreFixture(t, { now: () => now }), first = await f.setup(), mfa = await enableMfa(f, first.auth, now), saved = await archive(f.app), view = await preview(f, mfa.auth, saved.id), challenge = await f.login('Admin');
    const arrived = once(f.app.server, 'request');
    let finish;
    const late = new Promise((resolve, reject) => { const req = httpRequest(f.base + '/api/login/mfa', { method: 'POST', headers: { Origin: f.base, 'Content-Type': 'application/json' } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); }); req.on('error', reject); req.write(JSON.stringify({ challengeId: challenge.data.challengeId, code: mfa.recoveryCodes[0] }).slice(0, -1)); finish = () => req.end('}'); });
    await arrived;
    const close = f.app.close;
    let lateStatus;
    f.app.close = async () => { finish(); lateStatus = await late; return close(); };
    now += 30000;
    const res = await f.request(`/api/admin/backups/restore/${view.id}/commit`, 'POST', { confirmed: true, password: testPassword, factor: appCode(mfa.secret, now) }, mfa.auth);
    assert.equal(res.status, 202);
    await res.json();
    await f.runtime.waitForRestore();
    assert.equal(lateStatus, 503);
});
test('binary upload prepares a valid archive and double commit is blocked during maintenance', async (t) => {
    const f = await restoreFixture(t), { auth } = await f.setup(), saved = await archive(f.app);
    const res = await fetch(f.base + '/api/admin/backups/restore/upload', { method: 'POST', headers: { Origin: f.base, ...auth, 'Content-Type': 'application/octet-stream' }, body: readFileSync(join(f.dataDir, 'backups', saved.filename)) });
    assert.equal(res.status, 201);
    const view = await res.json();
    const [a, b] = await Promise.all([f.request(`/api/admin/backups/restore/${view.id}/commit`, 'POST', { confirmed: true, password: testPassword }, auth), f.request(`/api/admin/backups/restore/${view.id}/commit`, 'POST', { confirmed: true, password: testPassword }, auth)]);
    // The second request may reach either the coordinator's duplicate guard
    // or the HTTP maintenance gate after the first activation starts.
    const statuses=[a.status,b.status].sort();
    assert.equal(statuses[0],202);
    assert.ok([409,503].includes(statuses[1]),'The second commit must be blocked');
    await a.arrayBuffer();
    await b.arrayBuffer();
    await f.runtime.waitForRestore();
});
