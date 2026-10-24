import {rmSync} from 'node:fs';
import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { runtimeFixture, testPassword } from './helpers/runtime.js';
import { createBackups } from '../dist/server/backups.js';
import { createAttachments } from '../dist/server/attachments.js';
import { createJobs } from '../dist/server/jobs.js';
import { InputError } from '../dist/shared/model.js';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
test('unsupported backup sizes never become successful recoverable archives', async (t) => {
    const f = await runtimeFixture(t);
    await f.setup();
    const backups = await createBackups({ store: f.app.store, dataDir: f.dataDir, coordinator: f.app.coordinator, clock: { now: Date.now }, preferences: f.app.preferences, version: '1.4.0', limits: { maxFileBytes: 1024, maxTotalBytes: 2048, maxArchiveBytes: 1024, maxFiles: 100000 } });
    await assert.rejects(async () => backups.create({ id: null, name: 'Test', source: 'system' }), e => e.status === 503 && /offline sichern/.test(e.message));
    assert.equal((await backups.list()).some(x => x.state === 'complete'), false);
    assert.match((await backups.list())[0].error, /offline sichern/);
    await backups.close();
});
test('referenced attachments keep their original paths until database commit', async (t) => {
    const f = await runtimeFixture(t), { auth } = await f.setup(), p = await (await f.request('/api/products', 'POST', { sku: 'CRASH', name: 'Crash probe' }, auth)).json(), r = await (await f.request('/api/returns', 'POST', { serialNumber: 'TEST-SN', productId: p.id, receiptDate: '2026-10-06' }, auth)).json();
    const upload = await fetch(f.base + `/api/returns/${r.id}/attachments`, { method: 'POST', headers: { Origin: f.base, ...auth, 'X-File-Name': 'test.pdf' }, body: Buffer.from('%PDF-1.7\nFixture') });
    const item = await upload.json();
    assert.equal(upload.status, 201);
    const name = (await f.app.store.db.query("SELECT storedName FROM attachments WHERE id=$1", [item.id])).rows[0].storedName, path = join(f.dataDir, 'attachments', name), attachments = createAttachments(f.app.store,f.dataDir,async()=>f.app.settings.get());
    await assert.rejects(async () => f.app.store.transaction(async () => { await attachments.remove(item.id); assert.equal(existsSync(path), true, 'Crash before SQL COMMIT must retain the referenced file'); throw new Error('Simulated crash before commit'); }), /Simulated crash/);
    assert.equal(existsSync(path), true);
    await attachments.remove(item.id);
    assert.equal(existsSync(path), false);
});
test('a busy backup leaves its scheduled slot retryable', async (t) => {
    const f = await runtimeFixture(t, { now: () => Date.parse('2026-10-06T12:00:00Z') });
    await f.setup();
    let calls = 0;
    const jobs = createJobs({ store: f.app.store, preferences: f.app.preferences, coordinator: f.app.coordinator, clock: { now: () => Date.parse('2026-10-06T12:00:00Z') }, backups: { async create() {
                calls++;
                if (calls === 1)
                    throw new InputError('Busy', 409);
                return { state: 'complete' };
            } } });
    await jobs.tick();
    await jobs.tick();
    await jobs.tick();
    assert.equal(calls, 2);
    await jobs.close();
});
test('a renewed overdue episode notifies again while continuous overdue changes do not', async (t) => {
    let now = Date.parse('2026-10-06T12:00:00Z');
    const f = await runtimeFixture(t, { now: () => now }), { auth } = await f.setup(), p = await f.app.store.createProduct({ sku: 'DUE', name: 'Due' });
    await f.app.store.createReturn({ serialNumber: 'TEST-SN', productId: p.id, receiptDate: '2026-09-01' });
    await f.app.notifications.checkOverdue();
    await f.request('/api/admin/rules', 'PUT', { deadlineDays: 36 }, auth);
    await f.app.notifications.checkOverdue();
    now = Date.parse('2026-10-09T12:00:00Z');
    await f.app.notifications.checkOverdue();
    await f.request('/api/admin/rules', 'PUT', { deadlineDays: 35 }, auth);
    await f.app.notifications.checkOverdue();
    assert.equal((await f.app.store.db.query("SELECT COUNT(*) AS n FROM notifications WHERE kind='overdue'", [])).rows[0].n, 2);
});
test('successful own session revocation is audited without session identifiers', async (t) => {
    const f = await runtimeFixture(t), { auth } = await f.setup();
    await f.login('Admin');
    const response = await f.request('/api/account/sessions/revoke', 'POST', { mode: 'others', password: testPassword }, auth);
    assert.equal(response.status, 200);
    const rows = (await f.app.store.db.query("SELECT * FROM audit WHERE action='sessionsRevoke'", [])).rows;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].entity, 'users');
    assert.deepEqual(JSON.parse(rows[0].changes), {});
    assert.equal(rows[0].actorName, 'Test Admin');
});
test('listing sessions does not forge other users activity timestamps', async (t) => {
    let now = Date.now();
    const f = await runtimeFixture(t, { now: () => now }), { auth } = await f.setup();
    await f.request('/api/users', 'POST', { username: 'Worker', password: testPassword }, auth);
    const worker = await f.login('Worker');
    const before = await (await f.request('/api/account/sessions', 'GET', undefined, worker.auth)).json();
    now += 30000;
    await f.request('/api/account/sessions', 'GET', undefined, auth);
    const token = worker.auth.Cookie.split('=')[1], current = (await f.app.auth.listSessions(worker.data.user.id, token))[0];
    assert.equal(current.lastSeen, before[0].lastSeen);
});
test('one large import produces its complete notification count', async (t) => {
    const f = await runtimeFixture(t);
    await f.setup();
    const p = await f.app.store.createProduct({ sku: 'BULK', name: 'Bulk' });
    await f.app.store.withActor({ id: 1, name: 'Admin', source: 'user', operationId: 'bulk1200' }, async () => f.app.store.transaction(async () => {
        for (let i = 0; i < 1200; i++)
            await f.app.store.createReturn({ serialNumber: 'TEST-SN', productId: p.id, receiptDate: '2026-10-06' });
    }));
    await f.app.notifications.drain();
    const row = (await f.app.store.db.query("SELECT message FROM notifications WHERE kind='newReturn'", [])).rows[0];
    assert.match(row.message, /1200/);
});
test('offline factor recovery records its system actor and no secrets', async (t) => {
    const f = await runtimeFixture(t);
    await f.setup();
    await f.app.close();
    const {recoverAccount}=await import('../scripts/recover-account.mjs');
    const {openDatabase}=await import('../dist/server/database/connection.js');
    const {readDatabaseConfig}=await import('../dist/server/database/config.js');
    const databaseConfig=readDatabaseConfig({DATABASE_URL:process.env.RETOURENBOARD_TEST_DATABASE_URL});
    const schema=f.app.store.db.schema,backup=join(f.dataDir,'..','recovery-'+schema);
    t.after(()=>rmSync(backup,{recursive:true,force:true}));
    await recoverAccount({dataDir:f.dataDir,databaseConfig,schema,username:'Admin',backup,binDir:process.env.RETOURENBOARD_TEST_PG_BIN??'.qa/postgres-runtime/18/pgsql/bin'});
    const db=await openDatabase(databaseConfig,schema);try{const row=(await db.query("SELECT * FROM audit WHERE entity='mfa' AND action='reset'")).rows[0];assert.ok(row);assert.equal(row.source,'system');assert.deepEqual(JSON.parse(row.changes),{});}finally{await db.close();}

});
test('administrator sees factor status without factor material', async (t) => {
    const f = await runtimeFixture(t), { auth } = await f.setup();
    const users = await (await f.request('/api/users', 'GET', undefined, auth)).json();
    assert.equal(users[0].mfaEnabled, false);
    assert.equal(users[0].mfaRequired, false);
    assert.equal(Object.hasOwn(users[0], 'secretEnc'), false);
});
