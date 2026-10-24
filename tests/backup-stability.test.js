import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, unlinkSync, existsSync, renameSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { get as httpGet } from 'node:http';
import { gzipSync } from 'node:zlib';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { runtimeFixture } from './helpers/runtime.js';
import { createBackups } from '../dist/server/backups.js';
import { BACKUP_LIMITS } from '../dist/shared/backup-contract.js';

const actor = { id: null, name: 'Backup regression', source: 'system' };

// Keep the real store, archive writer, coordinator and filesystem. Only the
// failing persistence boundary is replaced, after the normal fixture setup.
async function service(f, options = {}) {
    return createBackups({ store: f.app.store, dataDir: f.dataDir, coordinator: f.app.coordinator,
        clock: { now: Date.now }, preferences: f.app.preferences, version: '4.0.9', ...options });
}

test('a rotation settings failure keeps the new backup complete and downloadable', async t => {
    const f = await runtimeFixture(t); await f.setup();
    const backups = await service(f, { preferences: { get: async () => { throw Error('rotation settings unavailable'); } } });
    t.after(() => backups.close());
    let created;
    await assert.doesNotReject(async () => { created = await backups.create(actor, 'auto'); });
    assert.equal(created.state, 'complete');
    assert.equal((await backups.get(created.id)).state, 'complete');
    assert.ok(existsSync(join(f.dataDir, 'backups', created.filename)));
    assert.equal(backups.status().cleanupError?.id, created.id);
    assert.equal((await f.app.store.db.query("SELECT COUNT(*) AS n FROM events WHERE type='backupError'")).rows[0].n, 0);
});

test('automatic rotation always retains the newly completed archive when timestamps tie', async t => {
    const f = await runtimeFixture(t); await f.setup();
    await f.app.preferences.update('backups', { retain: 1 });
    const old = await f.app.backups.create(actor, 'auto');
    // UUID ordering must never put an old backup ahead of the just-created one.
    await f.app.store.db.query("UPDATE backup_jobs SET id=$1,createdAt=$2 WHERE id=$3", ['ffffffff-ffff-ffff-ffff-ffffffffffff', '2026-10-16T12:00:00.000Z', old.id]);
    const backups = await service(f, { clock: { now: () => Date.parse('2026-10-16T12:00:00.000Z') } });
    t.after(() => backups.close());
    const created = await backups.create(actor, 'auto');
    assert.equal(created.state, 'complete');
    assert.ok(existsSync(join(f.dataDir, 'backups', created.filename)));
    assert.equal((await backups.get('ffffffff-ffff-ffff-ffff-ffffffffffff')).state, 'rotated');
});

test('an undeletable old archive is reported separately without failing the new backup', async t => {
    const f = await runtimeFixture(t); await f.setup();
    await f.app.preferences.update('backups', { retain: 1 });
    const old = await f.app.backups.create(actor, 'auto'), path = join(f.dataDir, 'backups', old.filename);
    unlinkSync(path); mkdirSync(path); // Deterministic filesystem deletion failure on Windows and Linux.
    const created = await f.app.backups.create(actor, 'auto');
    assert.equal(created.state, 'complete');
    assert.equal((await f.app.backups.get(old.id)).state, 'complete');
    assert.equal(f.app.backups.status().cleanupError?.id, created.id);
});

test('a rotated status write failure is visible without failing the new archive', async t => {
    const f = await runtimeFixture(t); await f.setup();
    await f.app.preferences.update('backups', { retain: 1 });
    const old = await f.app.backups.create(actor, 'auto'), query = f.app.store.db.query;
    f.app.store.db.query = async (sql, params) => {
        if (sql.includes("SET state='rotated'")) throw Error('rotation status write unavailable');
        return query(sql, params);
    };
    t.after(() => { f.app.store.db.query = query; });
    const created = await f.app.backups.create(actor, 'auto');
    assert.equal(created.state, 'complete');
    assert.equal((await f.app.backups.get(old.id)).state, 'complete');
    assert.equal(f.app.backups.status().cleanupError?.id, created.id);
    assert.ok(existsSync(join(f.dataDir, 'backups', created.filename)));
});

test('a backup status-write failure keeps its cause even if failure reporting also fails', async t => {
    const f = await runtimeFixture(t); await f.setup();
    const query = f.app.store.db.query, primary = Object.assign(Error('complete status write failed'), { code: '53100' });
    f.app.store.db.query = async (sql, params) => {
        if (sql.includes("SET state='complete'")) throw primary;
        if (sql.includes("SET state='failed'")) throw Error('failure status write also failed');
        return query(sql, params);
    };
    t.after(() => { f.app.store.db.query = query; });
    await assert.rejects(f.app.backups.create(actor), error => error.status === 503 && error.cause === primary);
    assert.equal(f.app.backups.status().running, false);
    assert.ok(f.app.backups.status().statusError);
});

