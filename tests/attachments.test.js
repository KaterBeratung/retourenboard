import { test } from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync, writeFileSync, readFileSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { createApp } from './helpers/postgres-fixtures.js';
import { createAttachments } from '../dist/server/attachments.js';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=', 'base64');
async function fixture(t) {
    const dir = mkdtempSync(join(tmpdir(), 'retouren-files-')), dbPath = join(dir, 'data.sqlite');
    let app, base;
    async function start() { app = await createApp({ dbPath, }); await new Promise(r => app.server.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${app.server.address().port}`; }
    await start();
    await app.users.createFirst({ username: 'admin', password: 'Datei-Testpasswort!' });
    const p = await app.store.createProduct({ name: 'Test', sku: 'A' }), ret = await app.store.createReturn({ serialNumber: 'TEST-SN', productId: p.id, receiptDate: '2026-10-05' });
    const request = async (path, method = 'GET', body, headers = {}) => fetch(base + path, { method, headers: { Origin: base, ...headers }, body });
    async function login() { const res = await request('/api/login', 'POST', JSON.stringify({ username: 'admin', password: 'Datei-Testpasswort!' }), { 'Content-Type': 'application/json' }); const data = await res.json(); return { Cookie: res.headers.get('set-cookie').split(';')[0], 'X-CSRF-Token': data.csrfToken }; }
    const upload = async (name, data = png, auth = {}) => request(`/api/returns/${ret.id}/attachments`, 'POST', data, { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(name), ...auth });
    t.after(async () => { await app.close(); rmSync(dir, { recursive: true, force: true }); });
    return { get app() { return app; }, dir, ret, request, upload, login, restart: async () => { await app.close(); await start(); } };
}
test('attachments, upload and delete require personal login; mutations require CSRF and same origin', async (t) => {
    const { ret, request, upload, login } = await fixture(t);
    const auth = await login();
    assert.equal((await upload('bild.png')).status, 401);
    assert.equal((await upload('bild.png', png, { Cookie: auth.Cookie })).status, 403);
    assert.equal((await upload('bild.png', png, { ...auth, Origin: 'https://fremd.example' })).status, 403);
    const response = await upload('Prüfung.png', png, auth);
    assert.equal(response.status, 201);
    const item = await response.json();
    const list = await (await request(`/api/returns/${ret.id}/attachments`, 'GET', undefined, auth)).json();
    assert.equal(list[0].originalName, 'Prüfung.png');
    assert.equal(list[0].storedName, undefined);
    const preview = await request(`/api/attachments/${item.id}/preview`, 'GET', undefined, auth);
    assert.equal(preview.status, 200);
    assert.equal(preview.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await preview.arrayBuffer()), png);
    assert.equal(preview.headers.get('x-frame-options'), 'SAMEORIGIN');
    const download = await request(`/api/attachments/${item.id}/download`, 'GET', undefined, auth);
    assert.match(download.headers.get('content-disposition'), /^attachment;/);
    assert.match(download.headers.get('content-disposition'), /filename\*=UTF-8''/);
    assert.equal((await request(`/api/attachments/${item.id}`, 'DELETE')).status, 401);
    assert.equal((await request(`/api/attachments/${item.id}`, 'DELETE', undefined, auth)).status, 200);
    assert.equal((await request(`/api/attachments/${item.id}/preview`, 'GET', undefined, auth)).status, 404);
});
test('type signatures, extensions, paths, size and per-return count are enforced', async (t) => {
    const { dir, request, upload, login } = await fixture(t);
    const auth = await login();
    for (const [name, data] of [['x.svg', Buffer.from('<svg/>')], ['x.png', Buffer.from('<html>')], ['x.pdf', png], ['../x.png', png], ['x\r\n.png', png]])
        assert.equal((await upload(name, data, auth)).status, 400, name);
    assert.equal((await request('/api/returns/999/attachments', 'POST', png, { ...auth, 'X-File-Name': 'x.png' })).status, 404);
    const huge = Buffer.alloc(10 * 1024 * 1024 + 1);
    png.copy(huge);
    assert.equal((await upload('huge.png', huge, auth)).status, 413);
    for (const [name, data, type] of [['x.pdf', Buffer.from('%PDF-1.4\n%%EOF'), 'application/pdf'], ['x.jpg', Buffer.from([255, 216, 255, 224, 0, 0, 255, 217]), 'image/jpeg'], ['x.jpeg', Buffer.from([255, 216, 255, 224, 0, 0, 255, 217]), 'image/jpeg'], ['x.webp', Buffer.from('RIFF0000WEBPVP8 '), 'image/webp']]) {
        const res = await upload(name, data, auth);
        assert.equal(res.status, 201);
        assert.equal((await res.json()).mediaType, type);
    }
    for (let i = 0; i < 6; i++)
        assert.equal((await upload(`bild${i}.png`, png, auth)).status, 201);
    assert.equal((await upload('elf.png', png, auth)).status, 400);
    assert.equal(readdirSync(join(dir, 'attachments')).length, 10);
});
test('attachments survive restart and deleting a return removes its files', async (t) => {
    const { dir, ret, upload, request, login, restart } = await fixture(t);
    let auth = await login();
    const item = await (await upload('bild.png', png, auth)).json();
    await restart();
    auth = await login();
    assert.equal((await request(`/api/attachments/${item.id}/preview`, 'GET', undefined, auth)).status, 200);
    assert.equal((await request(`/api/returns/${ret.id}`, 'DELETE', JSON.stringify({revision:ret.revision}), {...auth,'Content-Type':'application/json'})).status, 200);
    assert.equal((await request(`/api/attachments/${item.id}/preview`, 'GET', undefined, auth)).status, 404);
    assert.equal(readdirSync(join(dir, 'attachments')).length, 0);
});
test('JPEG extension also accepts uppercase .JPEG and serves image/jpeg', async (t) => {
    const { upload, request, login } = await fixture(t);
    const auth = await login();
    const response = await upload('Prüffoto.JPEG', Buffer.from([255, 216, 255, 224, 0, 0, 255, 217]), auth);
    assert.equal(response.status, 201);
    const file = await response.json();
    assert.equal(file.mediaType, 'image/jpeg');
    const preview = await request(`/api/attachments/${file.id}/preview`, 'GET', undefined, auth);
    assert.equal(preview.status, 200);
    assert.equal(preview.headers.get('content-type'), 'image/jpeg');
});

test('return uploads preserve Unicode and punctuation display names with unique internal files and original download names', async (t) => {
    const f = await fixture(t), auth = await f.login(), pdf = Buffer.from('%PDF-1.7\nOriginal return document');
    const cases = [
        ['Kundenfoto?.jpg', Buffer.from([255, 216, 255, 224, 0, 0, 255, 217]), 'image/jpeg'],
        ['Service: Rückgabe.pdf', pdf, 'application/pdf'],
        ['Service: Rückgabe.pdf', Buffer.from('%PDF-1.7\nA different return document'), 'application/pdf'],
        ['報告 😀 e\u0301 | <Prüfung> "1"*.pdf', pdf, 'application/pdf'],
        ['CON.pdf', pdf, 'application/pdf']
    ];
    const storedNames = new Set();
    for (const [name, bytes, mediaType] of cases) {
        const response = await f.upload(name, bytes, auth);
        assert.equal(response.status, 201, name);
        const file = await response.json();
        assert.equal(file.originalName, name);
        assert.equal(file.mediaType, mediaType);
        assert.equal(file.storedName, undefined);
        const storedName = (await f.app.store.db.query('SELECT storedName FROM attachments WHERE id=$1', [file.id])).rows[0].storedName;
        assert.match(storedName, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.(?:jpg|pdf)$/);
        assert.equal(storedNames.has(storedName), false);
        storedNames.add(storedName);
        const download = await f.request(`/api/attachments/${file.id}/download`, 'GET', undefined, auth);
        assert.equal(download.status, 200);
        assert.equal(download.headers.get('content-type'), mediaType);
        assert.equal(decodeURIComponent(download.headers.get('content-disposition').split("filename*=UTF-8''")[1]), name);
        assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
    }
    assert.deepEqual(new Set(readdirSync(join(f.dir, 'attachments'))), storedNames);
});

test('return uploads reject traversal, controls, unsupported extensions and mismatched bytes without leaving files', async (t) => {
    const f = await fixture(t), auth = await f.login();
    for (const [name, bytes] of [
        ['../secret.png', png], ['..\\secret.png', png], ['/tmp/photo.png', png], ['C:\\photo.png', png],
        ['bad\0.png', png], ['bad\n.png', png], ['bad\x7f.png', png], ['x'.repeat(247) + '.png', png],
        ['file.png:secret', png], ['active.svg', Buffer.from('<svg/>')], ['wrong.pdf', png], ['empty.png', Buffer.alloc(0)]
    ]) assert.equal((await f.upload(name, bytes, auth)).status, 400, name);
    const response = await f.request(`/api/returns/${f.ret.id}/attachments`, 'POST', png, { ...auth, 'X-File-Name': '%invalid.png' });
    assert.equal(response.status, 400);
    assert.deepEqual(await (await f.request(`/api/returns/${f.ret.id}/attachments`, 'GET', undefined, auth)).json(), []);
    assert.deepEqual(readdirSync(join(f.dir, 'attachments')), []);
});

test('return uploads enforce streamed size and recheck file quota for concurrent uploads', async (t) => {
    const f = await fixture(t), auth = await f.login();
    await f.app.settings.update({ ...await f.app.settings.get(), uploadMaxMb: 1, maxFilesPerReturn: 1 });
    const files = createAttachments(f.app.store, f.dir, async () => f.app.settings.get());
    const huge = Buffer.alloc(1024 * 1024 + 1); png.copy(huge);
    const chunked = Readable.from([huge.subarray(0, 512 * 1024), huge.subarray(512 * 1024)]);
    chunked.headers = { 'x-file-name': 'streamed.png' };
    await assert.rejects(() => files.upload(f.ret.id, chunked), error => error.status === 413);
    assert.deepEqual(readdirSync(join(f.dir, 'attachments')), []);
    const responses = await Promise.all([f.upload('same.png', png, auth), f.upload('same.png', png, auth)]);
    assert.deepEqual(responses.map(response => response.status).sort(), [201, 400]);
    assert.equal((await files.list(f.ret.id)).length, 1);
    assert.equal(readdirSync(join(f.dir, 'attachments')).length, 1);
});

test('return upload removes unreferenced bytes when its surrounding transaction rolls back', async (t) => {
    const f = await fixture(t), files = createAttachments(f.app.store, f.dir);
    const req = Readable.from([png]); req.headers = { 'x-file-name': 'rollback.png' };
    await assert.rejects(() => f.app.store.transaction(async () => {
        const file = await files.upload(f.ret.id, req);
        assert.deepEqual((await files.read(file.id)).bytes, png);
        throw Error('outer transaction aborted');
    }), /outer transaction aborted/);
    assert.deepEqual(await files.list(f.ret.id), []);
    assert.deepEqual(readdirSync(join(f.dir, 'attachments')), []);
});

test('return downloads reject truncated on-disk files before emitting a false content length', async (t) => {
    const f = await fixture(t), auth = await f.login();
    const response = await f.upload('photo.png', png, auth);
    assert.equal(response.status, 201);
    const file = await response.json();
    const storedName = (await f.app.store.db.query('SELECT storedName FROM attachments WHERE id=$1', [file.id])).rows[0].storedName;
    writeFileSync(join(f.dir, 'attachments', storedName), png.subarray(0, 16));
    const files = createAttachments(f.app.store, f.dir);
    await assert.rejects(() => files.read(file.id), /Datenspeicher/);
    const download = await f.request(`/api/attachments/${file.id}/download`, 'GET', undefined, auth);
    assert.equal(download.status, 400);
    assert.equal((await download.json()).error, 'Ungültige Datei im Datenspeicher.');
});

test('return uploads persist complete bytes when a single filesystem write writes only a prefix', async (t) => {
    const f = await fixture(t), auth = await f.login(), files = createAttachments(f.app.store, f.dir);
    const probe = await open(join(f.dir, 'handle-probe'), 'wx');
    const prototype = Object.getPrototypeOf(probe), write = prototype.write;
    await probe.close();
    // Preserve real I/O while limiting each single-write call. writeFile, unlike
    // write, guarantees that the complete chunk is persisted before it resolves.
    t.mock.method(prototype, 'write', function (bytes, ...args) {
        if (!Buffer.isBuffer(bytes)) return write.call(this, bytes, ...args);
        const options = args[0] && typeof args[0] === 'object' ? args[0] : { offset: args[0], length: args[1], position: args[2] };
        const offset = options.offset ?? 0, length = options.length ?? bytes.length - offset;
        return write.call(this, bytes, offset, Math.min(8, length), options.position ?? null);
    });
    const req = Readable.from([png]); req.headers = { 'x-file-name': 'short-write.png' };
    const file = await files.upload(f.ret.id, req);
    assert.equal(file.size, png.length);
    const storedName = (await f.app.store.db.query('SELECT storedName FROM attachments WHERE id=$1', [file.id])).rows[0].storedName;
    assert.deepEqual(readFileSync(join(f.dir, 'attachments', storedName)), png);
    const download = await f.request(`/api/attachments/${file.id}/download`, 'GET', undefined, auth);
    assert.equal(download.status, 200);
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), png);
});
