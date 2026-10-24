import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runtimeFixture, testPassword } from './helpers/runtime.js';
import { restoreBackup } from '../dist/server/backup-restore.js';
import { createStore } from './helpers/postgres-fixtures.js';
import {postgresFixture} from './helpers/postgres.js';
import {importData} from '../dist/server/database/data-transfer.js';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5WQAAAAASUVORK5CYII=', 'base64');
const image = { name: 'gerät.png', data: png.toString('base64') };
const payload = { sku: 'IMAGE-1', name: 'Produkt mit Bild', image };
async function fixture(t) { const f = await runtimeFixture(t); f.auth = (await f.setup()).auth; return f; }
async function create(f) { const res = await f.request('/api/products', 'POST', payload, f.auth); assert.equal(res.status, 201); return res.json(); }
test('product images are created atomically and only served to signed-in users without binary data in lists', async (t) => {
    const f = await fixture(t), p = await create(f);
    assert.ok(p.imageVersion);
    assert.equal(p.imageName, image.name);
    const res = await f.request(`/api/products/${p.id}/image`, 'GET', undefined, f.auth);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/png');
    assert.match(res.headers.get('cache-control'), /no-store/);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(Buffer.from(await res.arrayBuffer()), png);
    assert.equal((await f.request(`/api/products/${p.id}/image`)).status, 401);
    const list = await (await f.request('/api/products', 'GET', undefined, f.auth)).json();
    assert.equal(list[0].image, undefined);
    assert.equal(list[0].imageVersion, p.imageVersion);
    assert.ok(JSON.stringify(list).length < 2000);
    const returned = await f.app.store.createReturn({ productId: p.id, serialNumber: 'SN-IMAGE' });
    assert.equal(returned.imageVersion, p.imageVersion);
});
test('editing other fields preserves the image; replacement changes its version and removal deletes its bytes', async (t) => {
    const f = await fixture(t), p = await create(f);
    const normal = await (await f.request(`/api/products/${p.id}`, 'PUT', { ...p, name: 'Neuer Name' }, f.auth)).json();
    assert.equal(normal.imageVersion, p.imageVersion);
    const replacement = await (await f.request(`/api/products/${p.id}`, 'PUT', { ...normal, image: { ...image, name: 'ersatz.png' } }, f.auth)).json();
    assert.notEqual(replacement.imageVersion, p.imageVersion);
    assert.equal(replacement.imageName, 'ersatz.png');
    const removed = await f.request(`/api/products/${p.id}`, 'PUT', { ...replacement, image: null }, f.auth);
    assert.equal(removed.status, 200);
    assert.equal((await removed.json()).imageVersion, undefined);
    assert.equal((await f.request(`/api/products/${p.id}/image`, 'GET', undefined, f.auth)).status, 404);
    assert.equal((await f.app.store.db.query("SELECT COUNT(*) AS n FROM product_images", [])).rows[0].n, 0);
});
test('invalid, oversized and disguised images cannot create or change products', async (t) => {
    const f = await fixture(t), p = await create(f), before = (await f.app.store.db.query("SELECT COUNT(*) AS n FROM audit", [])).rows[0].n;
    for (const invalid of [{ name: 'x.svg', data: Buffer.from('<svg/>').toString('base64') }, { ...image, name: 'x.jpg' }, { ...image, name: '../x.png' }, { ...image, data: 'invalid!' }, { ...image, data: Buffer.alloc(1024 * 1024 + 1).toString('base64') }]) {
        const res = await f.request(`/api/products/${p.id}`, 'PUT', { ...p, name: 'Must not change', image: invalid }, f.auth);
        assert.ok([400, 413].includes(res.status));
        assert.equal((await f.app.store.getProduct(p.id)).name, p.name);
        assert.equal((await f.app.store.getProduct(p.id)).imageVersion, p.imageVersion);
        assert.ok([400, 413].includes((await f.request('/api/products', 'POST', { ...payload, sku: 'INVALID', image: invalid }, f.auth)).status));
        assert.equal(await f.app.store.findProduct('INVALID'), null);
    }
    assert.equal((await f.app.store.db.query("SELECT COUNT(*) AS n FROM audit", [])).rows[0].n, before);
});
test('image changes use product permissions, including image creation by a create-only member', async (t) => {
    const f = await fixture(t), p = await create(f);
    await f.request('/api/users', 'POST', { username: 'creator', password: testPassword, role: 'member', permissions: { productsCreate: true, productsEdit: false } }, f.auth);
    const member = (await f.login('creator')).auth;
    assert.equal((await f.request('/api/products', 'POST', { ...payload, sku: 'CREATOR' }, member)).status, 201);
    assert.equal((await f.request(`/api/products/${p.id}`, 'PUT', { ...p, image: null }, member)).status, 403);
    assert.equal((await f.request(`/api/products/${p.id}/image`, 'GET', undefined, member)).status, 200);
    assert.equal((await f.request(`/api/products/${p.id}`, 'PUT', { ...p, image: null }, { Cookie: f.auth.Cookie })).status, 403);
});
test('deleting an unused product removes its image; archiving a returned product retains it', async (t) => {
    const f = await fixture(t), p = await create(f);
    assert.equal((await f.request(`/api/products/${p.id}`, 'DELETE', {revision:p.revision}, f.auth)).status, 200);
    assert.equal((await f.app.store.db.query("SELECT COUNT(*) AS n FROM product_images", [])).rows[0].n, 0);
    const other = await create(f);
    await f.app.store.createReturn({ productId: other.id, serialNumber: 'KEEP-IMAGE' });
    const res = await f.request(`/api/products/${other.id}`, 'DELETE', {revision:other.revision}, f.auth);
    assert.equal((await res.json()).archived, true);
    assert.equal((await f.request(`/api/products/${other.id}/image`, 'GET', undefined, f.auth)).status, 200);
});
test('a full backup and restore retain product images', async (t) => {
    const f = await fixture(t), p = await create(f), meta = await f.app.backups.create({ id: null, name: 'Test', source: 'system' }, 'manual'), target = join(f.dataDir, 'restored-images');
    await restoreBackup({ archive: join(f.dataDir, 'backups', meta.filename), target,databaseConfig:f.databaseConfig });
    const pg=await postgresFixture(t);await importData(pg.database,join(target,'data.jsonl'));
    const restored={store:await createStore({database:pg.database}),close:()=>pg.database.close()};
    try {
        assert.equal((await restored.store.getProduct(p.id)).imageVersion, p.imageVersion);
        assert.deepEqual(Buffer.from((await restored.store.db.query("SELECT data FROM product_images WHERE productId=$1", [p.id])).rows[0].data), png);
    }
    finally {
        await restored.close();
    }
});