test('archive size failure records failed status and removes partial snapshot files', async t => {
    const f = await runtimeFixture(t); await f.setup();
    const backups = await service(f, { limits: { ...BACKUP_LIMITS, maxArchiveBytes: 1 } });
    t.after(() => backups.close());
    await assert.rejects(backups.create(actor), error => error.status === 503);
    assert.equal((await backups.list())[0].state, 'failed');
    const { readdirSync } = await import('node:fs');
    assert.deepEqual(readdirSync(join(f.dataDir, 'backups')), []);
});

test('disk exhaustion while preparing a snapshot is a controlled backup failure', async t => {
    const f = await runtimeFixture(t); await f.setup();
    const original = fs.mkdtempSync, full = Object.assign(Error('snapshot filesystem full'), { code: 'ENOSPC' });
    t.mock.method(fs, 'mkdtempSync', (...args) => {
        if (String(args[0]).startsWith(join(f.dataDir, 'backups', '.snapshot-'))) throw full;
        return original(...args);
    });
    syncBuiltinESMExports();
    t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
    await assert.rejects(f.app.backups.create(actor), error => error.status === 503 && error.cause === full);
    assert.equal(f.app.backups.status().running, false);
    assert.equal((await f.app.store.db.query("SELECT COUNT(*) AS n FROM events WHERE type='backupError'")).rows[0].n, 1);
});

test('backup download streams with content length while preserving authorization and exact bytes', async t => {
    const f = await runtimeFixture(t), { auth } = await f.setup(), meta = await f.app.backups.create(actor);
    const expected = readFileSync(join(f.dataDir, 'backups', meta.filename));
    // The HTTP handler must not fall back to the old whole-buffer service API.
    f.app.backups.read = () => { throw Error('whole archive read is forbidden in HTTP downloads'); };
    const responses = await Promise.all(Array.from({ length: 3 }, () => f.request(`/api/admin/backups/${meta.id}/download`, 'GET', undefined, auth)));
    for (const response of responses) {
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('content-type'), 'application/gzip');
        assert.equal(response.headers.get('content-length'), String(expected.length));
        assert.equal(response.headers.get('content-disposition'), `attachment; filename="${meta.filename}"`);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected);
    }
    assert.equal((await f.request(`/api/admin/backups/${meta.id}/download`)).status, 401);
    await f.request('/api/users', 'POST', { username: 'Member', role: 'member', password: 'Testkonto-Passwort!' }, auth);
    const member = await f.login('Member');
    assert.equal((await f.request(`/api/admin/backups/${meta.id}/download`, 'GET', undefined, member.auth)).status, 403);
});

test('missing and damaged backup downloads return controlled errors and server stays responsive', async t => {
    const f = await runtimeFixture(t), { auth } = await f.setup(), meta = await f.app.backups.create(actor), path = join(f.dataDir, 'backups', meta.filename);
    const bytes = readFileSync(path);
    unlinkSync(path);
    assert.equal((await f.request(`/api/admin/backups/${meta.id}/download`, 'GET', undefined, auth)).status, 404);
    writeFileSync(path, bytes.subarray(0, bytes.length - 1));
    assert.equal((await f.request(`/api/admin/backups/${meta.id}/download`, 'GET', undefined, auth)).status, 503);
    writeFileSync(path, Buffer.alloc(bytes.length));
    assert.equal((await f.request(`/api/admin/backups/${meta.id}/download`, 'GET', undefined, auth)).status, 503);
    assert.equal((await f.request('/api/session')).status, 200);
});

test('backup downloads reject a linked storage folder', async t => {
    const f = await runtimeFixture(t), { auth } = await f.setup(), meta = await f.app.backups.create(actor), folder = join(f.dataDir, 'backups'), outside = join(f.dataDir, 'moved-backups');
    renameSync(folder, outside); symlinkSync(outside, folder, process.platform === 'win32' ? 'junction' : 'dir');
    assert.equal((await f.request(`/api/admin/backups/${meta.id}/download`, 'GET', undefined, auth)).status, 503);
});

