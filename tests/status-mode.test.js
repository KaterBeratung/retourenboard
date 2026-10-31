import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import {runtimeFixture} from './helpers/runtime.js';
import {ensureStatusMode} from '../dist/server/status-mode.js';

const active = async f => (await f.app.store.listMasterData()).statuses.filter(item => item.active).map(item => item.name).sort();
const standard = ['Abgeschlossen', 'Eingegangen', 'In Bearbeitung'];

test('a new installation uses the three fixed statuses and refuses every change to them', async t => {
    const f = await runtimeFixture(t, {customStatuses: undefined}), {auth} = await f.setup();
    assert.deepEqual(await active(f), standard);
    const all = (await f.app.store.listMasterData()).statuses;
    assert.equal(all.find(item => item.name === 'In Prüfung').active, false, 'the fourth built-in status is archived');
    assert.equal((await (await f.request('/api/config', 'GET', undefined, auth)).json()).rules.customStatuses, false);
    const received = all.find(item => item.name === 'Eingegangen');
    for (const [path, method, body] of [['/api/masterdata/statuses', 'POST', {name: 'Wartet'}], [`/api/masterdata/${received.id}`, 'PUT', {name: 'Neu'}], [`/api/masterdata/${received.id}`, 'DELETE']]) {
        const response = await f.request(path, method, body, auth);
        assert.equal(response.status, 409, `${method} ${path}`);
        assert.match((await response.json()).error, /Standard-Status sind fest/);
    }
    // Other lists stay editable.
    assert.equal((await f.request('/api/masterdata/reasons', 'POST', {name: 'Zu spät'}, auth)).status, 201);
    const product = await f.app.store.createProduct({sku: 'STD', name: 'Standard'});
    const created = await f.app.store.createReturn({serialNumber: 'STD-1', productId: product.id, receiptDate: '2026-10-01'});
    assert.equal(created.status, 'Eingegangen', 'new returns start with the default');
    await assert.rejects(() => f.app.store.createReturn({serialNumber: 'STD-2', productId: product.id, receiptDate: '2026-10-01', statusId: all.find(item => item.name === 'In Prüfung').id}), /Archivierte Werte/);
});

test('own statuses can be switched on, and the standard comes back once no return uses another status', async t => {
    const f = await runtimeFixture(t, {customStatuses: undefined}), {auth} = await f.setup();
    assert.equal((await f.request('/api/admin/rules', 'PUT', {customStatuses: true}, auth)).status, 200);
    const waiting = await (await f.request('/api/masterdata/statuses', 'POST', {name: 'Wartet auf Kunde', tone: 'neutral'}, auth)).json();
    assert.equal(waiting.name, 'Wartet auf Kunde');
    const checking = (await f.app.store.listMasterData()).statuses.find(item => item.name === 'In Prüfung');
    assert.equal((await f.request(`/api/masterdata/${checking.id}`, 'PUT', {active: true}, auth)).status, 200);
    assert.deepEqual(await active(f), [...standard, 'In Prüfung', 'Wartet auf Kunde'].sort());
    const product = await f.app.store.createProduct({sku: 'OWN', name: 'Own'});
    const row = await f.app.store.createReturn({serialNumber: 'OWN-1', productId: product.id, receiptDate: '2026-10-01', statusId: waiting.id});
    const refused = await f.request('/api/admin/rules', 'PUT', {customStatuses: false}, auth);
    assert.equal(refused.status, 409);
    assert.match((await refused.json()).error, /Wartet auf Kunde \(1\)/);
    assert.equal((await (await f.request('/api/admin/rules', 'GET', undefined, auth)).json()).customStatuses, true, 'a refused switch changes nothing');
    const received = (await f.app.store.listMasterData()).statuses.find(item => item.name === 'Eingegangen');
    await f.app.store.updateReturn(row.id, {...row, statusId: received.id});
    assert.equal((await f.request('/api/admin/rules', 'PUT', {customStatuses: false}, auth)).status, 200);
    assert.deepEqual(await active(f), standard);
    const names = (await f.app.store.listMasterData()).statuses.filter(item => !item.active).map(item => item.name).sort();
    assert.deepEqual(names, ['In Prüfung', 'Wartet auf Kunde']);
    assert.equal((await f.request('/api/masterdata/statuses', 'POST', {name: 'Noch einer'}, auth)).status, 409);
});

