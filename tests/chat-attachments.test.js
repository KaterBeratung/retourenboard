import { readDatabaseConfig } from '../dist/server/database/config.js';
import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync, mkdirSync, writeFileSync, readFileSync, existsSync, renameSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { request as httpRequest } from 'node:http';
import { once } from 'node:events';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
const build = process.env.RETOURENBOARD_TEST_BUILD_ROOT ? pathToFileURL(resolve(process.env.RETOURENBOARD_TEST_BUILD_ROOT) + '/') : new URL('../dist/', import.meta.url);
import { createApp } from './helpers/postgres-fixtures.js';
import { appFromPrepared, legacyArchive } from './helpers/backup-data.js';
const { prepareBackup } = await import(new URL('server/backup-restore.js', build));
const { createRestoreTransaction } = await import(new URL('server/restore-transaction.js', build));
const { extract, create: archive } = await import(new URL('vendor/archive.js', build));
const { sha256File } = await import(new URL('shared/backup-contract.js', build));
const { DatabaseSync } = await import('node:sqlite');
const pdf = Buffer.from('%PDF-1.7\nA private chat document'), password = 'Chat-Dateien-Testpasswort!';
async function fixture(t) {
    const dir = mkdtempSync(join(tmpdir(), 'retourenboard-chat-files-'));
    let app, base;
    async function start(path = join(dir, 'retouren.sqlite')) { app = existsSync(join(resolve(path, '..'), 'data.jsonl')) ? await appFromPrepared(t, resolve(path, '..')) : await createApp({ dbPath: path }); await new Promise(r => app.server.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${app.server.address().port}`; }
    await start();
    t.after(async () => { await app.close(); rmSync(dir, { recursive: true, force: true }); });
    await app.users.createFirst({ username: 'Owner', password });
    const alice = await app.users.create({ username: 'Alice', password, role: 'member' }), bob = await app.users.create({ username: 'Bobby', password, role: 'member' }), viewer = await app.users.create({ username: 'Viewer', password, role: 'viewer' });
    const request = async (path, method = 'GET', body, auth = {}) => fetch(base + path, { method, headers: { Origin: base, 'Content-Type': 'application/json', ...auth }, body: body === undefined ? undefined : JSON.stringify(body) });
    async function login(username) { const res = await request('/api/login', 'POST', { username, password }); assert.equal(res.status, 200); const data = await res.json(); return { Cookie: res.headers.get('set-cookie').split(';')[0], 'X-CSRF-Token': data.csrfToken }; }
    const adminAuth = await login('Owner'), aliceAuth = await login('Alice'), bobAuth = await login('Bobby'), viewerAuth = await login('Viewer');
    const upload = async (channelId, name = 'prüfen.pdf', bytes = pdf, auth = aliceAuth) => fetch(base + `/api/chat/channels/${channelId}/attachments`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(name), ...auth }, body: bytes });
    const createGroup = async (memberIds = [bob.id], auth = aliceAuth, visibility = 'private') => { const res = await request('/api/chat/channels', 'POST', { kind: 'group', name: 'Dateiaustausch', memberIds, visibility }, auth); assert.equal(res.status, 201); return res.json(); };
    return { get app() { return app; }, get base() { return base; }, dir, alice, bob, viewer, adminAuth, aliceAuth, bobAuth, viewerAuth, request, upload, createGroup, login, restart: async (path) => { await app.close(); await start(path); } };
}
test('chat files create a file-only row and private bytes remain limited to current participants', async (t) => {
    const f = await fixture(t), group = await f.createGroup();
    for (const [auth, status] of [[{}, 401], [f.viewerAuth, 404], [f.adminAuth, 404], [{ ...f.aliceAuth, 'X-CSRF-Token': 'wrong' }, 403], [{ ...f.aliceAuth, Origin: 'https://foreign.example' }, 403]])
        assert.equal((await f.upload(group.id, 'private.pdf', pdf, auth)).status, status);
    const response = await f.upload(group.id);
    assert.equal(response.status, 201);
    const message = await response.json();
    assert.equal(message.text, '');
    assert.equal(message.canEdit, false);
    assert.equal(message.canDelete, true);
    assert.equal(message.attachments.length, 1);
    const file = message.attachments[0];
    assert.deepEqual(Object.keys(file).sort(), ['createdAt', 'id', 'mediaType', 'originalName', 'size']);
    assert.equal(file.originalName, 'prüfen.pdf');
    assert.equal(file.mediaType, 'application/pdf');
    assert.equal(file.size, pdf.length);
    for (const action of ['download', 'preview']) {
        const url = `/api/chat/attachments/${file.id}/${action}`;
        for (const [auth, status] of [[{}, 401], [f.adminAuth, 404], [f.viewerAuth, 404]])
            assert.equal((await f.request(url, 'GET', undefined, auth)).status, status);
        const res = await f.request(url, 'GET', undefined, f.bobAuth);
        assert.equal(res.status, 200);
        assert.deepEqual(Buffer.from(await res.arrayBuffer()), pdf);
        assert.equal(res.headers.get('cache-control'), 'private, no-store');
        assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN');
        assert.match(res.headers.get('content-disposition'), action === 'download' ? /^attachment;/ : /^inline;/);
    }
    const history = await (await f.request(`/api/chat/channels/${group.id}/messages`, 'GET', undefined, f.bobAuth)).json();
    assert.deepEqual(history.items[0].attachments, [file]);
    assert.equal((await f.request(`/api/chat/messages/${message.id}`, 'PUT', { text: 'replace file with text' }, f.aliceAuth)).status, 400);
    const notifications = await (await f.request('/api/notifications', 'GET', undefined, f.bobAuth)).json();
    assert.ok(notifications.items.some(item => item.href === `/chat#channel-${group.id}`));
    await f.request(`/api/chat/channels/${group.id}`, 'PUT', { memberIds: [] }, f.aliceAuth);
    assert.equal((await f.request(`/api/chat/attachments/${file.id}/download`, 'GET', undefined, f.bobAuth)).status, 404);
    assert.equal((await f.request(`/api/chat/messages/${message.id}`, 'DELETE', undefined, f.aliceAuth)).status, 200);
    assert.equal((await f.request(`/api/chat/attachments/${file.id}/download`, 'GET', undefined, f.aliceAuth)).status, 404);
    const deleted = (await (await f.request(`/api/chat/channels/${group.id}/messages`, 'GET', undefined, f.aliceAuth)).json()).items[0];
    assert.equal(deleted.deleted, true);
    assert.deepEqual(deleted.attachments, []);
    assert.deepEqual(readdirSync(join(f.dir, 'chat-attachments')), []);
});
test('public file sending and moderation use chat rights independently of return attachment rights', async (t) => {
    const f = await fixture(t), group = await f.createGroup([], f.aliceAuth, 'public');
    await f.app.users.update(f.alice.id, { permissions: { attachmentsUpload: false, attachmentsView: false } });
    const response = await f.upload(group.id);
    assert.equal(response.status, 201);
    const message = await response.json(), url = `/api/chat/attachments/${message.attachments[0].id}/download`;
    assert.equal((await f.request(url, 'GET', undefined, f.viewerAuth)).status, 200);
    assert.equal((await f.upload(group.id, 'read-only.pdf', pdf, f.viewerAuth)).status, 403);
    await f.app.users.update(f.bob.id, { permissions: { chatRead: false } });
    assert.equal((await f.request(url, 'GET', undefined, f.bobAuth)).status, 403);
    assert.equal((await f.request(`/api/chat/messages/${message.id}`, 'DELETE', undefined, f.adminAuth)).status, 200);
    assert.equal((await f.request(url, 'GET', undefined, f.viewerAuth)).status, 404);
});
test('chat uploads validate filenames, signatures, types, streamed size and channel quota', async (t) => {
    const f = await fixture(t), group = await f.createGroup();
    for (const [name, bytes] of [['../secret.pdf', pdf], ['..\\secret.pdf', pdf], ['/tmp/secret.pdf', pdf], ['C:\\secret.pdf', pdf], ['file.pdf:secret', pdf], ['bad\0.pdf', pdf], ['bad\n.pdf', pdf], ['bad\x7f.pdf', pdf], ['x'.repeat(247) + '.pdf', pdf], ['active.svg', Buffer.from('<svg/>')], ['wrong.png', pdf], ['empty.pdf', Buffer.alloc(0)], ['pretend.pdf', Buffer.from('<script>')]])
        assert.equal((await f.upload(group.id, name, bytes)).status, 400, name);
    await f.app.settings.update({ ...await f.app.settings.get(), uploadMaxMb: 1 });
    const tooBig = Buffer.alloc(1024 * 1024 + 1);
    pdf.copy(tooBig);
    assert.equal((await f.upload(group.id, 'big.pdf', tooBig)).status, 413);
    const chunked = Readable.from([tooBig.subarray(0, 512 * 1024), tooBig.subarray(512 * 1024)]);
    chunked.headers = { 'x-file-name': 'streamed.pdf' };
    await assert.rejects(async () => f.app.collaboration.uploadAttachment(group.id, chunked, async () => f.app.users.get(f.alice.id), job => f.app.coordinator.run(job)), error => error.status === 413);
    assert.deepEqual(readdirSync(join(f.dir, 'chat-attachments')), []);
    for (const [name, bytes, media] of [['photo.PNG', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), 'image/png'], ['photo.JPEG', Buffer.from([255, 216, 255, 0]), 'image/jpeg'], ['photo.webp', Buffer.from('RIFF0000WEBPVP8 '), 'image/webp']]) {
        const res = await f.upload(group.id, name, bytes);
        assert.equal(res.status, 201);
        assert.equal((await res.json()).attachments[0].mediaType, media);
    }
    await f.app.store.transaction(async () => {
        for (let n = 0; n < 197; n++) {
            const id = Number((await f.app.store.db.query("INSERT INTO chat_messages(channelId,authorId,text,createdAt) VALUES($1,$2,$3,$4) RETURNING id", [group.id, f.alice.id, '', new Date().toISOString()])).rows[0].id);
            await f.app.store.db.query("INSERT INTO chat_attachments(messageId,originalName,storedName,mediaType,size,createdAt) VALUES($1,$2,$3,$4,$5,$6) RETURNING id", [id, 'seed.pdf', `seed-${n}.pdf`, 'application/pdf', 1, new Date().toISOString()]);
        }
    });
    assert.equal((await f.upload(group.id, 'over-quota.pdf')).status, 400);
    assert.equal((await f.app.store.db.query("SELECT COUNT(*) AS n FROM chat_messages WHERE channelId=$1", [group.id])).rows[0].n, 200);
    assert.equal(readdirSync(join(f.dir, 'chat-attachments')).length, 3);
});

