import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import { runtimeFixture } from './helpers/runtime.js';
import { startLoginEntry } from '../dist/public/bootstrap.js';
const routes = await import('../dist/shared/auth-navigation.js').catch(() => ({}));
test('login return paths preserve local destinations and reject external, API and login loops', () => {
    assert.equal(typeof routes.safeReturnPath, 'function');
    for (const path of ['/admin#backups', '/account', '/chat#channel-2', '/?search=test#returns?scope=open'])
        assert.equal(routes.safeReturnPath(path), path);
    for (const path of ['https://example.org', '//example.org', '/\\example.org', 'javascript:alert(1)', '/login', '/login/', '/api/logout', '/favicon.svg', '/admin\n', '/admin%2f..%2flogin'])
        assert.equal(routes.safeReturnPath(path), '/#overview', path);
    assert.equal(routes.loginPathFor('/admin#settings'), '/login?returnTo=%2Fadmin%23settings');
    assert.equal(routes.returnPathAfterLogin('http://test/login?returnTo=%2Fadmin#backups'), '/admin#backups', 'HTTP redirects may inherit the original fragment');
    assert.equal(routes.returnPathAfterLogin('http://test/login?returnTo=%2Fchat%23channel-2#wrong'), '/chat#channel-2');
    assert.equal(routes.returnPathAfterLogin('http://test/login?returnTo=https%3A%2F%2Fexample.org'), '/#overview');
});
test('protected documents redirect anonymous GET and HEAD to the dedicated login with their destination', async (t) => {
    const f = await runtimeFixture(t);
    for (const path of ['/', '/admin?test=1', '/admin/', '/admin.html', '/account', '/account.html', '/chat'])
        for (const method of ['GET', 'HEAD']) {
            const res = await fetch(f.base + path, { method, redirect: 'manual' });
            assert.equal(res.status, 302, path + ' ' + method);
            const target = new URL(res.headers.get('location'), f.base);
            assert.equal(target.pathname, '/login');
            assert.equal(target.searchParams.get('returnTo'), path);
            assert.match(res.headers.get('cache-control'), /no-store/);
            assert.match(res.headers.get('vary'), /Cookie/);
        }
    const { auth } = await f.setup();
    assert.match(await (await f.request('/admin', 'GET', undefined, auth)).text(), /class="sidebar"/);
    await f.request('/api/logout', 'POST', {}, auth);
    assert.equal((await fetch(f.base + '/account', { headers: auth, redirect: 'manual' })).status, 302);
});
test('the public login document contains only authentication UI and the shared logo', async (t) => {
    const f = await runtimeFixture(t);
    for (const path of ['/login', '/login/']) {
        const res = await f.request(path);
        assert.equal(res.status, 200);
        const html = await res.text();
        assert.match(html, /data-page="login"/);
        assert.match(html, /id="auth-page"/);
        assert.match(html, /\/favicon.svg/);
        assert.doesNotMatch(html, /class="sidebar"|class="app-shell"|id="content"|data-admin-nav/);
    }
});
function loaderOptions(url, session, loginPage) {
    const destinations = [], shown = [], loads = [];
    const options = { isLoginPage: loginPage, readLocation: () => url, redirect: value => destinations.push(value), page: { innerHTML: '', querySelector: () => ({}) },
        request: async () => ({ ok: true, json: async () => session.value }), loadApp: async () => loads.push('app'), showLogin: ctx => shown.push(ctx.session) };
    return { options, destinations, shown, loads };
}
test('an anonymous workspace redirects without rendering an inline login or loading the app', async () => {
    const b = loaderOptions('http://test/admin#backups', { value: { unlocked: false } }, false);
    await startLoginEntry(b.options);
    assert.deepEqual(b.destinations, ['/login?returnTo=%2Fadmin%23backups']);
    assert.deepEqual(b.shown, []);
    assert.deepEqual(b.loads, []);
});
test('successful login redirects once after session confirmation and never imports the app into login', async () => {
    const session = { value: { unlocked: false } }, b = loaderOptions('http://test/login?returnTo=%2Fchat%23channel-2', session, true);
    const ctx = await startLoginEntry(b.options);
    assert.equal(b.shown.length, 1);
    assert.equal(b.destinations.length, 0);
    session.value = { unlocked: true, user: { id: 1 }, csrfToken: 'token' };
    await Promise.all([ctx.reload(), ctx.reload()]);
    assert.deepEqual(b.destinations, ['/chat#channel-2']);
    assert.deepEqual(b.loads, []);
});
test('an existing session skips login and returns to its safe destination', async () => {
    const b = loaderOptions('http://test/login?returnTo=%2Fadmin%23updates', { value: { unlocked: true, user: { id: 1 }, csrfToken: 'token' } }, true);
    await startLoginEntry(b.options);
    assert.deepEqual(b.destinations, ['/admin#updates']);
    assert.deepEqual(b.shown, []);
    assert.deepEqual(b.loads, []);
});
