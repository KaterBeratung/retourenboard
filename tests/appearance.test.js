import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import { runtimeFixture } from './helpers/runtime.js';
import { paginate } from '../dist/public/pagination.js';
import * as appearance from '../dist/public/appearance.js';
const {motionAllowed}=appearance;
test('filtering before pagination shows the first matching page and clamps removed pages', () => {
    const rows = Array.from({ length: 80 }, (_, i) => ({ id: i, match: i % 2 === 0 })), page = paginate(rows.filter(x => x.match), 1, 25);
    assert.equal(page.total, 40);
    assert.equal(page.rows.length, 25);
    assert.equal(page.rows[24].id, 48);
    assert.equal(paginate(rows.slice(0, 2), 9, 25).page, 1);
});
test('motion follows only the personal choice and system preference', () => {
    assert.equal(motionAllowed({ reduceMotion: true }, false), false);
    assert.equal(motionAllowed({ reduceMotion: false }, true), false);
    assert.equal(motionAllowed({ reduceMotion: false }, false), true);
});
test('explicit motion modes override the system only when the account requests it', () => {
    for (const [motionMode, systemReduced, expected] of [
        ['system', true, false], ['system', false, true],
        ['on', true, true], ['on', false, true],
        ['off', true, false], ['off', false, false]
    ]) assert.equal(motionAllowed({ motionMode, reduceMotion: false }, systemReduced), expected, motionMode + '/' + systemReduced);
    assert.equal(motionAllowed({ motionMode: 'system', reduceMotion: true }, false), true, 'Explicit mode supersedes the legacy flag');
    assert.equal(motionAllowed({ motionMode: 'invalid', reduceMotion: true }, false), false, 'Unknown values retain the safe legacy preference');
});
test('programmatic scrolling follows resolved motion instead of forcing motion in reduced mode', () => {
    const original = globalThis.document;
    try {
        globalThis.document = { documentElement: { dataset: { motion: 'reduce' } } };
        assert.equal(typeof appearance.motionScrollBehavior, 'function');
        assert.equal(appearance.motionScrollBehavior(), 'auto');
        document.documentElement.dataset.motion='normal';
        assert.equal(appearance.motionScrollBehavior(), 'smooth');
        delete document.documentElement.dataset.motion;
        assert.equal(appearance.motionScrollBehavior(), 'auto');
    } finally { if(original===undefined)delete globalThis.document;else globalThis.document=original; }
});
test('global appearance and logo functions are unavailable, including direct URLs', async (t) => {
    const f = await runtimeFixture(t), { auth } = await f.setup();
    for (const [path, method, body] of [['/api/admin/appearance', 'GET'], ['/api/admin/appearance', 'PUT', { compact: true }], ['/api/admin/appearance/logo', 'POST', { logo: 'removed' }], ['/api/admin/appearance/logo', 'DELETE'], ['/api/appearance/logo', 'GET']]) {
        assert.equal((await f.request(path, method, body, auth)).status, 404, path + ' ' + method);
    }
    assert.equal((await f.request('/admin-appearance.js')).status, 404);
    const html = await (await f.request('/admin')).text();
    assert.doesNotMatch(html, /data-admin-nav="appearance"|Konten &amp; Darstellung|Konten & Darstellung/);
});
test('legacy appearance settings do not affect the application and obsolete account rights are absent', async (t) => {
    const f = await runtimeFixture(t), { auth } = await f.setup(), old = JSON.stringify({ companyName: 'Legacy', pageSize: 100, compact: true, animations: false });
    await f.app.store.db.query("INSERT INTO app_preferences(section,value) VALUES($1,$2)", ['appearance', old]);
    const config = await (await f.request('/api/config', 'GET', undefined, auth)).json();
    assert.equal(Object.hasOwn(config, 'appearance'), false);
    assert.equal(Object.hasOwn(config, 'logo'), false);
    assert.equal((await f.app.store.db.query("SELECT value FROM app_preferences WHERE section=$1", ['appearance'])).rows[0].value, old, 'Stored legacy data remains recoverable');
    const admin = (await (await f.request('/api/session', 'GET', undefined, auth)).json()).user;
    assert.equal(Object.hasOwn(admin.permissions, 'appearanceManage'), false);
    const { PERMISSION_KEYS, canAdminSection } = await import('../dist/shared/permissions.js');
    assert.ok(!PERMISSION_KEYS.includes('appearanceManage'));
    assert.equal(canAdminSection({ role: 'member', permissions: { appearanceManage: true } }, 'appearance'), false);
    assert.equal((await f.request('/api/users', 'POST', { username: 'LegacyRight', password: 'Testkonto-Passwort!', permissions: { appearanceManage: true } }, auth)).status, 400);
});
