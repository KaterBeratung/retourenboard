import { legacyArchive } from './helpers/backup-data.js';
import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, symlinkSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { DatabaseSync } from 'node:sqlite';
import { createStore } from './helpers/postgres-fixtures.js';
import { createAttachments } from '../dist/server/attachments.js';
import { prepareBackup } from '../dist/server/backup-restore.js';
import { create as archive, extract } from '../dist/vendor/archive.js';
import { sha256File } from '../dist/shared/backup-contract.js';
import { runtimeFixture } from './helpers/runtime.js';
import { restoreFixture } from './helpers/restore-runtime.js';
const bytes = Buffer.from('%PDF-1.4\n%%EOF');
async function attachmentFixture(t) {
    const dir = mkdtempSync(join(tmpdir(), 'retourenboard-file-boundary-')), dbPath = join(dir, 'retouren.sqlite'), store = await createStore(dbPath), files = createAttachments(store, dir), product = await store.createProduct({ name: 'Datei', sku: 'FILE' }), ret = await store.createReturn({ productId: product.id, serialNumber: 'FILE' });
    t.after(() => { store.close(); files.dispose(); rmSync(dir, { recursive: true, force: true }); });
    async function insert(name) { return Number((await store.db.query("INSERT INTO attachments(returnId,originalName,storedName,mediaType,size,createdAt) VALUES($1,$2,$3,$4,$5,$6) RETURNING id", [ret.id, 'datei.pdf', name, 'application/pdf', bytes.length, new Date().toISOString()])).rows[0].id); }
    return { dir, store, files, ret, insert };
}
for (const sink of ['read', 'remove', 'removeReturn'])
    for (const name of ['../sentinel.pdf', '..\\sentinel.pdf', '/etc/passwd', 'C:\\secrets\\smtp.key', 'file.pdf:secret'])
        test(`attachment ${sink} rejects unsafe stored basename ${JSON.stringify(name)}`, async (t) => {
            const f = await attachmentFixture(t), sentinel = join(f.dir, 'sentinel.pdf');
            writeFileSync(sentinel, 'OUTSIDE');
            const id = await f.insert(name);
            await assert.rejects(async () => sink === 'removeReturn' ? await f.files.removeReturn(f.ret.id) : await f.files[sink](id), /Dateipfad|Dateiname|Datenspeicher/);
            assert.equal(readFileSync(sentinel, 'utf8'), 'OUTSIDE');
            assert.ok((await f.store.db.query("SELECT id FROM attachments WHERE id=$1", [id])).rows[0], 'unsafe deletion must not commit');
            assert.ok(await f.store.getReturn(f.ret.id));
        });
for (const sink of ['read', 'remove', 'removeReturn', 'upload'])
    test(`attachment ${sink} rejects a symlinked storage folder`, async (t) => {
        const f = await attachmentFixture(t), outside = join(f.dir, 'outside');
        mkdirSync(outside);
        writeFileSync(join(outside, 'legacy.pdf'), 'OUTSIDE');
        symlinkSync(outside, join(f.dir, 'attachments'), process.platform === 'win32' ? 'junction' : 'dir');
        const id = await f.insert('legacy.pdf');
        const req = Readable.from([bytes]);
        req.headers = { 'x-file-name': 'test.pdf' };
        await assert.rejects(async () => sink === 'removeReturn' ? await f.files.removeReturn(f.ret.id) : sink === 'upload' ? await f.files.upload(f.ret.id, req) : await f.files[sink](id), /Dateipfad|Dateiname|Datenspeicher/);
        assert.equal(readFileSync(join(outside, 'legacy.pdf'), 'utf8'), 'OUTSIDE');
        assert.deepEqual(readdirSync(outside), ['legacy.pdf']);
    });
