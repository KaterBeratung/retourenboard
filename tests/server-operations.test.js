import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import { runtimeFixture, testPassword } from './helpers/runtime.js';
import { restoreFixture } from './helpers/restore-runtime.js';
import { enableMfa } from './helpers/mfa.js';
import { createServer } from 'node:net';
const idle = { available: true, mode: 'application', state: 'idle' };
function control() { const calls = []; return { calls, status: async () => idle, logs: async () => ({ source: 'application', entries: [] }), prepareRestart: async () => { calls.push('prepare'); return { id: 'restart-test', mode: 'application' }; }, commitRestart: async () => { calls.push('commit'); }, cancelRestart: async () => { calls.push('cancel'); } }; }
async function until(check) {
    for (let i = 0; i < 100; i++) {
        if (check())
            return;
        await new Promise(r => setTimeout(r, 5));
    }
    assert.fail('Operation did not finish');
}
test('server controls and logs are admin-only, including users with diagnostics permissions', async (t) => {
    const ops = control(), f = await runtimeFixture(t, { serverControl: ops }), { auth } = await f.setup();
    for (const path of ['/api/admin/server', '/api/admin/server/logs'])
        assert.equal((await f.request(path)).status, 401);
    await f.request('/api/users', 'POST', { username: 'Member', password: testPassword, permissions: { diagnosticsView: true } }, auth);
    const member = (await f.login('Member')).auth;
    for (const path of ['/api/admin/server', '/api/admin/server/logs']) {
        assert.equal((await f.request(path, 'GET', undefined, member)).status, 403);
        assert.equal((await f.request(path, 'GET', undefined, auth)).status, 200);
    }
    assert.equal((await f.request('/api/admin/server/restart', 'POST', { confirmed: true, password: testPassword }, member)).status, 403);
    assert.deepEqual(ops.calls, []);
});
test('restart needs an admin session, same-origin CSRF and explicit confirmation, without a password', async (t) => {
    const ops = control(), f = await runtimeFixture(t, { serverControl: ops }), { auth } = await f.setup(), input = { confirmed: true };
    assert.equal((await f.request('/api/admin/server/restart', 'POST', input)).status, 401);
    assert.equal((await f.request('/api/admin/server/restart', 'POST', input, { ...auth, 'X-CSRF-Token': 'bad' })).status, 403);
    assert.equal((await f.request('/api/admin/server/restart', 'POST', input, auth, { Origin: 'https://evil.test' })).status, 403);
    assert.equal((await f.request('/api/admin/server/restart', 'POST', { ...input, confirmed: false }, auth)).status, 400);
    assert.deepEqual(ops.calls, []);
    const status = await (await f.request('/api/admin/server', 'GET', undefined, auth)).json();
    const response = await f.request('/api/admin/server/restart', 'POST', input, auth);
    assert.equal(response.status, 202);
    assert.equal((await response.json()).accepted, true);
    await until(() => ops.calls.includes('commit'));
    assert.deepEqual(ops.calls, ['prepare', 'commit']);
    assert.equal(status.requiresSecondFactor, false);
    const changes = (await f.app.store.db.query("SELECT value FROM server_settings WHERE id=1", [])).rows[0];
    assert.equal(changes, undefined);
});
test('restart confirmation requires a valid second factor when MFA is enabled', async (t) => {
    const ops = control(), now = 1791374400000, f = await runtimeFixture(t, { serverControl: ops, now: () => now }), { auth } = await f.setup(), mfa = await enableMfa(f, auth, now);
    const status = await (await f.request('/api/admin/server', 'GET', undefined, mfa.auth)).json();
    assert.equal((await f.request('/api/admin/server/restart', 'POST', { confirmed: true }, mfa.auth)).status, 401);
    assert.deepEqual(ops.calls, []);
    assert.equal((await f.request('/api/admin/server/restart', 'POST', { confirmed: true, factor: mfa.recoveryCodes[0] }, mfa.auth)).status, 202);
    await until(() => ops.calls.includes('commit'));
    assert.equal(status.requiresSecondFactor, true);
});
test('passwordless restart still limits invalid second-factor attempts', async (t) => {
    const ops = control(), now = 1791374400000, f = await runtimeFixture(t, { serverControl: ops, now: () => now }), { auth } = await f.setup(), mfa = await enableMfa(f, auth, now);
    for (let i = 0; i < 10; i++)
        assert.equal((await f.request('/api/admin/server/restart', 'POST', { confirmed: true, factor: 'invalid' }, mfa.auth)).status, 401);
    assert.equal((await f.request('/api/admin/server/restart', 'POST', { confirmed: true, factor: mfa.recoveryCodes[0] }, mfa.auth)).status, 429);
    assert.deepEqual(ops.calls, []);
});
test('admin access is rechecked after asynchronous log retrieval', async (t) => {
    let finish, started;
    const signal = new Promise(r => started = r), ops = control();
    ops.logs = async () => { started(); return new Promise(r => finish = r); };
    const f = await runtimeFixture(t, { serverControl: ops }), { auth } = await f.setup();
    assert.equal((await f.request('/api/admin/server', 'GET', undefined, auth)).status, 200);
    const user = await (await f.request('/api/users', 'POST', { username: 'Operator', role: 'admin', password: testPassword }, auth)).json(), other = (await f.login('Operator')).auth;
    const pending = f.request('/api/admin/server/logs', 'GET', undefined, other);
    await signal;
    await f.request(`/api/users/${user.id}`, 'PUT', { role: 'member' }, auth);
    finish({ source: 'journal', entries: [{ message: 'secret log' }] });
    assert.equal((await pending).status, 403);
});
test('failed restart reservation releases maintenance and permits normal writes', async (t) => {
    const ops = control();
    ops.prepareRestart = async () => { throw Error('internal secret'); };
    const f = await runtimeFixture(t, { serverControl: ops }), { auth } = await f.setup();
    const response = await f.request('/api/admin/server/restart', 'POST', { confirmed: true, password: testPassword }, auth);
    assert.equal(response.status, 503);
    assert.doesNotMatch((await response.json()).error, /internal secret/);
    assert.equal((await f.request('/api/products', 'POST', { name: 'Weiter verfügbar', sku: 'OK' }, auth)).status, 201);
});
test('a runtime restart retains data, replaces sessions and returns to the same listener', async (t) => {
    const f = await restoreFixture(t), { auth } = await f.setup(), old = f.app;
    await f.request('/api/products', 'POST', { name: 'Bleibt erhalten', sku: 'KEEP' }, auth);
    const response = await f.request('/api/admin/server/restart', 'POST', { confirmed: true, password: testPassword }, auth);
    assert.equal(response.status, 202);
    await response.json();
    await f.runtime.waitForRestart();
    assert.notEqual(f.app, old);
    assert.equal((await f.app.store.listProducts())[0].sku, 'KEEP');
    assert.equal(f.app.server.address().port, new URL(f.base).port * 1);
    assert.equal((await f.request('/api/products', 'GET', undefined, auth)).status, 401);
    const fresh = await f.login('Admin');
    assert.equal(fresh.res.status, 200);
    const logs = await (await f.request('/api/admin/server/logs', 'GET', undefined, fresh.auth)).json();
    assert.ok(logs.entries.some(item => /Neustart abgeschlossen/.test(item.message)));
});
test('managed Linux service restart is unavailable when its helper is unreachable', async (t) => {
    const f = await restoreFixture(t, { managedService: true, updateService: { serverStatus: async () => ({ available: false, message: 'Helper offline' }) } }), { auth } = await f.setup();
    const status = await (await f.request('/api/admin/server', 'GET', undefined, auth)).json();
    assert.equal(status.available, false);
    assert.equal(status.mode, 'service');
    assert.equal((await f.request('/api/admin/server/restart', 'POST', { confirmed: true, password: testPassword }, auth)).status, 503);
});
test('restart applies a saved port change and invalidates the old session', async (t) => {
    const f = await restoreFixture(t), { auth } = await f.setup(), socket = createServer();
    await new Promise(r => socket.listen(0, '127.0.0.1', r));
    const port = socket.address().port;
    await new Promise(r => socket.close(r));
    await f.request('/api/admin/settings', 'PUT', { port }, auth);
    const response = await f.request('/api/admin/server/restart', 'POST', { confirmed: true, password: testPassword }, auth);
    assert.equal(response.status, 202);
    assert.equal((await response.json()).nextOrigin, `http://127.0.0.1:${port}`);
    await f.runtime.waitForRestart();
    assert.equal(f.app.server.address().port, port);
    const session = await (await fetch(`http://127.0.0.1:${port}/api/session`, { headers: auth })).json();
    assert.equal(session.unlocked, false);
});
test('a occupied port recovers the old listener and records a failed restart', async (t) => {
    const f = await restoreFixture(t), { auth } = await f.setup(), socket = createServer();
    await new Promise(r => socket.listen(0, '127.0.0.1', r));
    t.after(() => new Promise(r => socket.close(r)));
    const port = socket.address().port;
    await f.request('/api/admin/settings', 'PUT', { port }, auth);
    const response = await f.request('/api/admin/server/restart', 'POST', { confirmed: true, password: testPassword }, auth);
    assert.equal(response.status, 202);
    await response.json();
    await assert.rejects(f.runtime.waitForRestart(), error => error.code === 'EADDRINUSE');
    assert.equal(f.app.server.address().port, new URL(f.base).port * 1);
    const fresh = await f.login('Admin');
    assert.equal(fresh.res.status, 200);
    const status = await (await f.request('/api/admin/server', 'GET', undefined, fresh.auth)).json();
    assert.equal(status.state, 'failed');
    assert.equal((await f.app.settings.get()).port, port);
});
test('revocation during restart reservation cancels the operation before handoff', async (t) => {
    let finish, started;
    const signal = new Promise(r => started = r), ops = control();
    ops.prepareRestart = async () => { started(); return new Promise(r => finish = r); };
    const f = await runtimeFixture(t, { serverControl: ops }), { auth } = await f.setup();
    const pending = f.request('/api/admin/server/restart', 'POST', { confirmed: true, password: testPassword }, auth);
    await signal;
    f.app.auth.logoutAll(1);
    finish({ id: 'cancelled', mode: 'application' });
    assert.equal((await pending).status, 401);
    assert.deepEqual(ops.calls, ['cancel']);
});
test('restart is rejected while a backup is active and never hands off', async (t) => {
    const ops = control(), f = await runtimeFixture(t, { serverControl: ops }), { auth } = await f.setup();
    f.app.backups.status = () => ({ running: true });
    assert.equal((await f.request('/api/admin/server/restart', 'POST', { confirmed: true, password: testPassword }, auth)).status, 409);
    assert.deepEqual(ops.calls, []);
});
test('Linux service control uses only fixed journal/systemctl arguments, caps logs and redacts credentials', async () => {
    const { createLinuxServiceControl } = await import('../dist/server/service-control.js'), calls = [];
    const execute = async (command, args, options) => { calls.push({ command, args, options }); return { stdout: command === 'journalctl' ? JSON.stringify({ MESSAGE: 'Authorization: Bearer abc123\npassword=hidden Cookie: retouren_session=abcdef', PRIORITY: '3', __REALTIME_TIMESTAMP: '1791374400000000' }) + '\n' : '' }; };
    const ops = createLinuxServiceControl({ execute, updateStatus: () => ({ state: 'idle' }) });
    const logs = await ops.logs();
    assert.equal(logs.source, 'journal');
    assert.equal(logs.entries[0].level, 'error');
    assert.doesNotMatch(logs.entries[0].message, /abc123|hidden|abcdef/);
    assert.deepEqual(calls[0].args, ['--unit=retourenboard.service', '--lines=200', '--output=json', '--no-pager']);
    assert.ok(calls[0].options.timeout <= 5000);
    assert.ok(calls[0].options.maxBuffer <= 512 * 1024);
    const job = ops.prepareRestart();
    assert.throws(() => ops.prepareRestart(), /Neustart/);
    await assert.rejects(async () => ops.commitRestart('wrong'), /Neustart/);
    await ops.commitRestart(job.id);
    assert.equal(ops.status().state, 'complete');
    assert.deepEqual(calls.slice(1).map(c => [c.command, c.args]), [['systemctl', ['restart', 'retourenboard.service']], ['systemctl', ['is-active', '--quiet', 'retourenboard.service']]]);
});
test('Linux service controls reject restart while updating and discard expired reservations', async () => {
    const { createLinuxServiceControl } = await import('../dist/server/service-control.js');
    let state = 'installing', now = 0;
    const ops = createLinuxServiceControl({ execute: async () => ({ stdout: '' }), updateStatus: () => ({ state }), now: () => now });
    assert.throws(() => ops.prepareRestart(), /Update/);
    state = 'idle';
    const first = ops.prepareRestart();
    now = 20000;
    assert.equal(ops.status().state, 'idle');
    await assert.rejects(async () => ops.commitRestart(first.id), /Neustart/);
    const second = ops.prepareRestart();
    ops.cancelRestart(second.id);
    assert.equal(ops.status().state, 'idle');
});
test('Linux restart reports failure when the service is active but HTTP readiness fails', async () => {
    const { createLinuxServiceControl } = await import('../dist/server/service-control.js');
    const ops = createLinuxServiceControl({ execute: async () => ({ stdout: '' }), updateStatus: () => ({ state: 'idle' }), checkHealth: async () => { throw Error('No listener'); } });
    const job = ops.prepareRestart();
    await assert.rejects(ops.commitRestart(job.id), /fehlgeschlagen/);
    assert.equal(ops.status().state, 'failed');
});
test('application logs are bounded, preserve severity and mask structured credentials', async () => {
    const { createServerLog } = await import('../dist/server/server-log.js'), logs = createServerLog();
    for (let i = 0; i < 300; i++)
        logs.write('info', 'Entry ' + i);
    logs.write('error', '{"password":"super-secret", "csrfToken":"abcde", "factor":"123456"}');
    const data = logs.read();
    assert.equal(data.entries.length, 200);
    assert.equal(data.entries.at(-1).level, 'error');
    assert.doesNotMatch(data.entries.at(-1).message, /super-secret|abcde|123456/);
});
test('structured journal records redact nested headers and every recovery code', async () => {
    const { redactLog } = await import('../dist/server/server-log.js');
    for (const text of ['{"Cookie":"retouren_session=abcdef"}', '{"Authorization":"Basic dXNlcjpwYXNz"}', '{"headers":{"Set-Cookie":"session=abc-cookie"},"recoveryCodes":["first-sensitive-code","second-sensitive-code"]}', 'Context: {"recoveryCodes":["one-secret","two-secret"],"ok":"diagnostic"}'])
        assert.doesNotMatch(redactLog(text), /abcdef|dXNlcjpwYXNz|abc-cookie|sensitive-code|one-secret|two-secret/);
});
