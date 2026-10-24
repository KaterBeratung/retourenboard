import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from './helpers/postgres-fixtures.js';
import { createUsers } from '../dist/server/users.js';
import { createPreferences } from '../dist/server/preferences.js';
import { createCollaboration } from '../dist/server/collaboration.js';
import { handleCollaborationRoute } from '../dist/server/collaboration-routes.js';
async function fixture(t) {
    const dir = mkdtempSync(join(tmpdir(), 'retourenboard-chat-search-')), path = join(dir, 'board.sqlite');
    let store, users, c;
    async function connect() { store = await createStore(path); users = createUsers(store); c = await createCollaboration({ store, users, preferences: createPreferences(store.db), dataDir: dir }); }
    await connect();
    const stamp = '2026-10-13T10:00:00Z';
    for (const [n, name, role] of [[1, 'Admin', 'admin'], [2, 'Alice', 'member'], [3, 'Bobby', 'member'], [4, 'Viewer', 'viewer']])
        await store.db.query("INSERT INTO users(id,username,usernameKey,displayName,role,passwordHash,passwordSalt,createdAt,updatedAt) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id", [n, name, name.toLowerCase(), name, role, 'hash', 'salt', stamp, stamp]);
    t.after(() => { c.dispose(); store.close(); rmSync(dir, { recursive: true, force: true }); });
    const person = async (n) => users.get(n), group = async (owner = 2, visibility = 'private') => c.createChannel(await person(owner), { kind: 'group', name: 'Prüfteam', visibility, memberIds: [3] }), send = async (channelId, text, n = 2) => c.postMessage(await person(n), channelId, { text });
    return { get c() { return c; }, get store() { return store; }, get users() { return users; }, person, group, send, async reconnect() { c.dispose(); store.close(); await connect(); },
        async route(path, method, n = 2, query = {}, input = {}) { let response; const handled = await handleCollaborationRoute({ path, method, query, body: async () => input, user: async () => person(n), json: value => response = value, mutate: async (job) => store.transaction(job), collaboration: c }); assert.equal(handled, true, 'The endpoint must be registered'); return response; } };
}
test('chat search finds older history with bounded, stable pages and literal wildcard characters', async (t) => {
    const f = await fixture(t), channel = await f.group();
    for (let n = 0; n < 65; n++)
        await f.send(channel.id, n === 0 ? 'Seltener Altbestand 100%_' : 'Prüfung Paket ' + n);
    const recent = await f.c.messages(await f.person(2), channel.id);
    assert.ok(!recent.items.some(row => row.text.includes('Altbestand')));
    const found = await f.route(`/api/chat/channels/${channel.id}/search`, 'GET', 2, { q: 'altbestand 100%_' });
    assert.equal(found.items.length, 1);
    assert.equal(found.items[0].text, 'Seltener Altbestand 100%_');
    const first = await f.route(`/api/chat/channels/${channel.id}/search`, 'GET', 2, { q: 'Paket' });
    assert.equal(first.items.length, 50);
    assert.equal(first.hasMore, true);
    const second = await f.c.searchMessages(await f.person(2), channel.id, { q: 'Paket', before: first.nextBefore });
    assert.equal(second.items.length, 14);
    assert.equal(second.hasMore, false);
    assert.equal(new Set([...first.items, ...second.items].map(row => row.id)).size, 64);
    assert.deepEqual((await f.c.searchMessages(await f.person(2), channel.id, { q: '%_' })).items.map(row => row.text), ['Seltener Altbestand 100%_']);
});
test('search and pin reads cannot expose private channels to outsiders or removed members', async (t) => {
    const f = await fixture(t), channel = await f.group(), message = await f.send(channel.id, 'Privates Suchwort');
    await f.route(`/api/chat/messages/${message.id}/pin`, 'PUT', 2, {}, { pinned: true });
    for (const n of [1, 4])
        for (const action of ['search', 'pins'])
            await assert.rejects(f.route(`/api/chat/channels/${channel.id}/${action}`, 'GET', n, { q: 'Suchwort' }), error => error.status === 404);
    await f.c.updateChannel(await f.person(2), channel.id, { memberIds: [] });
    for (const action of ['search', 'pins'])
        await assert.rejects(f.route(`/api/chat/channels/${channel.id}/${action}`, 'GET', 3, { q: 'Suchwort' }), error => error.status === 404);
    await f.users.update(2, { permissions: { chatRead: false } });
    await assert.rejects(f.route(`/api/chat/channels/${channel.id}/search`, 'GET', 2, { q: 'Suchwort' }), error => error.status === 403);
});
test('pinning persists across database reopen, supports idempotence and never exposes deleted content', async (t) => {
    const f = await fixture(t), channel = await f.group(), message = await f.send(channel.id, 'Wichtige Entscheidung');
    const saved = await f.route(`/api/chat/messages/${message.id}/pin`, 'PUT', 2, {}, { pinned: true });
    assert.equal(saved.pinned, true);
    assert.equal(saved.canPin, true);
    assert.deepEqual((await f.c.getChannel(await f.person(2), channel.id)).pins.map(row => row.id), [message.id], 'Opening a channel includes its pinned area');
    await f.route(`/api/chat/messages/${message.id}/pin`, 'PUT', 2, {}, { pinned: true });
    await f.reconnect();
    const pins = await f.route(`/api/chat/channels/${channel.id}/pins`, 'GET', 3);
    assert.deepEqual(pins.items.map(row => row.text), ['Wichtige Entscheidung']);
    assert.equal((await f.c.messages(await f.person(2), channel.id)).items[0].pinned, true);
    await f.c.changeMessage(await f.person(2), message.id, {}, true);
    assert.deepEqual((await f.route(`/api/chat/channels/${channel.id}/pins`, 'GET', 2)).items, []);
    assert.deepEqual((await f.c.searchMessages(await f.person(2), channel.id, { q: 'Entscheidung' })).items, []);
    const deleted = (await f.c.messages(await f.person(2), channel.id)).items[0];
    assert.equal(deleted.pinned, false);
    assert.equal(deleted.canPin, false);
    await assert.rejects(f.route(`/api/chat/messages/${message.id}/pin`, 'PUT', 2, {}, { pinned: true }), error => error.status === 409);
});
test('pin rights allow own messages, group ownership and public moderation with immediate revocation', async (t) => {
    const f = await fixture(t), channel = await f.group(), message = await f.send(channel.id, 'Nachricht von Bobby', 3), own = await f.send(channel.id, 'Eigene Nachricht');
    assert.equal((await f.c.messages(await f.person(2), channel.id)).items.find(row => row.id === message.id).canPin, true, 'Group ownership allows curating the group');
    await f.route(`/api/chat/messages/${message.id}/pin`, 'PUT', 2, {}, { pinned: true });
    await assert.rejects(f.route(`/api/chat/messages/${own.id}/pin`, 'PUT', 3, {}, { pinned: false }), error => error.status === 403);
    await f.users.update(2, { permissions: { chatGroupsCreate: false, chatSend: false } });
    await assert.rejects(f.route(`/api/chat/messages/${message.id}/pin`, 'PUT', 2, {}, { pinned: false }), error => error.status === 403);
    await assert.rejects(f.route(`/api/chat/messages/${own.id}/pin`, 'PUT', 2, {}, { pinned: true }), error => error.status === 403);
    const publicId = (await f.c.channels(await f.person(1))).find(row => row.kind === 'public').id, publicMessage = await f.send(publicId, 'Öffentlich', 3);
    assert.equal((await f.route(`/api/chat/messages/${publicMessage.id}/pin`, 'PUT', 1, {}, { pinned: true })).pinned, true);
    await assert.rejects(f.route(`/api/chat/messages/${publicMessage.id}/pin`, 'PUT', 4, {}, { pinned: false }), error => error.status === 403);
    await assert.rejects(f.route(`/api/chat/messages/${message.id}/pin`, 'PUT', 1, {}, { pinned: false }), error => error.status === 404);
});
test('search cursors and pin inputs are validated, and pinned messages can be unpinned', async (t) => {
    const f = await fixture(t), channel = await f.group(), message = await f.send(channel.id, 'Prüfung');
    for (const query of [{ q: '' }, { q: ' ' }, { q: 'x'.repeat(201) }, { q: 'Prüfung', before: -1 }, { q: 'Prüfung', before: 'NaN' }, { q: 'Prüfung', after: 1 }])
        await assert.rejects(f.route(`/api/chat/channels/${channel.id}/search`, 'GET', 2, query), error => error.status === 400);
    for (const input of [null, {}, { pinned: 'yes' }, { pinned: 1 }])
        await assert.rejects(f.route(`/api/chat/messages/${message.id}/pin`, 'PUT', 2, {}, input), error => error.status === 400);
    await f.route(`/api/chat/messages/${message.id}/pin`, 'PUT', 2, {}, { pinned: true });
    const unpinned = await f.route(`/api/chat/messages/${message.id}/pin`, 'PUT', 2, {}, { pinned: false });
    assert.equal(unpinned.pinned, false);
    assert.deepEqual((await f.c.pins(await f.person(2), channel.id)).items, []);
});