test('chat uploads preserve Unicode and punctuation display names with unique internal files and original download names', async (t) => {
    const f = await fixture(t), group = await f.createGroup();
    const cases = [
        ['Kundenfoto?.jpg', Buffer.from([255, 216, 255, 224, 0, 0, 255, 217]), 'image/jpeg'],
        ['Service: Rückgabe.pdf', pdf, 'application/pdf'],
        ['Service: Rückgabe.pdf', Buffer.from('%PDF-1.7\nA different chat document'), 'application/pdf'],
        ['報告 😀 e\u0301 | <Prüfung> "1"*.pdf', pdf, 'application/pdf'],
        ['CON.pdf', pdf, 'application/pdf']
    ];
    const storedNames = new Set();
    for (const [name, bytes, mediaType] of cases) {
        const response = await f.upload(group.id, name, bytes);
        assert.equal(response.status, 201, name);
        const file = (await response.json()).attachments[0];
        assert.equal(file.originalName, name);
        assert.equal(file.mediaType, mediaType);
        assert.equal(file.storedName, undefined);
        const storedName = (await f.app.store.db.query('SELECT storedName FROM chat_attachments WHERE id=$1', [file.id])).rows[0].storedName;
        assert.match(storedName, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.(?:jpg|pdf)$/);
        assert.equal(storedNames.has(storedName), false);
        storedNames.add(storedName);
        const download = await f.request(`/api/chat/attachments/${file.id}/download`, 'GET', undefined, f.bobAuth);
        assert.equal(download.status, 200);
        assert.equal(download.headers.get('content-type'), mediaType);
        assert.equal(decodeURIComponent(download.headers.get('content-disposition').split("filename*=UTF-8''")[1]), name);
        assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
    }
    assert.deepEqual(new Set(readdirSync(join(f.dir, 'chat-attachments'))), storedNames);
});

