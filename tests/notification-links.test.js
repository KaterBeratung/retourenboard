import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import {runtimeFixture} from './helpers/runtime.js';

// A system notice for one return opens that return, not just the list; older notices that only link to the list are resolved by the number in their message.
test('a notice for one new or overdue return opens exactly that return, an import opens the list', async t => {
    let now = Date.parse('2026-10-06T12:00:00Z');
    const f = await runtimeFixture(t, {now: () => now});
    await f.setup();
    const product = await f.app.store.createProduct({sku: 'LINK', name: 'Link'});
    const single = await f.app.store.withActor({id: 1, name: 'Admin', source: 'user', operationId: 'single1'}, async () => f.app.store.transaction(async () => f.app.store.createReturn({serialNumber: 'LINK-SN-1', productId: product.id, receiptDate: '2026-09-01'})));
    await f.app.store.withActor({id: 1, name: 'Admin', source: 'user', operationId: 'import2'}, async () => f.app.store.transaction(async () => {
        await f.app.store.createReturn({serialNumber: 'LINK-SN-2', productId: product.id, receiptDate: '2026-10-06'});
        await f.app.store.createReturn({serialNumber: 'LINK-SN-3', productId: product.id, receiptDate: '2026-10-06'});
    }));
    await f.app.notifications.drain();
    await f.app.notifications.checkOverdue();
    const rows = (await f.app.store.db.query('SELECT kind,message,href FROM notifications ORDER BY id', [])).rows;
    const created = rows.find(row => row.kind === 'newReturn' && row.message.startsWith(single.returnNumber));
    assert.equal(created.href, `/#returns?detail=${single.id}`);
    assert.ok(rows.some(row => row.kind === 'newReturn' && /^2 Retouren wurden importiert\.$/.test(row.message) && row.href === '/#returns'), 'a bulk import links to the list');
    const overdue = rows.find(row => row.kind === 'overdue' && row.message.startsWith(single.returnNumber));
    assert.equal(overdue.href, `/#returns?detail=${single.id}`);
});

test('older notices that only link to the list resolve to the return named in their message when the inbox is read', async t => {
    const f = await runtimeFixture(t);
    await f.setup();
    const product = await f.app.store.createProduct({sku: 'OLD', name: 'Old'});
    const ret = await f.app.store.createReturn({serialNumber: 'OLD-SN-1', productId: product.id, receiptDate: '2026-10-06'});
    const insert = (key, kind, message, href) => f.app.store.db.query('INSERT INTO notifications(eventKey,userId,kind,title,message,href,createdAt) VALUES($1,1,$2,$3,$4,$5,$6)', [key, kind, 'Titel', message, href, new Date().toISOString()]);
    await insert('old-created', 'newReturn', `${ret.returnNumber} wurde angelegt.`, '/#returns');
    await insert('old-overdue', 'overdue', `${ret.returnNumber} hat die Bearbeitungsfrist überschritten.`, '/#returns');
    await insert('old-unknown', 'overdue', 'RET-9999-999999 hat die Bearbeitungsfrist überschritten.', '/#returns');
    await insert('old-backup', 'backupError', 'Bitte die Sicherungen im Adminbereich prüfen.', '/admin#backups');
    const items = (await f.app.notifications.list(1)).items, byKey = Object.fromEntries(items.map(item => [item.eventKey, item.href]));
    assert.equal(byKey['old-created'], `/#returns?detail=${ret.id}`);
    assert.equal(byKey['old-overdue'], `/#returns?detail=${ret.id}`);
    assert.equal(byKey['old-unknown'], '/#returns', 'an unknown number keeps the list link');
    assert.equal(byKey['old-backup'], '/admin#backups');
});