test('large parallel downloads apply backpressure, survive client aborts and release download slots', async t => {
    const f = await runtimeFixture(t), { auth } = await f.setup(), meta = await f.app.backups.create(actor), path = join(f.dataDir, 'backups', meta.filename);
    const member = gzipSync(randomBytes(1024 * 1024)), expected = createHash('sha256');
    // A concatenated gzip file gives a real 64 MiB transfer without allocating
    // its complete contents in the test process.
    writeFileSync(path, Buffer.alloc(0));
    for (let i = 0; i < 64; i++) { appendFileSync(path, member); expected.update(member); }
    const size = member.length * 64;
    await f.app.store.db.query('UPDATE backup_jobs SET size=$1 WHERE id=$2', [size, meta.id]);
    const beforeBuffers = process.memoryUsage().arrayBuffers;
    const url = `${f.base}/api/admin/backups/${meta.id}/download`, paused = [];
    t.after(() => { for (const item of paused) { item.response.destroy(); item.request.destroy(); } });
    for (let i = 0; i < 4; i++) {
        const item = await new Promise((resolve, reject) => {
            const request = httpGet(url, { headers: { Cookie: auth.Cookie } }, response => { response.pause(); resolve({ request, response }); });
            request.once('error', reject);
        });
        assert.equal(item.response.statusCode, 200); paused.push(item);
    }
    const bufferGrowth = process.memoryUsage().arrayBuffers - beforeBuffers;
    t.diagnostic(`four paused ${size}-byte downloads: buffer growth ${bufferGrowth} bytes`);
    assert.ok(bufferGrowth < 32 * 1024 * 1024, 'paused downloads must not retain one complete archive per client');
    assert.equal((await f.request(`/api/admin/backups/${meta.id}/download`, 'GET', undefined, auth)).status, 503);
    const started = performance.now();
    assert.equal((await f.request('/api/session')).status, 200);
    assert.ok(performance.now() - started < 2000, 'session requests must remain responsive during paused downloads');
    for (const item of paused) { item.response.destroy(); item.request.destroy(); }
    for (let i = 0; i < 100 && f.app.backups.status().downloads; i++) await new Promise(resolve => setTimeout(resolve, 10));
    const downloaded = await f.request(`/api/admin/backups/${meta.id}/download`, 'GET', undefined, auth), hash = createHash('sha256');
    assert.equal(downloaded.status, 200);
    assert.equal(downloaded.headers.get('content-length'), String(size));
    for await (const chunk of downloaded.body) hash.update(chunk);
    assert.equal(hash.digest('hex'), expected.digest('hex'));
    for (let i = 0; i < 100 && f.app.backups.status().downloads; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(f.app.backups.status().downloads, 0);
});

test('closing the backup service waits until its open download handle is closed', async t => {
    const f = await runtimeFixture(t); await f.setup();
    const meta = await f.app.backups.create(actor), backups = await service(f), { stream } = await backups.download(meta.id);
    await backups.close();
    assert.equal(stream.closed, true);
    assert.equal(backups.status().downloads, 0);
    await assert.rejects(backups.download(meta.id), error => error.status === 503);
});

test('a backup stream read error aborts the response, releases its handle and leaves the server usable', async t => {
    const f = await runtimeFixture(t), { auth } = await f.setup(), meta = await f.app.backups.create(actor), download = f.app.backups.download;
    f.app.backups.download = async id => {
        const result = await download(id);
        result.stream.once('resume', () => queueMicrotask(() => result.stream.destroy(Object.assign(Error('simulated disk read failure'), { code: 'EIO' }))));
        return result;
    };
    await assert.rejects(async () => {
        const response = await f.request(`/api/admin/backups/${meta.id}/download`, 'GET', undefined, auth);
        await response.arrayBuffer();
    });
    for (let i = 0; i < 100 && f.app.backups.status().downloads; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(f.app.backups.status().downloads, 0);
    assert.equal((await f.request('/api/session')).status, 200);
    assert.ok(f.app.serverLog.read().entries.some(entry => /Sicherungsdownload.*Lesefehler/.test(entry.message)));
});

test('revoked administrator rights after opening a backup also close the download handle', async t => {
    const f = await runtimeFixture(t), { auth } = await f.setup();
    const second = await (await f.request('/api/users', 'POST', { username: 'BackupAdmin', role: 'admin', password: 'Testkonto-Passwort!' }, auth)).json(), login = await f.login('BackupAdmin');
    const meta = await f.app.backups.create(actor), download = f.app.backups.download;
    f.app.backups.download = async id => {
        const result = await download(id);
        await f.app.users.update(second.id, { role: 'member' });
        return result;
    };
    assert.equal((await f.request(`/api/admin/backups/${meta.id}/download`, 'GET', undefined, login.auth)).status, 403);
    for (let i = 0; i < 100 && f.app.backups.status().downloads; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(f.app.backups.status().downloads, 0);
});