test('attachment read and delete reject a symbolic-link file without touching its target', async (t) => {
    const f = await attachmentFixture(t), outside = join(f.dir, 'sentinel.pdf');
    writeFileSync(outside, 'OUTSIDE');
    mkdirSync(join(f.dir, 'attachments'));
    try {
        symlinkSync(outside, join(f.dir, 'attachments', 'legacy.pdf'), 'file');
    }
    catch (error) {
        if (process.platform === 'win32' && error.code === 'EPERM') {
            t.skip('Windows does not permit file symlinks for this account; directory junction coverage remains active.');
            return;
        }
        throw error;
    }
    const id = await f.insert('legacy.pdf');
    await assert.rejects(async () => f.files.read(id), /Datenspeicher|Dateipfad/);
    await assert.rejects(async () => f.files.remove(id), /Datenspeicher|Dateipfad/);
    assert.equal(readFileSync(outside, 'utf8'), 'OUTSIDE');
});
test('upload rejects a symlinked data ancestor before creating its missing attachments folder', async (t) => {
    const f = await attachmentFixture(t), outside = join(f.dir, 'outside'), alias = join(f.dir, 'data-alias');
    mkdirSync(outside);
    symlinkSync(outside, alias, process.platform === 'win32' ? 'junction' : 'dir');
    const files = createAttachments(f.store, alias), req = Readable.from([bytes]);
    req.headers = { 'x-file-name': 'safe.pdf' };
    await assert.rejects(async () => files.upload(f.ret.id, req), /Datenspeicher|Dateipfad/);
    assert.deepEqual(readdirSync(outside), []);
});
test('legitimate uploads, historical basenames, missing files and rollback cleanup remain usable', async (t) => {
    const f = await attachmentFixture(t), req = Readable.from([bytes]);
    req.headers = { 'x-file-name': 'prüfung.pdf' };
    const uploaded = await f.files.upload(f.ret.id, req);
    assert.deepEqual((await f.files.read(uploaded.id)).bytes, bytes);
    assert.deepEqual(await f.files.remove(uploaded.id), { deleted: true });
    writeFileSync(join(f.dir, 'attachments', 'old.photo-1.PDF'), bytes);
    const legacy = await f.insert('old.photo-1.PDF');
    assert.deepEqual((await f.files.read(legacy)).bytes, bytes);
    await f.files.remove(legacy);
    const missing = await f.insert('missing.pdf');
    await assert.rejects(async () => f.files.read(missing), error => error.status === 404);
    assert.deepEqual(await f.files.remove(missing), { deleted: true });
    const failed = Readable.from([bytes]);
    failed.headers = { 'x-file-name': 'failed.pdf' };
    await assert.rejects(async () => f.files.upload(f.ret.id, failed, () => { throw Error('abort'); }), /abort/);
    assert.deepEqual(readdirSync(join(f.dir, 'attachments')), []);
});
const rewrittenArchive = legacyArchive;
for (const [kind, sql] of [
    ['trigger', "INSERT INTO backup_jobs(id,mode,state,createdAt) VALUES('malicious','manual','complete','now'); CREATE TRIGGER rewrite_attachment AFTER UPDATE ON backup_jobs BEGIN UPDATE attachments SET storedName='../secrets/smtp.key'; END"],
    ['migration-trigger', "CREATE TRIGGER migration_rewrite AFTER UPDATE ON products BEGIN UPDATE attachments SET storedName='../secrets/smtp.key'; END"],
    ['view', 'CREATE VIEW imported_view AS SELECT storedName FROM attachments'],
    ['virtual-table', 'CREATE VIRTUAL TABLE imported_search USING fts5(value)'],
    ['unexpected-table', 'CREATE TABLE imported_unknown(value TEXT)'],
    ['expression-index', 'CREATE INDEX attachments_expression ON attachments(lower(storedName))'],
    ['partial-index', "CREATE INDEX attachments_partial ON attachments(storedName) WHERE storedName LIKE 'safe%'"],
    ['generated-column', 'ALTER TABLE products ADD COLUMN imported_expression TEXT GENERATED ALWAYS AS (upper(name)) VIRTUAL'],
    ['check-expression', 'ALTER TABLE products ADD COLUMN imported_check INTEGER CHECK(length(randomblob(1024))>0)'],
    ['default-expression', 'DROP TABLE products; CREATE TABLE products(id INTEGER PRIMARY KEY,name TEXT DEFAULT (hex(randomblob(16))))']
])
    test(`restore rejects valid checksummed ${kind} schema before initializing or preparing it`, async (t) => {
        const f = await runtimeFixture(t);
        await f.setup();
        const product = await f.app.store.createProduct({ name: 'Sicher', sku: 'SAFE' }), ret = await f.app.store.createReturn({ productId: product.id, serialNumber: 'SAFE' });
        mkdirSync(join(f.dataDir, 'attachments'), { recursive: true });
        writeFileSync(join(f.dataDir, 'attachments', 'safe.pdf'), bytes);
        await f.app.store.db.query("INSERT INTO attachments(returnId,originalName,storedName,mediaType,size,createdAt) VALUES($1,$2,$3,$4,$5,$6) RETURNING id", [ret.id, 'safe.pdf', 'safe.pdf', 'application/pdf', bytes.length, new Date().toISOString()]);
        const path = await rewrittenArchive(f, kind, db => db.exec(sql)), target = join(f.dataDir, kind + '-prepared');
        await assert.rejects(async () => prepareBackup({ databaseConfig: f.databaseConfig, archive: path, target }), /Schema|Datenbankschema/);
        assert.equal(existsSync(target), false);
        assert.equal((await f.app.store.db.query("SELECT storedName FROM attachments", [])).rows[0].storedName, 'safe.pdf');
    });
