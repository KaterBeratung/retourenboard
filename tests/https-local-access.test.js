import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import { runtimeFixture, testPassword } from './helpers/runtime.js';
import { enableMfa, appCode } from './helpers/mfa.js';
const publicOrigin = 'https://retourenboard.app';
const proxyHeaders = { Host: 'retourenboard.app', Origin: publicOrigin, 'X-Forwarded-Proto': 'https' };
async function fixture(t) {
    const f = await runtimeFixture(t, { publicOrigin, secureCookies: true, production: true });
    await f.app.users.createFirst({ username: 'Admin', password: testPassword });
    return f;
}
test('HTTPS domain and direct local HTTP have separate usable sessions and retain CSRF checks', async (t) => {
    const f = await fixture(t);
    const remoteResponse = await f.request('/api/login', 'POST', { username: 'Admin', password: testPassword }, {}, proxyHeaders);
    assert.equal(remoteResponse.status, 200);
    const remote = f.authFrom(remoteResponse, await remoteResponse.json());
    assert.match(remote.Cookie, /^__Host-retouren_session=/);
    assert.match(remoteResponse.headers.get('set-cookie'), /; Secure$/);
    const local = await f.login('Admin');
    assert.equal(local.res.status, 200);
    assert.match(local.auth.Cookie, /^retouren_local_session=/);
    assert.doesNotMatch(local.res.headers.get('set-cookie'), /; Secure/);
    assert.match(local.res.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
    for (const path of ['/api/products', '/api/account/profile', '/app.js', '/admin.js']) {
        assert.equal((await f.request(path, 'GET', undefined, local.auth)).status, 200, path + ' local');
        assert.equal((await f.request(path, 'GET', undefined, remote, proxyHeaders)).status, 200, path + ' public');
    }
    assert.equal((await f.request('/api/products', 'POST', { sku: 'LOCAL', name: 'Lokal' }, local.auth)).status, 201);
    assert.equal((await f.request('/api/products', 'POST', { sku: 'BAD', name: 'Fremd' }, local.auth, { Origin: 'https://evil.test' })).status, 403);
    assert.equal((await f.request('/api/products', 'POST', { sku: 'BAD', name: 'Ohne CSRF' }, { Cookie: local.auth.Cookie })).status, 403);
    assert.equal((await f.request('/api/logout', 'POST', {}, local.auth)).status, 200);
    assert.equal((await f.request('/app.js', 'GET', undefined, local.auth)).status, 401);
    assert.equal((await f.request('/app.js', 'GET', undefined, remote, proxyHeaders)).status, 200);
});
test('a local token cannot be replayed as a public HTTPS cookie, or vice versa', async (t) => {
    const f = await fixture(t), local = await f.login('Admin');
    assert.equal(local.res.status, 200);
    const remoteResponse = await f.request('/api/login', 'POST', { username: 'Admin', password: testPassword }, {}, proxyHeaders);
    const remote = f.authFrom(remoteResponse, await remoteResponse.json());
    const forgedPublic = { Cookie: local.auth.Cookie.replace('retouren_local_session', '__Host-retouren_session') };
    const forgedLocal = { Cookie: remote.Cookie.replace('__Host-retouren_session', 'retouren_local_session') };
    assert.equal((await f.request('/api/products', 'GET', undefined, forgedPublic, proxyHeaders)).status, 401);
    assert.equal((await f.request('/api/products', 'GET', undefined, forgedLocal)).status, 401);
    assert.equal((await f.request('/app.js', 'GET', undefined, forgedPublic, proxyHeaders)).status, 401);
    assert.equal((await f.request('/admin.js', 'HEAD', undefined, forgedLocal)).status, 401);
});
test('rewritten upstream Host still uses the secure public cookie when a proxy forwards HTTPS', async (t) => {
    const f = await fixture(t), headers = { Origin: publicOrigin, 'X-Forwarded-Proto': 'https' };
    const response = await f.request('/api/login', 'POST', { username: 'Admin', password: testPassword }, {}, headers);
    assert.equal(response.status, 200);
    const auth = f.authFrom(response, await response.json());
    assert.match(auth.Cookie, /^__Host-retouren_session=/);
    assert.match(response.headers.get('set-cookie'), /; Secure$/);
    assert.equal((await f.request('/app.js', 'GET', undefined, auth, headers)).status, 200);
});
test('wrong proxy address has an actionable error and never issues an insecure session', async (t) => {
    const f = await fixture(t);
    const response = await f.request('/api/login', 'POST', { username: 'Admin', password: testPassword }, {}, { ...proxyHeaders, Origin: 'https://old.example.test' });
    assert.equal(response.status, 403);
    assert.match((await response.json()).error, /Domain.*Protokoll.*Port/);
    assert.equal(response.headers.get('set-cookie'), null);
});
test('local HTTP login still completes required MFA before accessing private modules', async (t) => {
    let now = 1791374400000;
    const f = await runtimeFixture(t, { publicOrigin, secureCookies: true, production: true, now: () => now });
    await f.app.users.createFirst({ username: 'Admin', password: testPassword });
    const local = await f.login('Admin');
    assert.equal(local.res.status, 200);
    const mfa = await enableMfa(f, local.auth, now);
    now += 30000;
    const challenge = await f.login('Admin');
    assert.equal(challenge.data.mfaRequired, true);
    assert.equal((await f.request('/app.js', 'GET', undefined, challenge.auth)).status, 401);
    const response = await f.request('/api/login/mfa', 'POST', { challengeId: challenge.data.challengeId, code: appCode(mfa.secret, now) });
    assert.equal(response.status, 200);
    const auth = f.authFrom(response, await response.json());
    assert.match(auth.Cookie, /^retouren_local_session=/);
    assert.equal((await f.request('/app.js', 'GET', undefined, auth)).status, 200);
});
test('the first admin can be created locally while the public HTTPS address is configured', async (t) => {
    const f = await runtimeFixture(t, { publicOrigin, secureCookies: true, production: true });
    const created = await f.setup();
    assert.equal(created.res.status, 201);
    assert.match(created.auth.Cookie, /^retouren_local_session=/);
    const response = await f.request('/api/admin/settings', 'GET', undefined, created.auth);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).activeNetwork.publicOrigin, publicOrigin);
    const remote = await f.request('/api/login', 'POST', { username: 'Admin', password: testPassword }, {}, proxyHeaders);
    assert.equal(remote.status, 200);
    assert.match(remote.headers.get('set-cookie'), /^__Host-retouren_session=.*; Secure$/);
});
test('MFA login on the public domain keeps a secure session after local MFA enrolment', async (t) => {
    let now = 1791374400000;
    const f = await runtimeFixture(t, { publicOrigin, secureCookies: true, production: true, now: () => now });
    await f.app.users.createFirst({ username: 'Admin', password: testPassword });
    const local = await f.login('Admin'), mfa = await enableMfa(f, local.auth, now);
    now += 30000;
    const challenge = await f.request('/api/login', 'POST', { username: 'Admin', password: testPassword }, {}, proxyHeaders);
    const data = await challenge.json();
    assert.equal(data.mfaRequired, true);
    assert.equal(challenge.headers.get('set-cookie'), null);
    const response = await f.request('/api/login/mfa', 'POST', { challengeId: data.challengeId, code: appCode(mfa.secret, now) }, {}, proxyHeaders);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('set-cookie'), /^__Host-retouren_session=.*; Secure$/);
    const auth = f.authFrom(response, await response.json());
    assert.equal((await f.request('/app.js', 'GET', undefined, auth, proxyHeaders)).status, 200);
    assert.equal((await f.request('/api/products', 'GET', undefined, { Cookie: auth.Cookie.replace('__Host-retouren_session', 'retouren_local_session') })).status, 401);
});
test('direct LAN access is limited to the actual local IP and port and rejects proxy headers', async () => {
    const { resolveRequestAccess } = await import('../dist/server/request-access.js');
    const req = { headers: { host: '192.168.1.20:3000' }, socket: { localAddress: '192.168.1.20', localPort: 3000, remoteAddress: '192.168.1.30' } };
    const options = { publicOrigin, secureCookies: true };
    assert.equal(resolveRequestAccess(req, options).local, true);
    assert.equal(resolveRequestAccess(req, options).expectedOrigin, 'http://192.168.1.20:3000');
    for (const patch of [
        { headers: { host: '192.168.1.21:3000' } }, { headers: { host: '192.168.1.20:4000' } },
        { headers: { host: 'evil.test:3000' } }, { headers: { host: '192.168.1.20:3000', 'x-forwarded-proto': 'https' } },
        { headers: { host: '192.168.1.20:3000', forwarded: 'proto=http' } },
        { socket: { ...req.socket, remoteAddress: '203.0.113.4' } }
    ])
        assert.equal(resolveRequestAccess({ ...req, ...patch }, options).local, false, JSON.stringify(patch));
});
test('local address detection supports mapped IPv4, IPv6 ULA and loopback tunnels without trusting forwarded hosts', async () => {
    const { resolveRequestAccess } = await import('../dist/server/request-access.js');
    const options = { publicOrigin, secureCookies: true };
    const examples = [
        ['10.0.0.20:3010', '::ffff:10.0.0.20', '::ffff:10.0.0.30', 3010, 'http://10.0.0.20:3010'],
        ['172.31.0.20:3000', '172.31.0.20', '172.16.0.30', 3000, 'http://172.31.0.20:3000'],
        ['[fd00:1234::20]:3000', 'fd00:1234::20', 'fd00:1234::30', 3000, 'http://[fd00:1234::20]:3000'],
        ['localhost:3001', '127.0.0.1', '127.0.0.1', 3000, 'http://localhost:3001'],
        ['[::1]:3001', '::1', '::1', 3000, 'http://[::1]:3001']
    ];
    for (const [host, localAddress, remoteAddress, localPort, origin] of examples) {
        const req = { headers: { host }, socket: { localAddress, remoteAddress, localPort } };
        const access = resolveRequestAccess(req, options);
        assert.equal(access.local, true, host);
        assert.equal(access.expectedOrigin, origin);
        assert.equal(resolveRequestAccess({ ...req, headers: { host, 'x-forwarded-host': 'retourenboard.app' } }, options).local, false);
    }
    for (const [host, localAddress, remoteAddress] of [
        ['203.0.113.20:3000', '203.0.113.20', '192.168.1.30'],
        ['[2001:db8::20]:3000', '2001:db8::20', 'fd00::30'],
        ['localhost:3000', '192.168.1.20', '192.168.1.30'],
        ['user@192.168.1.20:3000', '192.168.1.20', '192.168.1.30'],
        ['192.168.1.20:3000/path', '192.168.1.20', '192.168.1.30']
    ])
        assert.equal(resolveRequestAccess({ headers: { host }, socket: { localAddress, remoteAddress, localPort: 3000 } }, options).local, false, host);
});
