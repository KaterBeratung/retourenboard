import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import { createVersionCheck } from '../dist/server/version-check.js';
import { runtimeFixture } from './helpers/runtime.js';
const release = () => new Response(JSON.stringify({ tag_name: 'v99.0.0', draft: false, prerelease: false }));
function fixture(fetcher = async () => release()) {
    let now = 100000;
    const timers = [], cleared = [];
    const checker = createVersionCheck({ version: '3.2.44', fetcher, now: () => now, schedule: (fn, delay) => { const timer = { fn, delay, unref() { } }; timers.push(timer); return timer; }, cancel: timer => cleared.push(timer) });
    return { checker, timers, cleared, advance(ms) { now += ms; } };
}
test('automatic checks run at start and again after six hours without blocking manual checks', async () => {
    let calls = 0;
    const f = fixture(async () => { calls++; return release(); });
    assert.equal(typeof f.checker.startAutomatic, 'function');
    await f.checker.startAutomatic();
    assert.equal(calls, 1);
    assert.equal(f.checker.read().automatic, true);
    assert.equal(f.checker.read().status, 'updateAvailable');
    assert.equal(f.timers[0].delay, 6 * 60 * 60 * 1000);
    await f.checker.startAutomatic();
    assert.equal(calls, 1);
    assert.equal(f.timers.length, 1);
    f.advance(60000);
    await f.checker.check();
    assert.equal(calls, 2);
    f.advance(6 * 60 * 60 * 1000);
    await f.timers[0].fn();
    assert.equal(calls, 3);
    assert.equal(f.timers.length, 2);
    f.checker.close();
    assert.equal(f.cleared.at(-1), f.timers[1]);
});
test('failed automatic checks remain unavailable and retry on the next scheduled interval', async () => {
    let calls = 0;
    const f = fixture(async () => ++calls === 1 ? new Response('', { status: 503 }) : release());
    assert.equal(typeof f.checker.startAutomatic, 'function');
    await f.checker.startAutomatic();
    assert.equal(f.checker.read().status, 'unavailable');
    assert.ok(f.checker.read().nextCheckAt);
    f.advance(6 * 60 * 60 * 1000);
    await f.timers[0].fn();
    assert.equal(f.checker.read().status, 'updateAvailable');
    f.checker.close();
});
test('closing cancels in-flight checks and prevents rescheduling or late snapshot changes', async () => {
    let finish, calls = 0, aborted = false;
    const f = fixture(async (_url, { signal }) => { calls++; signal.addEventListener('abort', () => aborted = true); return new Promise(done => finish = done); });
    assert.equal(typeof f.checker.startAutomatic, 'function');
    const pending = f.checker.startAutomatic();
    f.checker.close();
    assert.equal(aborted, true);
    finish(release());
    await pending;
    assert.equal(f.checker.read().status, 'unchecked');
    assert.equal(f.timers.length, 0);
    await f.checker.check();
    assert.equal(calls, 1);
});
test('application automatic checks start after listening and remain private to administrators', async (t) => {
    let calls = 0;
    const f = await runtimeFixture(t, { automaticVersionCheck: true, versionFetch: async () => { calls++; return release(); } }), { auth } = await f.setup();
    const status = await (await f.request('/api/admin/version-check', 'GET', undefined, auth)).json();
    assert.equal(calls, 1);
    assert.equal(status.automatic, true);
    assert.equal(status.status, 'updateAvailable');
    assert.ok(status.nextCheckAt);
    assert.equal((await f.request('/api/admin/version-check')).status, 401);
});