test('concurrent chat uploads recheck the byte quota and allow only its exact boundary', async (t) => {
    const f = await fixture(t), group = await f.createGroup();
    await f.app.store.transaction(async () => {
        const messageId = Number((await f.app.store.db.query("INSERT INTO chat_messages(channelId,authorId,text,createdAt) VALUES($1,$2,'',$3) RETURNING id", [group.id, f.alice.id, new Date().toISOString()])).rows[0].id);
        await f.app.store.db.query('INSERT INTO chat_attachments(messageId,originalName,storedName,mediaType,size,createdAt) VALUES($1,$2,$3,$4,$5,$6)', [messageId, 'seed.pdf', 'seed.pdf', 'application/pdf', 250 * 1024 * 1024 - pdf.length, new Date().toISOString()]);
    });
    const responses = await Promise.all([f.upload(group.id, 'boundary.pdf'), f.upload(group.id, 'boundary.pdf')]);
    assert.deepEqual(responses.map(response => response.status).sort(), [201, 400]);
    assert.equal((await f.app.store.db.query('SELECT COUNT(*) AS n FROM chat_messages WHERE channelId=$1', [group.id])).rows[0].n, 2);
    assert.equal(readdirSync(join(f.dir, 'chat-attachments')).length, 1);
});
for (const revoke of ['send', 'membership', 'account'])
    test(`an upload rechecks ${revoke} after streaming before committing its row or notifications`, async (t) => {
        const f = await fixture(t), group = await f.createGroup([f.alice.id], f.adminAuth), arrived = once(f.app.server, 'request');
        let finish;
        const pending = new Promise((resolve, reject) => { const req = httpRequest(f.base + `/api/chat/channels/${group.id}/attachments`, { method: 'POST', headers: { Origin: f.base, 'X-File-Name': 'delayed.pdf', ...f.aliceAuth } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); }); req.on('error', reject); req.write(pdf.subarray(0, 8)); finish = () => req.end(pdf.subarray(8)); });
        await arrived;
        if (revoke === 'send')
            await f.app.users.update(f.alice.id, { permissions: { chatSend: false } });
        else if (revoke === 'account')
            await f.app.users.update(f.alice.id, { active: false });
        else
            await f.app.collaboration.updateChannel(await f.app.users.get(1), group.id, { memberIds: [] });
        finish();
        assert.equal(await pending, revoke === 'send' ? 403 : revoke === 'membership' ? 404 : 401);
        assert.equal((await f.app.store.db.query("SELECT COUNT(*) AS n FROM chat_messages", [])).rows[0].n, 0);
        assert.equal((await f.app.store.db.query("SELECT COUNT(*) AS n FROM notifications", [])).rows[0].n, 0);
        assert.deepEqual(readdirSync(join(f.dir, 'chat-attachments')), []);
    });
