import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import { runtimeFixture } from './helpers/runtime.js';
const jobs = await import('../dist/server/jobs.js').catch(() => ({}));
test('backup scheduler uses Berlin calendar days and only one DST occurrence', () => {
    const s = { enabled: true, frequency: 'daily', time: '02:00', weekday: 0, timezone: 'Europe/Berlin', retain: 7 };
    assert.equal(typeof jobs.nextBackupAt, 'function');
    assert.equal(new Date(jobs.nextBackupAt(s, { now: () => Date.parse('2026-10-24T12:00:00Z') })).toISOString(), '2026-10-25T00:00:00.000Z');
    assert.equal(new Date(jobs.nextBackupAt(s, { now: () => Date.parse('2026-10-25T00:01:00Z') })).toISOString(), '2026-10-26T01:00:00.000Z');
    assert.equal(new Date(jobs.nextBackupAt(s, { now: () => Date.parse('2026-03-28T12:00:00Z') })).toISOString(), '2026-03-29T01:00:00.000Z');
    assert.equal(jobs.nextBackupAt({ ...s, enabled: false }, { now: Date.now }), null);
});
test('scheduler catches up once and preserves the slot across a worker restart', async (t) => {
    const now = Date.parse('2026-10-06T12:00:00Z'), f = await runtimeFixture(t, { now: () => now });
    await f.app.jobs.tick();
    assert.equal((await f.app.backups.list()).length, 0);
    await f.setup();
    await f.app.jobs.tick();
    assert.equal((await f.app.backups.list()).filter(x => x.mode === 'auto').length, 1);
    await f.app.jobs.close();
    const worker = jobs.createJobs({ store: f.app.store, preferences: f.app.preferences, backups: f.app.backups, coordinator: f.app.coordinator, clock: { now: () => now } });
    try {
        await worker.tick();
        assert.equal((await f.app.backups.list()).filter(x => x.mode === 'auto').length, 1);
    }
    finally {
        await worker.close();
    }
});
