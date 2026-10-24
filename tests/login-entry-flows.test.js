import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import { startLoginEntry } from '../dist/public/bootstrap.js';
import { runtimeFixture, testPassword } from './helpers/runtime.js';
import { enableMfa, appCode } from './helpers/mfa.js';
// Use the production login/2FA handlers and real HTTP server, replacing only
// browser DOM controls and the browser's cookie jar.
function node() { return { dataset: {}, hidden: false, isConnected: true, focus() { }, setAttribute() { }, addEventListener(type, fn) { this['on' + type] = fn; }, closest() { return null; } }; }
function form() {
    const result = node(), button = node(), error = node();
    result.values = {};
    result.nodes = {};
    result.querySelector = selector => selector === '[type=submit]' ? button : ['.form-error', '[role=alert]'].includes(selector) ? error : result.nodes[selector] ??= node();
    result.prepend = status => result.nodes['.unsaved-status'] = status;
    result.querySelectorAll = () => [];
    Object.defineProperty(result, 'innerHTML', { set(html) { result.html = html; result.values = {}; } });
    return result;
}
function boundary(t) {
    const originals = { document: globalThis.document, FormData: globalThis.FormData };
    const container = () => {
        const result = node();
        result.nodes = {};
        Object.defineProperty(result, 'innerHTML', { get() { return result.html ?? ''; }, set(html) { result.html = html; result.form = /<form\b/.test(html) ? form() : null; result.nodes = {}; } });
        result.querySelector = selector => selector === 'form' ? result.form : selector.startsWith('[name=') ? result.form?.querySelector(selector) : result.nodes[selector] ??= node();
        result.querySelectorAll = () => [];
        result.replaceChildren = () => result.innerHTML = '';
        return result;
    };
    const page = container(), dialog = container();
    dialog.open = false;
    dialog.showModal = () => dialog.open = true;
    dialog.close = () => dialog.open = false;
    globalThis.document = { querySelector: selector => selector === '#auth-page' ? page : selector === '#dialog' ? dialog : null, createElement: () => node() };
    globalThis.FormData = class extends Map {
        constructor(form) { super(Object.entries(form.values)); }
    };
    t.after(() => {
        for (const [key, value] of Object.entries(originals)) {
            if (value === undefined)
                delete globalThis[key];
            else
                globalThis[key] = value;
        }
    });
    return { page, dialog };
}
async function entry(t, f) {
    const { page, dialog } = boundary(t);
    let cookie = '', loads = 0;
    const responses = [], destinations = [];
    const request = async (path, options = {}) => {
        const response = await fetch(f.base + path, { ...options, headers: { ...options.headers, Origin: f.base, ...(cookie ? { Cookie: cookie } : {}) } });
        if (response.headers.get('set-cookie'))
            cookie = response.headers.get('set-cookie').split(';')[0];
        responses.push({ path, data: await response.clone().json().catch(() => null) });
        return response;
    };
    const ctx = await startLoginEntry({ page, request, isLoginPage: true, readLocation: () => f.base + '/login?returnTo=%2Fadmin%23settings', redirect: url => { assert.equal(url, '/admin#settings'); destinations.push(url); }, loadApp: async () => loads++ });
    const submit = async (target, values) => { target.values = values; await target.onsubmit({ preventDefault() { } }); };
    return { ctx, page, dialog, responses, submit, get loads() { return loads; }, get redirects() { assert.equal(loads, 0, 'Login must never import application modules'); return destinations.length; }, get cookie() { return cookie; } };
}
test('first administrator setup redirects only after account creation', async (t) => {
    const f = await runtimeFixture(t), ui = await entry(t, f);
    assert.equal(ui.page.dataset.stage, 'setup');
    assert.equal(ui.redirects, 0);
    assert.match(ui.page.html, /class="brand-mark"[^>]*><img[^>]*src="\/favicon\.svg"[^>]*alt=""/);
    await ui.submit(ui.page.form, { username: 'Admin', displayName: 'Max', password: testPassword, passwordConfirm: testPassword });
    assert.equal(ui.ctx.unlocked, true);
    assert.equal(ui.redirects, 1);
    assert.equal(ui.ctx.session.user.role, 'admin');
});
test('incorrect password leaves a retryable login and a corrected password redirects to the application', async (t) => {
    const f = await runtimeFixture(t);
    await f.setup();
    const ui = await entry(t, f);
    await ui.submit(ui.page.form, { username: 'Admin', password: 'wrong' });
    assert.equal(ui.redirects, 0);
    assert.equal(ui.page.form.querySelector('.form-error').hidden, false);
    await ui.submit(ui.page.form, { username: 'Admin', password: testPassword });
    assert.equal(ui.redirects, 1);
    assert.equal(ui.ctx.unlocked, true);
});
for (const factor of ['app code', 'recovery code'])
    test(`the public login completes 2FA with ${factor} before navigating to the application`, async (t) => {
        let now = 1791374400000;
        const f = await runtimeFixture(t, { now: () => now }), { auth } = await f.setup(), mfa = await enableMfa(f, auth, now);
        now += 30000;
        const ui = await entry(t, f);
        await ui.submit(ui.page.form, { username: 'Admin', password: testPassword });
        assert.equal(ui.page.dataset.stage, 'mfa');
        assert.equal(ui.redirects, 0);
        assert.equal((await f.request('/app.js')).status, 401);
        await ui.submit(ui.page.form, { code: 'invalid' });
        assert.equal(ui.redirects, 0);
        assert.equal(ui.page.dataset.stage, 'mfa');
        await ui.submit(ui.page.form, { code: factor === 'app code' ? appCode(mfa.secret, now) : mfa.recoveryCodes[0] });
        assert.equal(ui.redirects, 1);
        assert.equal(ui.ctx.unlocked, true);
    });
test('required authenticator enrollment stays public until recovery codes are acknowledged', async (t) => {
    const now = 1791374400000;
    const f = await runtimeFixture(t, { now: () => now }), { auth } = await f.setup();
    const worker = await (await f.request('/api/users', 'POST', { username: 'Worker', password: testPassword }, auth)).json();
    assert.equal((await f.request(`/api/users/${worker.id}/mfa/reset`, 'POST', { password: testPassword, confirmed: true }, auth)).status, 200);
    const ui = await entry(t, f);
    await ui.submit(ui.page.form, { username: 'Worker', password: testPassword });
    assert.equal(ui.redirects, 0);
    assert.equal(ui.dialog.open, true);
    const pending = ui.responses.find(response => response.path === '/api/login/mfa/setup').data;
    await ui.submit(ui.dialog.form, { code: appCode(pending.secret, now) });
    assert.equal(ui.redirects, 0);
    assert.match(ui.dialog.innerHTML, /Recoverycodes sichern/);
    assert.equal((await f.request('/app.js')).status, 401);
    await ui.submit(ui.dialog.form, { saved: 'on' });
    assert.equal(ui.redirects, 1);
    assert.equal(ui.ctx.session.user.id, worker.id);
});
