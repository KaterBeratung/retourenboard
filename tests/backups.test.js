import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { runtimeFixture } from './helpers/runtime.js';
import { extract } from '../dist/vendor/archive.js';
import {snapshotDatabase} from './helpers/backup-data.js';
test('backup archive is a consistent database and attachment snapshot without keys', async (t) => {
    const f = await runtimeFixture(t), { auth } = await f.setup(), p = await (await f.request('/api/products', 'POST', { sku: 'B', name: 'Gesichert' }, auth)).json(), r = await (await f.request('/api/returns', 'POST', { serialNumber: 'TEST-SN', productId: p.id, receiptDate: '2026-10-06' }, auth)).json();
    const pdf = Buffer.from('%PDF-1.7\nTest attachment');
    const uploaded = await fetch(f.base + `/api/returns/${r.id}/attachments`, { method: 'POST', headers: { Origin: f.base, ...auth, 'Content-Type': 'application/octet-stream', 'X-File-Name': 'test.pdf' }, body: pdf });
    assert.equal(uploaded.status, 201);
    const response = await f.request('/api/admin/backups/create', 'POST', {}, auth);
    assert.equal(response.status, 201);
    const meta = await response.json();
    assert.equal(meta.state, 'complete');
    assert.ok(meta.size > 0);
    const archive = await f.request(`/api/admin/backups/${meta.id}/download`, 'GET', undefined, auth);
    assert.equal(archive.status, 200);
    const target = mkdtempSync(join(f.dataDir, 'check-')), file = join(target, 'backup.tar.gz');
    writeFileSync(file, Buffer.from(await archive.arrayBuffer()));
    await extract({ file, cwd: target });
    const manifest = JSON.parse(readFileSync(join(target, 'manifest.json'), 'utf8'));
    assert.ok(manifest.files.some(x => x.path === 'data.jsonl'));
    assert.ok(manifest.files.some(x => x.path.startsWith('attachments/')));
    assert.equal(manifest.files.some(x => /secrets|\.env|wal|backups/.test(x.path)), false);
    assert.equal((await f.request(`/api/admin/backups/${meta.id}/download`)).status, 401);
});
test('rotation only removes owned automatic backups after a successful new backup', async (t) => {
    const f = await runtimeFixture(t);
    await f.setup();
    assert.ok(f.app.backups);
    const actor = { id: null, name: 'Test', source: 'system' };
    await f.app.preferences.update('backups', { retain: 2 });
    await f.app.backups.create(actor, 'manual');
    await f.app.backups.create(actor, 'manual');
    for (let i = 0; i < 4; i++)
        await f.app.backups.create(actor, 'auto');
    const list = await f.app.backups.list();
    assert.equal(list.filter(x => x.state === 'complete' && x.mode === 'auto').length, 2);
    assert.equal(list.filter(x => x.state === 'complete' && x.mode === 'manual').length, 2);
    writeFileSync(join(f.dataDir, 'backups', 'foreign.tar.gz'), 'foreign');
    await f.app.backups.create(actor, 'auto');
    assert.equal(readFileSync(join(f.dataDir, 'backups', 'foreign.tar.gz'), 'utf8'), 'foreign');
});
test('queued backup checks current administrator rights before taking a snapshot', async (t) => {
    const f = await runtimeFixture(t), { auth } = await f.setup();
    const user = await (await f.request('/api/users', 'POST', { username: 'Second', role: 'admin', password: 'Testkonto-Passwort!' }, auth)).json(), second = await f.login('Second');
    let release;
    const block = f.app.coordinator.run(() => new Promise(r => release = r));
    await new Promise(r => setImmediate(r));
    let started;
    const arrival = new Promise(r => started = r), create = f.app.backups.create;
    f.app.backups.create = async (...args) => { started(); return create(...args); };
    const pending = f.request('/api/admin/backups/create', 'POST', {}, second.auth);
    await arrival;
    await f.app.users.update(user.id, { role: 'member' });
    release();
    await block;
    assert.equal((await pending).status, 403);
    assert.equal((await f.app.backups.list()).length, 0);
});
test('parallel attachment deletion and upload keep every snapshot reference restorable', async (t) => {
    const f = await runtimeFixture(t), { auth } = await f.setup(), p = await (await f.request('/api/products', 'POST', { sku: 'P', name: 'Parallel' }, auth)).json(), r = await (await f.request('/api/returns', 'POST', { serialNumber: 'TEST-SN', productId: p.id, receiptDate: '2026-10-06' }, auth)).json();
    const upload = async (name) => fetch(f.base + `/api/returns/${r.id}/attachments`, { method: 'POST', headers: { Origin: f.base, ...auth, 'Content-Type': 'application/octet-stream', 'X-File-Name': name }, body: Buffer.from('%PDF-1.7\n' + name) });
    const old = await (await upload('old.pdf')).json();
    const [meta] = await Promise.all([f.app.backups.create({ id: null, name: 'Test', source: 'system' }), f.request(`/api/attachments/${old.id}`, 'DELETE', undefined, auth), upload('new.pdf')]);
    const target = join(f.dataDir, 'parallel-check');
    mkdirSync(target);
    await extract({ file: join(f.dataDir, 'backups', meta.filename), cwd: target });
    const db = await snapshotDatabase(t,target);
    try {
        for (const ref of (await db.query("SELECT * FROM attachments", [])).rows) {
            const bytes = readFileSync(join(target, 'attachments', ref.storedName));
            assert.equal(bytes.length, ref.size);
            assert.equal(bytes.toString(), '%PDF-1.7\n' + ref.originalName);
        }
    }
    finally {
        await db.close();
    }
});
