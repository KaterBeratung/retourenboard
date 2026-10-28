import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runtimeFixture } from './helpers/runtime.js';
// Follow the actual script graph a fresh browser receives, including re-exports.
async function scriptsFrom(request, route, auth = {}) {
    const html = await (await request(route, 'GET', undefined, auth)).text();
    const pending = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(match => match[1]);
    const visited = new Set();
    while (pending.length) {
        const path = pending.pop();
        if (visited.has(path))
            continue;
        visited.add(path);
        const response = await request(path, 'GET', undefined, auth);
        assert.equal(response.status, 200, path);
        assert.match(response.headers.get('content-type'), /^text\/javascript/);
        const source = await response.text();
        for (const match of source.matchAll(/(?:import|export)\s+(?:[^;]*?\s+from\s+)?['"]([^'"]+)['"]/g)) {
            const url = new URL(match[1], 'http://test' + path);
            pending.push(url.pathname);
        }
    }
    return visited;
}
test('fresh unauthenticated pages only load the login module graph', async (t) => {
    const { request } = await runtimeFixture(t);
    for (const route of ['/', '/admin', '/admin.html', '/account', '/account.html', '/chat']) {
        const scripts = await scriptsFrom(request, route);
        assert.ok(scripts.has('/bootstrap.js'), route);
        assert.ok(scripts.has('/i18n.js'), route + ' must support language switching on the login page');
        for (const path of ['/app.js', '/sidebar-navigation.js', '/admin.js', '/account.js', '/accounts.js', '/forms.js', '/import.js', '/chat.js', '/permission-editor.js', '/shared/permissions.js', '/i18n-catalog.js'])
            assert.ok(!scripts.has(path), route + ' must not load ' + path);
    }
});
test('application modules reject direct anonymous GET and HEAD, and revoked or expired sessions', async (t) => {
    let now = Date.now();
    const { request, setup, login } = await runtimeFixture(t, { now: () => now });
    const publicScripts = await scriptsFrom(request, '/');
    for(const path of await scriptsFrom(request,'/s/'+'a'.repeat(22)))publicScripts.add(path);
    const manifest = ['runtime-files.txt', 'compiled-runtime-files.txt'].map(file => readFileSync(new URL('../deploy/' + file, import.meta.url), 'utf8')).join('\n');
    const privateScripts = manifest.split(/\r?\n/).filter(path => /^public\/[^/]+\.js$/.test(path)).map(path => path.replace('public', '')).filter(path => !publicScripts.has(path));
    assert.ok(privateScripts.includes('/app.js'));
    assert.ok(privateScripts.includes('/sidebar-navigation.js'));
    const { auth } = await setup();
    for (const path of [...privateScripts, '/shared/csv.js', '/shared/model.js', '/vendor/pdfjs/pdf.min.mjs', '/vendor/pdfjs/pdf.worker.min.mjs']) {
        for (const method of ['GET', 'HEAD'])
            assert.equal((await request(path, method)).status, 401, path + ' ' + method);
        const response = await request(path, 'GET', undefined, auth);
        assert.equal(response.status, 200, path);
        assert.match(response.headers.get('cache-control'), /private.*no-store/);
        assert.match(response.headers.get('vary'), /Cookie/i);
    }
    assert.equal((await request('/api/logout', 'POST', {}, auth)).status, 200);
    assert.equal((await request('/app.js', 'GET', undefined, auth)).status, 401);
    const again = await login('Admin');
    assert.equal(again.res.status, 200);
    now += 9 * 60 * 60 * 1000;
    assert.equal((await request('/app.js', 'GET', undefined, again.auth)).status, 401);
    assert.equal((await request('/bootstrap.js')).status, 200);
});
async function loader(session, overrides = {}) {
    const { startLoginEntry } = await import('../dist/public/bootstrap.js');
    const calls = [], shown = [], loads = [], destinations = [];
    const retry = { onclick: null }, page = { innerHTML: '', querySelector: () => retry };
    const request = async (path) => { calls.push(path); return { ok: true, status: 200, json: async () => session.value }; };
    const ctx = await startLoginEntry({ request, isLoginPage: true, readLocation: () => 'http://test/login', redirect: url => destinations.push(url), loadApp: async () => loads.push('app'), showLogin: ctx => shown.push(ctx.session), page, ...overrides });
    return { ctx, calls, shown, loads, page, destinations };
}
test('the login loader waits for a confirmed session and redirects once', async () => {
    const session = { value: { unlocked: false, setupRequired: false, version: 'test' } };
    const { ctx, calls, shown, loads, destinations } = await loader(session);
    assert.deepEqual(calls, ['/api/session']);
    assert.equal(shown.length, 1);
    assert.deepEqual(loads, []);
    await ctx.reload();
    assert.deepEqual(loads, []);
    session.value = { unlocked: true, user: { id: 1 }, csrfToken: 'token' };
    ctx.applySession(session.value);
    await Promise.all([ctx.reload(), ctx.reload()]);
    assert.deepEqual(loads, []);
    assert.deepEqual(destinations, ['/#overview']);
});
test('an existing session opens the application immediately without rendering login', async () => {
    const { loads, shown } = await loader({ value: { unlocked: true, user: { id: 1 }, csrfToken: 'token' } }, { isLoginPage: false });
    assert.deepEqual(loads, ['app']);
    assert.deepEqual(shown, []);
});
test('a login challenge or a session revoked during login does not start the application', async () => {
    const session = { value: { unlocked: false, setupRequired: true } };
    const { ctx, shown, loads } = await loader(session);
    assert.equal(shown[0].setupRequired, true);
    ctx.applySession({ unlocked: true, user: { id: 1 }, csrfToken: 'token' });
    await ctx.reload();
    assert.deepEqual(loads, []);
    assert.equal(ctx.unlocked, false);
});
test('failed session checks show a retry without loading protected modules', async () => {
    const loads = [];
    let offline = true;
    const { ctx, page } = await loader({ value: { unlocked: false } }, { loadApp: async () => loads.push('app'), request: async () => {
            if (offline)
                throw new Error('offline');
            return { ok: true, json: async () => ({ unlocked: false }) };
        } });
    assert.match(page.innerHTML, /Verbindung/);
    assert.deepEqual(loads, []);
    offline = false;
    await ctx.reload();
    assert.equal(ctx.unlocked, false);
    assert.deepEqual(loads, []);
});
test('a failed module handoff retries with a fresh document rather than a cached failed import', async () => {
    let restarts = 0;
    const { page } = await loader({ value: { unlocked: true, user: { id: 1 }, csrfToken: 'token' } }, { isLoginPage: false, loadApp: async () => { throw new Error('module unavailable'); }, restart: () => restarts++ });
    assert.match(page.innerHTML, /module unavailable/);
    page.querySelector('#auth-retry').onclick();
    assert.equal(restarts, 1);
});