test('online activation revalidates a prepared database before carryState can execute an injected trigger', async (t) => {
    const f = await restoreFixture(t);
    await f.setup();
    await f.app.store.createProduct({ name: 'Live', sku: 'LIVE' });
    const meta = await f.app.backups.create({ id: 1, name: 'Admin', source: 'user' }), owner = { userId: 1, sessionId: 'security-test', authVersion: 1 };
    const login = await f.login('Admin'), response = await f.request('/api/admin/backups/restore/prepare', 'POST', { backupId: meta.id }, login.auth), preview = await response.json();
    assert.equal(response.status, 201);
    const preparedDir = join(f.dataDir, '.restore', 'preparations', preview.id, 'prepared');
    const bad = await legacyArchive(f, 'late-legacy', (db) => db.exec("CREATE TRIGGER late_schema AFTER INSERT ON server_settings BEGIN UPDATE products SET name='ATTACK'; END"));
    rmSync(preparedDir, { recursive: true });
    mkdirSync(preparedDir);
    await extract({ cwd: preparedDir, file: bad });
    await assert.rejects(async () => f.runtime.activateRestore({ id: preview.id, owner, preparedDir, summary: preview.summary }), /Schema|Datenbankschema/);
    assert.equal((await f.runtime.current().store.listProducts())[0].name, 'Live');
});
test('legitimate attachment and legacy branding references survive preparation and online activation', async (t) => {
    const f = await restoreFixture(t), first = await f.setup(), product = await f.app.store.createProduct({ name: 'Datei', sku: 'LEGIT' }), ret = await f.app.store.createReturn({ productId: product.id, serialNumber: 'LEGIT' }), upload = await fetch(f.base + `/api/returns/${ret.id}/attachments`, { method: 'POST', headers: { Origin: f.base, ...first.auth, 'X-File-Name': 'safe.pdf' }, body: bytes });
    assert.equal(upload.status, 201);
    const item = await upload.json();
    mkdirSync(join(f.dataDir, 'branding'));
    writeFileSync(join(f.dataDir, 'branding', 'legacy_logo.png'), bytes);
    await f.app.store.db.query("INSERT INTO app_logo(storedName) VALUES($1)", ['legacy_logo.png']);
    const saved = await f.app.backups.create({ id: 1, name: 'Admin', source: 'user' }), response = await f.request('/api/admin/backups/restore/prepare', 'POST', { backupId: saved.id }, first.auth), preview = await response.json();
    assert.equal(response.status, 201);
    assert.equal(preview.summary.attachments, 1);
    const commit = await f.request(`/api/admin/backups/restore/${preview.id}/commit`, 'POST', { confirmed: true, password: 'Testkonto-Passwort!' }, first.auth);
    assert.equal(commit.status, 202);
    await commit.json();
    await f.runtime.waitForRestore();
    const login = await f.login('Admin'), download = await fetch(f.base + `/api/attachments/${item.id}/download`, { headers: login.auth });
    assert.equal(download.status, 200);
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
    assert.deepEqual(readFileSync(join(f.dataDir, 'branding', 'legacy_logo.png')), bytes);
    assert.equal((await f.request(`/api/returns/${ret.id}`, 'DELETE', {revision:ret.revision}, login.auth)).status, 200);
});