test('going back to the standard restores renamed or reconfigured built-in statuses', async t => {
    const f = await runtimeFixture(t, {customStatuses: undefined}), {auth} = await f.setup();
    await f.request('/api/admin/rules', 'PUT', {customStatuses: true}, auth);
    const find = name => f.app.store.listMasterData().then(all => all.statuses.find(item => item.name === name));
    const working = await find('In Bearbeitung'), done = await find('Abgeschlossen');
    assert.equal((await f.request(`/api/masterdata/${working.id}`, 'PUT', {name: 'In Arbeit', isDefault: true}, auth)).status, 200);
    assert.equal((await f.request(`/api/masterdata/${done.id}`, 'PUT', {isClosed: false}, auth)).status, 200);
    assert.equal((await f.request('/api/masterdata/statuses', 'POST', {name: 'Eingegangen (alt)'}, auth)).status, 201);
    assert.equal((await f.request('/api/admin/rules', 'PUT', {customStatuses: false}, auth)).status, 200);
    const statuses = (await f.app.store.listMasterData()).statuses.filter(item => item.active);
    assert.deepEqual(statuses.map(item => item.name).sort(), standard);
    assert.deepEqual(statuses.filter(item => item.isDefault).map(item => item.name), ['Eingegangen']);
    assert.deepEqual(statuses.filter(item => item.isClosed).map(item => item.name), ['Abgeschlossen']);
});

test('an installation that already works with own statuses keeps them; an untouched one moves to the standard', async t => {
    const f = await runtimeFixture(t), {auth} = await f.setup();            // test fixtures keep the four built-in statuses
    const db = f.app.store.db, deps = {db, preferences: f.app.preferences, masters: f.app.store.masters};
    assert.equal((await f.app.preferences.get('rules')).customStatuses, true);
    const forget = () => db.query("DELETE FROM app_preferences WHERE section='rules'", []);
    // untouched four built-in statuses, no return in the fourth one: standard
    await forget();
    assert.equal(await ensureStatusMode(deps), false);
    assert.deepEqual(await active(f), standard);
    // own status: stays as it is
    await f.request('/api/admin/rules', 'PUT', {customStatuses: true}, auth);
    await f.request('/api/masterdata/statuses', 'POST', {name: 'Wartet auf Kunde'}, auth);
    await forget();
    assert.equal(await ensureStatusMode(deps), true);
    assert.ok((await active(f)).includes('Wartet auf Kunde'));
    // a return in the fourth built-in status keeps the installation on its own statuses
    await f.request('/api/admin/rules', 'PUT', {customStatuses: true}, auth);
    const checking = (await f.app.store.listMasterData()).statuses.find(item => item.name === 'In Prüfung');
    await f.request(`/api/masterdata/${checking.id}`, 'PUT', {active: true}, auth);
    const waiting = (await f.app.store.listMasterData()).statuses.find(item => item.name === 'Wartet auf Kunde');
    await f.request(`/api/masterdata/${waiting.id}`, 'DELETE', undefined, auth);
    const product = await f.app.store.createProduct({sku: 'KEEP', name: 'Keep'});
    await f.app.store.createReturn({serialNumber: 'KEEP-1', productId: product.id, receiptDate: '2026-10-01', statusId: checking.id});
    await forget();
    assert.equal(await ensureStatusMode(deps), true);
    assert.ok((await active(f)).includes('In Prüfung'));
});