test('queued upload rechecks access and rollback keeps deleted message bytes and metadata', async (t) => {
    const f = await fixture(t), group = await f.createGroup();
    let release, arrived;
    const barrier = f.app.coordinator.run(() => new Promise(r => release = r));
    await new Promise(r => setImmediate(r));
    const seen = new Promise(r => arrived = r), run = f.app.coordinator.run;
    f.app.coordinator.run = job => { arrived(); return run(job); };
    const pending = f.upload(group.id);
    await seen;
    await f.app.users.update(f.alice.id, { permissions: { chatSend: false } });
    release();
    await barrier;
    assert.equal((await pending).status, 403);
    assert.deepEqual(readdirSync(join(f.dir, 'chat-attachments')), []);
    f.app.coordinator.run = run;
    await f.app.users.update(f.alice.id, { permissions: { chatSend: true } });
    const message = await (await f.upload(group.id)).json();
    await assert.rejects(async () => f.app.store.transaction(async () => { await f.app.collaboration.changeMessage(await f.app.users.get(f.alice.id), message.id, {}, true); throw Error('rollback'); }), /rollback/);
    assert.equal((await f.request(`/api/chat/attachments/${message.attachments[0].id}/download`, 'GET', undefined, f.bobAuth)).status, 200);
    assert.equal(readdirSync(join(f.dir, 'chat-attachments')).length, 1);
    const req = Readable.from([pdf]);
    req.headers = { 'x-file-name': 'rollback.pdf' };
    await assert.rejects(async () => f.app.collaboration.uploadAttachment(group.id, req, async () => f.app.users.get(f.alice.id), async (job) => f.app.store.transaction(async () => { await job(); throw Error('outer rollback'); })), /outer rollback/);
    assert.equal((await f.app.store.db.query("SELECT COUNT(*) AS n FROM chat_messages", [])).rows[0].n, 1);
    assert.equal(readdirSync(join(f.dir, 'chat-attachments')).length, 1);
});
test('aborted upload stream removes its temporary bytes and cannot post a message', async (t) => {
    const f = await fixture(t), group = await f.createGroup();
    const req = Readable.from((async function* () { yield pdf.subarray(0, 8); throw Error('client aborted'); })());
    req.headers = { 'x-file-name': 'abort.pdf' };
    await assert.rejects(async () => f.app.collaboration.uploadAttachment(group.id, req, async () => f.app.users.get(f.alice.id), job => f.app.coordinator.run(job)), /client aborted/);
    assert.deepEqual(readdirSync(join(f.dir, 'chat-attachments')), []);
    assert.equal((await f.app.store.db.query("SELECT COUNT(*) AS n FROM chat_messages", [])).rows[0].n, 0);
});
test('downloads recheck permission after awaiting file bytes and disclose nothing after removal', async (t) => {
    const f = await fixture(t), group = await f.createGroup(), response = await f.upload(group.id);
    assert.equal(response.status, 201);
    const message = await response.json(), id = message.attachments[0].id;
    let release, arrived;
    const seen = new Promise(r => arrived = r), pause = new Promise(r => release = r), read = f.app.collaboration.readAttachment;
    f.app.collaboration.readAttachment = async (...args) => { const result = await read(...args); arrived(); await pause; return result; };
    const download = f.request(`/api/chat/attachments/${id}/download`, 'GET', undefined, f.bobAuth);
    await seen;
    await f.app.collaboration.updateChannel(await f.app.users.get(f.alice.id), group.id, { memberIds: [] });
    release();
    const denied = await download;
    assert.equal(denied.status, 404);
    assert.equal((await denied.text()).includes('A private chat document'), false);
});
test('unsafe chat storage names and directory links cannot be read or deleted or copied into backups', async (t) => {
    const f = await fixture(t), group = await f.createGroup(), response = await f.upload(group.id);
    assert.equal(response.status, 201);
    const message = await response.json(), id = message.attachments[0].id, db = f.app.store.db, stored = (await db.query("SELECT storedName FROM chat_attachments WHERE id=$1", [id])).rows[0].storedName;
    const outside = join(f.dir, 'outside');
    mkdirSync(outside);
    writeFileSync(join(outside, 'sentinel.pdf'), 'DO NOT TOUCH');
    await db.query("UPDATE chat_attachments SET storedName=$1 WHERE id=$2", ['../outside/sentinel.pdf', id]);
    await assert.rejects(async () => f.app.collaboration.readAttachment(await f.app.users.get(f.alice.id), id), /Dateipfad|Dateiname|Datenspeicher/);
    await assert.rejects(async () => f.app.collaboration.changeMessage(await f.app.users.get(f.alice.id), message.id, {}, true), /Dateipfad|Dateiname|Datenspeicher/);
    assert.equal((await db.query("SELECT deleted FROM chat_messages WHERE id=$1", [message.id])).rows[0].deleted, 0);
    assert.equal(readFileSync(join(outside, 'sentinel.pdf'), 'utf8'), 'DO NOT TOUCH');
    await db.query("UPDATE chat_attachments SET storedName=$1 WHERE id=$2", [stored, id]);
    renameSync(join(f.dir, 'chat-attachments'), join(outside, 'linked-files'));
    symlinkSync(join(outside, 'linked-files'), join(f.dir, 'chat-attachments'), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(async () => f.app.collaboration.readAttachment(await f.app.users.get(f.alice.id), id), /Dateipfad|Datenspeicher/);
    await assert.rejects(async () => f.app.collaboration.changeMessage(await f.app.users.get(f.alice.id), message.id, {}, true), /Dateipfad|Datenspeicher/);
    await assert.rejects(async () => f.app.backups.create({ id: 1, name: 'Owner', source: 'user' }), error => error.status === 503);
    assert.deepEqual(readFileSync(join(outside, 'linked-files', stored)), pdf);
});
test('private chat files survive restart and full backup preparation with old-schema compatibility', async (t) => {
    const f = await fixture(t), group = await f.createGroup(), res = await f.upload(group.id);
    assert.equal(res.status, 201);
    const msg = await res.json(), id = msg.attachments[0].id;
    await f.restart();
    const alice = await f.login('Alice');
    assert.equal((await f.request(`/api/chat/attachments/${id}/download`, 'GET', undefined, alice)).status, 200);
    const saved = await f.app.backups.create({ id: 1, name: 'Owner', source: 'user' }), archivePath = join(f.dir, 'backups', saved.filename), extracted = join(f.dir, 'inspect');
    mkdirSync(extracted);
    await extract({ cwd: extracted, file: archivePath });
    const manifest = JSON.parse(readFileSync(join(extracted, 'manifest.json'), 'utf8'));
    assert.equal(manifest.files.filter(file => file.path.startsWith('chat-attachments/')).length, 1);
    const restored = join(f.dir, 'restored'), summary = await prepareBackup({ databaseConfig: readDatabaseConfig({ DATABASE_URL: process.env.RETOURENBOARD_TEST_DATABASE_URL }), archive: archivePath, target: restored });
    assert.equal(summary.attachments, 1);
    await f.restart(join(restored, 'retouren.sqlite'));
    const auth = await f.login('Bobby');
    const download = await f.request(`/api/chat/attachments/${id}/download`, 'GET', undefined, auth);
    assert.equal(download.status, 200);
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), pdf);
    assert.equal((await f.request(`/api/chat/attachments/${id}/download`, 'GET', undefined, await f.login('Owner'))).status, 404);
    const old = await legacyArchive({ app: f.app, dataDir:f.app.dataDir }, 'historic-chat', db => db.exec('DROP TABLE chat_attachments'));
    await prepareBackup({ archive: old, target: join(f.dir, 'old-restored') });
});
test('restore transaction replaces chat storage atomically and recovers legacy journals', async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'retourenboard-chat-restore-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    mkdirSync(join(dir, 'prepared'));
    mkdirSync(join(dir, 'chat-attachments'));
    writeFileSync(join(dir, 'retouren.sqlite'), 'OLD');
    writeFileSync(join(dir, 'chat-attachments', 'old.pdf'), 'OLD FILE');
    writeFileSync(join(dir, 'prepared', 'retouren.sqlite'), 'NEW');
    mkdirSync(join(dir, 'prepared', 'chat-attachments'));
    writeFileSync(join(dir, 'prepared', 'chat-attachments', 'new.pdf'), 'NEW FILE');
    const tx = createRestoreTransaction({ dataDir: dir, dbPath: join(dir, 'retouren.sqlite') });
    await tx.activate(join(dir, 'prepared'), randomUUID());
    assert.deepEqual(readdirSync(join(dir, 'chat-attachments')), ['new.pdf']);
    await tx.rollback();
    assert.equal(readFileSync(join(dir, 'chat-attachments', 'old.pdf'), 'utf8'), 'OLD FILE');
    const journal = JSON.parse(readFileSync(join(dir, '.restore', 'journal.json'), 'utf8'));
    journal.phase = 'activated';
    journal.entries = journal.entries.filter(entry => entry.relativePath !== 'chat-attachments');
    writeFileSync(join(dir, '.restore', 'journal.json'), JSON.stringify(journal));
    assert.equal(await createRestoreTransaction({ dataDir: dir, dbPath: join(dir, 'retouren.sqlite') }).recover(), 'rolledBack');
    assert.equal(existsSync(join(dir, 'chat-attachments', 'old.pdf')), true);
});
