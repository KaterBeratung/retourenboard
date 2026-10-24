import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import { runtimeFixture, testPassword } from './helpers/runtime.js';
import { createVersionCheck, compareVersions, VERSION_RELEASE_URL } from '../dist/server/version-check.js';
const release = version => new Response(JSON.stringify({ tag_name: version, draft: false, prerelease: false, published_at: '2026-10-07T08:16:59Z' }));
test('release versions compare numerically and reject incomplete or unsafe version strings', () => {
    assert.equal(compareVersions('3.9.0', '3.10.0'), -1);
    assert.equal(compareVersions('3.1.0', '3.1.0'), 0);
    assert.equal(compareVersions('4.0.0', '3.99.99'), 1);
    for (const invalid of ['3.1', 'v3.1.0', '3.1.0-beta.1', '01.2.3', '<script>', '9999999999999999999.0.0'])
        assert.throws(() => compareVersions('3.1.0', invalid));
});
test('checking is manual, uses the fixed public source and shares requests during the cooldown', async () => {
    let now = 100000, calls = 0, finish;
    const checker = createVersionCheck({ version: '3.1.0', now: () => now, fetcher: async (url, options) => { calls++; assert.equal(url, VERSION_RELEASE_URL); assert.equal(options.redirect, 'error'); assert.ok(options.signal); assert.equal(options.headers.Authorization, undefined); return new Promise(resolve => finish = resolve); } });
    assert.equal(checker.read().status, 'unchecked');
    assert.equal(calls, 0);
    const first = checker.check(), parallel = checker.check();
    assert.equal(calls, 1);
    finish(release('v3.2.0'));
    assert.deepEqual(await first, await parallel);
    assert.equal(checker.read().status, 'updateAvailable');
    assert.equal(checker.read().latestVersion, '3.2.0');
    await checker.check();
    assert.equal(calls, 1);
    now += 60000;
    const next = checker.check();
    finish(release('3.1.0'));
    assert.equal((await next).status, 'current');
    assert.equal(calls, 2);
});
test('a locally newer version is reported separately from an available update', async () => {
    const checker = createVersionCheck({ version: '3.1.0', fetcher: async () => release('3.0.0') });
    assert.equal((await checker.check()).status, 'ahead');
});
test('unavailable, malformed and oversized responses never claim the installation is current', async () => {
    for (const fetcher of [async () => new Response('', { status: 404 }), async () => new Response('', { status: 429 }), async () => { throw new Error('Internal network details'); }, async () => new Response('{bad'), async () => release('unknown'), async () => new Response('x'.repeat(150000))]) {
        const checker = createVersionCheck({ version: '3.1.0', fetcher }), result = await checker.check();
        assert.equal(result.status, 'unavailable');
        assert.equal(result.latestVersion, null);
        assert.ok(result.message);
        assert.doesNotMatch(result.message, /Internal network details/);
    }
});
test('a failed refresh clears an older successful claim', async () => {
    let now = 100000, calls = 0;
    const checker = createVersionCheck({ version: '3.1.0', now: () => now, fetcher: async () => ++calls === 1 ? release('3.2.0') : new Response('', { status: 503 }) });
    assert.equal((await checker.check()).status, 'updateAvailable');
    now += 60000;
    const failed = await checker.check();
    assert.equal(failed.status, 'unavailable');
    assert.equal(failed.latestVersion, null);
});
test('a slow upstream request is bounded by the timeout', async () => {
    const checker = createVersionCheck({ version: '3.1.0', timeoutMs: 25, fetcher: async (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('Timed out')), { once: true })) });
    const keepAlive = setTimeout(() => { }, 1000);
    try {
        assert.equal((await checker.check()).status, 'unavailable');
    }
    finally {
        clearTimeout(keepAlive);
    }
});
test('version check endpoints are admin-only, require CSRF and do not fetch on page reads', async (t) => {
    let calls = 0;
    const f = await runtimeFixture(t, { versionFetch: async () => { calls++; return release('99.0.0'); } }), { auth } = await f.setup();
    const initial = await (await f.request('/api/admin/version-check', 'GET', undefined, auth)).json();
    assert.equal(initial.status, 'unchecked');
    assert.equal(calls, 0);
    assert.equal((await f.request('/api/admin/version-check', 'POST', {}, { ...auth, 'X-CSRF-Token': 'wrong' })).status, 403);
    assert.equal(calls, 0);
    const result = await f.request('/api/admin/version-check', 'POST', {}, auth);
    assert.equal(result.status, 200);
    assert.equal((await result.json()).status, 'updateAvailable');
    assert.equal(calls, 1);
    assert.equal((await f.request('/api/admin/version-check')).status, 401);
    await f.request('/api/users', 'POST', { username: 'Reader', password: testPassword, permissions: { diagnosticsView: true } }, auth);
    const reader = (await f.login('Reader')).auth;
    for (const method of ['GET', 'POST'])
        assert.equal((await f.request('/api/admin/version-check', method, method === 'POST' ? {} : undefined, reader)).status, 403);
    const html = await (await f.request('/admin', 'GET', undefined, auth)).text();
    assert.match(html, /data-admin-nav="updates"/);
    assert.equal((await f.request('/admin-updates.js')).status, 401);
    assert.equal((await f.request('/admin-updates.js', 'GET', undefined, auth)).status, 200);
});
test('access is checked again after the remote request finishes', async (t) => {
    let finish, started;
    const incoming = new Promise(resolve => started = resolve), f = await runtimeFixture(t, { versionFetch: async () => { started(); return new Promise(resolve => finish = resolve); } }), { auth } = await f.setup();
    const created = await (await f.request('/api/users', 'POST', { username: 'Checker', role: 'admin', password: testPassword }, auth)).json(), checker = (await f.login('Checker')).auth;
    const pending = f.request('/api/admin/version-check', 'POST', {}, checker);
    await incoming;
    assert.equal((await f.request(`/api/users/${created.id}`, 'PUT', { role: 'member' }, auth)).status, 200);
    finish(release('99.0.0'));
    assert.equal((await pending).status, 403);
});
test('drafts, prereleases and unexpected payloads are rejected and remote links are ignored', async () => {
    for (const payload of [{ tag_name: '3.2.0', draft: true }, { tag_name: '3.2.0', prerelease: true }, { tag_name: 'v3.2.0-beta.1' }, null, [], { version: '3.2.0' }]) {
        const checker = createVersionCheck({ version: '3.1.0', fetcher: async () => new Response(JSON.stringify(payload)) });
        assert.equal((await checker.check()).status, 'unavailable');
    }
    const checker = createVersionCheck({ version: '3.1.0', fetcher: async () => new Response(JSON.stringify({ tag_name: 'v3.2.0', html_url: 'javascript:alert(1)' })) });
    const result = await checker.check();
    assert.equal(result.latestVersion, '3.2.0');
    assert.equal(result.releasesUrl, 'https://github.com/KaterBeratung/retourenboard/releases');
});
