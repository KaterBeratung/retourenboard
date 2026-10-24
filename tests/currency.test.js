import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import { runtimeFixture, testPassword } from './helpers/runtime.js';
import { postgresFixture } from './helpers/postgres.js';
import { migratePostgres } from '../dist/server/database/migrations.js';
import { validateTransferredData } from '../dist/server/database/validate-data.js';
import { createCurrency, CURRENCY_RATE_URL } from '../dist/server/currency.js';
import { createWriteCoordinator } from '../dist/server/write-coordinator.js';
import { assertRestoreSchema } from '../dist/server/restore-validation.js';
const fixedNow = Date.UTC(2026, 9, 8, 12);
const quote = (rate = 1.1642, date = '2026-10-08') => new Response(JSON.stringify({ date, base: 'EUR', quote: 'USD', rate }));
test('any signed-in account can request USD display rates without changing the shared default', async (t) => {
    let calls = 0;
    const f = await runtimeFixture(t, { now: () => fixedNow, currencyFetch: async () => { calls++; return quote(); } }), { auth } = await f.setup();
    await f.request('/api/users', 'POST', { username: 'Viewer', role: 'viewer', password: testPassword }, auth);
    const viewer = (await f.login('Viewer')).auth;
    assert.equal((await f.request('/api/currency?display=USD')).status, 401);
    const response = await f.request('/api/currency?display=USD', 'GET', undefined, viewer);
    assert.equal(response.status, 200);
    const value = await response.json();
    assert.equal(value.display, 'USD');
    assert.equal(value.rate, 1.1642);
    assert.equal(calls, 1);
    const config = await (await f.request('/api/config', 'GET', undefined, viewer)).json();
    assert.equal(config.currency.display, 'EUR');
    assert.equal((await f.request('/api/currency?display=GBP', 'GET', undefined, viewer)).status, 400);
    assert.equal((await f.request('/api/currency?display=USD&display=EUR', 'GET', undefined, viewer)).status, 400);
    assert.equal((await f.request('/api/admin/settings', 'PUT', { displayCurrency: 'USD' }, viewer)).status, 403);
});
test('EUR is the global display default without contacting the rate provider', async (t) => {
    let calls = 0;
    const f = await runtimeFixture(t, { now: () => fixedNow, currencyFetch: async () => { calls++; return quote(); } }), { auth } = await f.setup();
    const config = await (await f.request('/api/config', 'GET', undefined, auth)).json();
    assert.deepEqual(config.currency, { base: 'EUR', display: 'EUR', rate: null, date: null, checkedAt: null, stale: false, status: 'disabled', source: 'ECB · Frankfurter' });
    const settings = await (await f.request('/api/admin/settings', 'GET', undefined, auth)).json();
    assert.equal(settings.settings.displayCurrency, 'EUR');
    assert.deepEqual(settings.currency, config.currency);
    assert.equal(calls, 0);
    assert.equal((await f.request('/api/currency')).status, 401);
});
test('a global USD setting converts only display metadata and preserves EUR CRUD and CSV amounts', async (t) => {
    let calls = 0;
    const f = await runtimeFixture(t, { now: () => fixedNow, currencyFetch: async () => { calls++; return quote(); } }), { auth } = await f.setup();
    const product = await (await f.request('/api/products', 'POST', { sku: 'EUR-1', name: 'Monitor', price: '10,00' }, auth)).json();
    assert.equal(product.priceCents, 1000);
    const save = await f.request('/api/admin/settings', 'PUT', { displayCurrency: 'USD' }, auth);
    assert.equal(save.status, 200);
    const saved = await save.json();
    assert.equal(saved.settings.displayCurrency, 'USD');
    assert.equal(saved.restartRequired, false);
    assert.equal(saved.currency.rate, 1.1642);
    assert.equal(saved.currency.status, 'current');
    await f.request('/api/users', 'POST', { username: 'Worker', password: testPassword }, auth);
    const worker = (await f.login('Worker')).auth;
    const config = await (await f.request('/api/config', 'GET', undefined, worker)).json();
    assert.equal(config.currency.display, 'USD');
    assert.equal(config.currency.base, 'EUR');
    assert.equal((await (await f.request('/api/products', 'GET', undefined, worker)).json())[0].priceCents, 1000);
    const csv = await (await f.request('/api/export/products', 'GET', undefined, auth)).text();
    assert.match(csv, /10,00/);
    assert.doesNotMatch(csv, /11,64/);
    assert.equal(calls, 1);
    assert.deepEqual(await (await f.request('/api/currency', 'GET', undefined, worker)).json(), config.currency);
});
test('invalid currency values are rejected and a missing rate cannot partially save settings', async (t) => {
    let calls = 0;
    const f = await runtimeFixture(t, { now: () => fixedNow, currencyFetch: async () => { calls++; throw new Error('private network detail'); } }), { auth } = await f.setup();
    for (const displayCurrency of ['usd', 'GBP', '', 1, null, {}, ['USD']])
        assert.equal((await f.request('/api/admin/settings', 'PUT', { displayCurrency }, auth)).status, 400);
    assert.equal(calls, 0);
    const failed = await f.request('/api/admin/settings', 'PUT', { displayCurrency: 'USD', uploadMaxMb: 17 }, auth);
    assert.equal(failed.status, 503);
    assert.match((await failed.json()).error, /Kurs|Wechselkurs/);
    const settings = await (await f.request('/api/admin/settings', 'GET', undefined, auth)).json();
    assert.equal(settings.settings.displayCurrency, 'EUR');
    assert.equal(settings.settings.uploadMaxMb, 10);
    const retry = await f.request('/api/admin/settings', 'PUT', { displayCurrency: 'USD' }, auth);
    assert.equal(retry.status, 503);
    assert.equal(calls, 1);
});
test('refresh requires true administrator rights and CSRF while showing a cached rate on EUR', async (t) => {
    let calls = 0;
    const f = await runtimeFixture(t, { now: () => fixedNow, currencyFetch: async () => { calls++; return quote(); } }), { auth } = await f.setup();
    await f.request('/api/users', 'POST', { username: 'Viewer', password: testPassword, role: 'viewer' }, auth);
    const viewer = (await f.login('Viewer')).auth;
    assert.equal((await f.request('/api/admin/currency/refresh', 'POST', {})).status, 401);
    assert.equal((await f.request('/api/admin/currency/refresh', 'POST', {}, viewer)).status, 403);
    assert.equal((await f.request('/api/admin/currency/refresh', 'POST', {}, { ...auth, 'X-CSRF-Token': 'bad' })).status, 403);
    assert.equal(calls, 0);
    const response = await f.request('/api/admin/currency/refresh', 'POST', {}, auth);
    assert.equal(response.status, 200);
    const currency = await response.json();
    assert.equal(currency.display, 'EUR');
    assert.equal(currency.rate, 1.1642);
    assert.equal(currency.status, 'disabled');
    assert.equal((await f.request('/api/export/products', 'GET', undefined, viewer)).status, 403);
    assert.equal((await f.request('/api/admin/currency/refresh', 'POST', {}, auth)).status, 200);
    assert.equal(calls, 1);
});
test('pending external rate fetch does not hold the mutation queue and rechecks admin access', async (t) => {
    let finish, started;
    const incoming = new Promise(resolve => started = resolve), f = await runtimeFixture(t, { now: () => fixedNow, currencyFetch: async () => { started(); return new Promise(resolve => finish = resolve); } }), { auth } = await f.setup();
    const user = await (await f.request('/api/users', 'POST', { username: 'Changer', role: 'admin', password: testPassword }, auth)).json(), changer = (await f.login('Changer')).auth;
    const pending = f.request('/api/admin/settings', 'PUT', { displayCurrency: 'USD', uploadMaxMb: 17 }, changer);
    assert.equal(await Promise.race([incoming.then(() => true), pending.then(() => false)]), true);
    const revoke = await f.request(`/api/users/${user.id}`, 'PUT', { role: 'member' }, auth);
    assert.equal(revoke.status, 200);
    finish(quote());
    assert.equal((await pending).status, 403);
    assert.equal((await f.app.settings.get()).displayCurrency, 'EUR');
    assert.equal((await f.app.settings.get()).uploadMaxMb, 10);
});
async function serviceFixture(t, options = {}) {
    const f = await postgresFixture(t), db = f.database;
    await migratePostgres(db);
    const coordinator = createWriteCoordinator(), service = await createCurrency({ db, coordinator, ...options });
    t.after(async () => { service.close(); await coordinator.close(); await db.close(); });
    return { db, coordinator, service };
}
test('a valid rate survives a service restart even when the fetch finishes after its start time', async (t) => {
    let now = fixedNow, calls = 0;
    const { db, coordinator, service } = await serviceFixture(t, { now: () => now, fetcher: async () => { calls++; now += 20; return quote(); } });
    assert.equal((await service.current('USD')).rate, 1.1642);
    service.close();
    const restarted = await createCurrency({ db, coordinator, now: () => now, fetcher: async () => { calls++; throw new Error('offline'); } });
    t.after(() => restarted.close());
    const restored = await restarted.current('USD');
    assert.equal(restored.rate, 1.1642);
    assert.equal(restored.status, 'current');
    assert.equal(calls, 1);
});
test('concurrent requests share the fixed HTTPS fetch and normal refresh waits one hour', async (t) => {
    let now = fixedNow, calls = 0, finish;
    const { service } = await serviceFixture(t, { now: () => now, fetcher: async (url, options) => {
            calls++;
            assert.equal(url, CURRENCY_RATE_URL);
            assert.equal(options.redirect, 'error');
            assert.equal(options.headers.Authorization, undefined);
            assert.equal(options.body, undefined);
            assert.ok(options.signal);
            return new Promise(resolve => finish = resolve);
        } });
    assert.equal((await service.current('EUR')).rate, null);
    assert.equal(calls, 0);
    const first = service.current('USD'), second = service.current('USD');
    assert.equal(calls, 1);
    finish(quote());
    assert.deepEqual(await first, await second);
    now += 3599999;
    assert.equal((await service.current('USD')).status, 'current');
    assert.equal(calls, 1);
    now++;
    const refresh = service.current('USD');
    finish(quote(1.15));
    assert.equal((await refresh).rate, 1.15);
    assert.equal(calls, 2);
});
test('failed refresh retains the rate, marks it stale and cannot retry before five minutes', async (t) => {
    let now = fixedNow, calls = 0;
    const { service } = await serviceFixture(t, { now: () => now, fetcher: async () => ++calls === 1 ? quote() : new Response('', { status: 503 }) });
    const valid = await service.current('USD');
    now += 3600000;
    const failed = await service.current('USD');
    assert.equal(failed.rate, 1.1642);
    assert.equal(failed.date, '2026-10-08');
    assert.equal(failed.checkedAt, valid.checkedAt);
    assert.equal(failed.stale, true);
    assert.equal(failed.status, 'cached');
    await service.refresh('USD');
    now += 299999;
    await service.current('USD');
    await service.refresh('USD');
    assert.equal(calls, 2);
    now++;
    await service.refresh('USD');
    assert.equal(calls, 3);
});
test('quotes older than four days are visibly stale rather than claimed current', async (t) => {
    const { service } = await serviceFixture(t, { now: () => fixedNow, fetcher: async () => quote(1.16, '2026-10-03') });
    const result = await service.current('USD');
    assert.equal(result.rate, 1.16);
    assert.equal(result.stale, true);
    assert.equal(result.status, 'cached');
});
test('future-dated quotes are rejected throughout the current UTC day', async (t) => {
    for (const now of [Date.UTC(2026, 9, 8, 0), Date.UTC(2026, 9, 8, 23, 59)]) {
        const { service, db } = await serviceFixture(t, { now: () => now, fetcher: async () => quote(1.16, '2026-10-09') });
        const result = await service.current('USD');
        assert.equal(result.rate, null);
        assert.equal(result.status, 'unavailable');
        assert.equal((await db.query("SELECT COUNT(*) AS total FROM currency_rates", [])).rows[0].total, 0);
    }
});
test('malformed, wrong-pair, implausible, oversized and unavailable responses cannot create a fallback rate', async (t) => {
    const invalid = [null, [], { base: 'USD', quote: 'EUR', date: '2026-10-08', rate: 1.16 }, { base: 'EUR', quote: 'GBP', date: '2026-10-08', rate: 1.16 }, ...['0', 0, -1, 0.09, 10.01, null].map(rate => ({ base: 'EUR', quote: 'USD', date: '2026-10-08', rate })), ...['2026-02-30', '2026-10-10', '2026-1-8', 'wrong'].map(date => ({ base: 'EUR', quote: 'USD', date, rate: 1.16 }))];
    const responses = [...invalid.map(value => () => new Response(JSON.stringify(value))), () => new Response('{'), () => new Response('x'.repeat(32769)), () => new Response('', { status: 429 }), () => { throw new Error('private proxy address'); }];
    for (const response of responses) {
        const { service } = await serviceFixture(t, { now: () => fixedNow, fetcher: async () => response() }), result = await service.current('USD');
        assert.equal(result.rate, null);
        assert.equal(result.status, 'unavailable');
        assert.equal(result.stale, true);
    }
});
test('slow requests time out and close prevents writes from an in-flight fetch', async (t) => {
    const timed = await serviceFixture(t, { now: () => fixedNow, timeoutMs: 25, fetcher: async (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true })) });
    const keepAlive = setTimeout(() => { }, 1000);
    try {
        assert.equal((await timed.service.current('USD')).status, 'unavailable');
    }
    finally {
        clearTimeout(keepAlive);
    }
    let finish;
    const { db, service } = await serviceFixture(t, { now: () => fixedNow, fetcher: async () => new Promise(resolve => finish = resolve) }), pending = service.current('USD');
    service.close();
    finish(quote());
    assert.equal((await pending).rate, null);
    assert.equal((await db.query("SELECT COUNT(*) AS total FROM currency_rates", [])).rows[0].total, 0);
});
test('a manual refresh without a first valid quote reports service unavailable', async (t) => {
    const f = await runtimeFixture(t, { now: () => fixedNow, currencyFetch: async () => new Response('', { status: 503 }) }), { auth } = await f.setup();
    const response = await f.request('/api/admin/currency/refresh', 'POST', {}, auth);
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /Wechselkurs/);
    assert.equal((await f.app.settings.get()).displayCurrency, 'EUR');
});
test('refresh checks account credentials again after the rate provider returns', async (t) => {
    let finish, started;
    const incoming = new Promise(resolve => started = resolve), f = await runtimeFixture(t, { now: () => fixedNow, currencyFetch: async () => { started(); return new Promise(resolve => finish = resolve); } }), { auth } = await f.setup();
    const user = await (await f.request('/api/users', 'POST', { username: 'Refresher', role: 'admin', password: testPassword }, auth)).json(), refresher = (await f.login('Refresher')).auth;
    const pending = f.request('/api/admin/currency/refresh', 'POST', {}, refresher);
    await incoming;
    assert.equal((await f.request(`/api/users/${user.id}`, 'PUT', { password: 'GeaendertesTest-Passwort!' }, auth)).status, 200);
    finish(quote());
    assert.equal((await pending).status, 401);
});
test('display code remains private and global currency reads recheck the session', async (t) => {
    let finish, started;
    const incoming = new Promise(resolve => started = resolve), f = await runtimeFixture(t, { now: () => fixedNow, currencyFetch: async () => { started(); return new Promise(resolve => finish = resolve); } }), { auth } = await f.setup();
    assert.equal((await f.request('/inventory-display.js')).status, 401);
    assert.equal((await f.request('/inventory-display.js', 'GET', undefined, auth)).status, 200);
    await f.app.settings.update({ displayCurrency: 'USD' });
    const pending = f.request('/api/config', 'GET', undefined, auth);
    await incoming;
    assert.equal((await f.request('/api/logout', 'POST', {}, auth)).status, 200);
    finish(quote());
    assert.equal((await pending).status, 401);
});
test('the persisted ordinary rate cache is accepted by backup restore validation', async (t) => {
    const f = await runtimeFixture(t, { now: () => fixedNow, currencyFetch: async () => quote() });
    assert.equal((await f.app.currency.current('USD')).rate, 1.1642);
    await assert.doesNotReject(async () => validateTransferredData(f.app.store.db, f.dataDir));
});
