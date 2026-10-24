import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runtimeFixture } from './helpers/runtime.js';
test('restore controller binds previews to their session, expires them and bounds streaming uploads', async (t) => {
    const { createRestoreController } = await import('../dist/server/restore-controller.js');
    let now = 0;
    const f = await runtimeFixture(t);
    await f.setup();
    const backup = await f.app.backups.create({ id: null, name: 'Test', source: 'system' }), owner = { userId: 1, sessionId: 'one', authVersion: 1 };
    const c = createRestoreController({ databaseConfig:f.databaseConfig,dataDir: f.dataDir, clock: { now: () => now } });
    t.after(async () => c.close());
    const v = await c.prepareLocal(join(f.dataDir, 'backups', backup.filename), owner);
    assert.equal(v.state, 'ready');
    assert.equal('preparedDir' in v, false);
    assert.throws(() => c.get(v.id, { ...owner, sessionId: 'two' }), /gefunden/);
    now = 900001;
    assert.throws(() => c.reserve(v.id, owner), /abgelaufen/);
    const second = await c.prepareLocal(join(f.dataDir, 'backups', backup.filename), owner);
    c.reserve(second.id, owner);
    assert.throws(() => c.reserve(second.id, owner), /bereits/);
    c.discard(second.id);
    for (let i = 0; i < 4; i++)
        await c.prepareLocal(join(f.dataDir, 'backups', backup.filename), owner);
    assert.throws(() => c.prepareLocal(join(f.dataDir, 'backups', backup.filename), owner), /Zu viele/);
    const limited = createRestoreController({ databaseConfig:f.databaseConfig,dataDir: f.dataDir, clock: { now: () => now }, limits: { maxArchiveBytes: 1, maxFileBytes: 1, maxTotalBytes: 1, maxFiles: 1 } });
    t.after(async () => limited.close());
    await assert.rejects(() => limited.prepareUpload((async function* () { yield Buffer.alloc(2); })(), owner), /groß/);
});
