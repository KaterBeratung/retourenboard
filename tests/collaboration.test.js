import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import { runtimeFixture, testPassword } from './helpers/runtime.js';
async function team(t) {
    const f = await runtimeFixture(t), { auth, data } = await f.setup();
    const members = {};
    for (const [username, role] of [['Member', 'member'], ['Other', 'member'], ['Viewer', 'viewer']]) {
        const response = await f.request('/api/users', 'POST', { username, password: testPassword, role }, auth);
        members[username] = { user: await response.json(), auth: (await f.login(username)).auth };
    }
    return { ...f, auth, admin: data.user, members };
}
async function create(f, body, auth = f.auth) { const r = await f.request('/api/chat/channels', 'POST', body, auth); assert.equal(r.status, 201); return r.json(); }
async function send(f, id, text, auth = f.auth) { const r = await f.request(`/api/chat/channels/${id}/messages`, 'POST', { text }, auth); assert.equal(r.status, 201); return r.json(); }
test('collaboration requires login and exposes only a minimal active user directory', async (t) => {
    const f = await team(t);
    for (const path of ['/api/chat/channels', '/api/collaboration/users'])
        assert.equal((await f.request(path)).status, 401);
    const res = await f.request('/api/chat/channels', 'GET', undefined, f.auth);
    assert.equal(res.status, 200);
    const channels = await res.json();
    assert.equal(channels[0].kind, 'public');
    assert.equal(channels[0].visibility, 'public');
    const directory = await (await f.request('/api/collaboration/users', 'GET', undefined, f.auth)).json();
    assert.ok(directory.length === 4);
    assert.deepEqual(Object.keys(directory[0]).sort(), ['chatAvailable', 'displayName', 'id', 'username']);
    assert.equal((await f.request('/api/chat/channels', 'POST', { kind: 'direct', userId: f.members.Member.user.id }, { ...f.auth, 'X-CSRF-Token': 'wrong' })).status, 403);
});
test('direct messages are idempotent and only visible to their two participants, including against admins', async (t) => {
    const f = await team(t), alice = f.members.Member, bob = f.members.Other;
    const channel = await create(f, { kind: 'direct', userId: bob.user.id }, alice.auth), same = await create(f, { kind: 'direct', userId: alice.user.id }, bob.auth);
    assert.equal(same.id, channel.id);
    await send(f, channel.id, 'Private Nachricht', alice.auth);
    for (const auth of [f.auth, f.members.Viewer.auth]) {
        assert.equal((await f.request(`/api/chat/channels/${channel.id}`, 'GET', undefined, auth)).status, 404);
        assert.equal((await f.request(`/api/chat/channels/${channel.id}/messages`, 'GET', undefined, auth)).status, 404);
        const visible = await (await f.request('/api/chat/channels', 'GET', undefined, auth)).json();
        assert.ok(!visible.some(c => c.id === channel.id));
    }
    const inbox = await (await f.request('/api/notifications', 'GET', undefined, bob.auth)).json();
    assert.equal(inbox.unread, 1);
    assert.equal(inbox.items[0].href, `/chat#channel-${channel.id}`);
    assert.equal((await f.request(`/api/chat/channels/${channel.id}/read`, 'POST', {}, bob.auth)).status, 200);
    const channels = await (await f.request('/api/chat/channels', 'GET', undefined, bob.auth)).json();
    assert.equal(channels.find(c => c.id === channel.id).unread, 0);
});
test('closed groups protect history and notifications after removal and require the owner for member management', async (t) => {
    const f = await team(t), alice = f.members.Member, bob = f.members.Other;
    const group = await create(f, { kind: 'group', name: 'Prüfteam', visibility: 'private', memberIds: [alice.user.id] }, f.auth);
    await send(f, group.id, '@Member bitte prüfen.');
    assert.equal((await f.request(`/api/chat/channels/${group.id}/messages`, 'GET', undefined, bob.auth)).status, 404);
    assert.equal((await f.request(`/api/chat/channels/${group.id}`, 'PUT', { memberIds: [bob.user.id] }, alice.auth)).status, 403);
    assert.equal((await f.request(`/api/chat/channels/${group.id}`, 'PUT', { memberIds: [bob.user.id] }, f.auth)).status, 200);
    assert.equal((await f.request(`/api/chat/channels/${group.id}/messages`, 'GET', undefined, alice.auth)).status, 404);
    const inbox = await (await f.request('/api/notifications', 'GET', undefined, alice.auth)).json();
    assert.ok(!inbox.items.some(n => n.href === `/chat#channel-${group.id}`));
    assert.equal((await f.request(`/api/chat/channels/${group.id}/messages`, 'GET', undefined, bob.auth)).status, 200);
});
test('public groups support joining and leaving, viewers read without sending, and permissions take immediate effect', async (t) => {
    const f = await team(t), group = await create(f, { kind: 'group', name: 'Alle Fragen', visibility: 'public', memberIds: [] });
    assert.equal((await f.request(`/api/chat/channels/${group.id}/join`, 'POST', {}, f.members.Member.auth)).status, 200);
    assert.equal((await f.request(`/api/chat/channels/${group.id}/leave`, 'POST', {}, f.members.Member.auth)).status, 200);
    const latest = await send(f, group.id, 'Öffentliche Frage');
    await f.request(`/api/chat/channels/${group.id}/read`, 'POST', { messageId: latest.id }, f.members.Member.auth);
    const viewed = await (await f.request(`/api/chat/channels/${group.id}`, 'GET', undefined, f.members.Member.auth)).json();
    assert.equal(viewed.joined, false, 'Reading must not subscribe a person who left the group');
    assert.equal((await f.request(`/api/chat/channels/${group.id}/messages`, 'GET', undefined, f.members.Viewer.auth)).status, 200);
    assert.equal((await f.request(`/api/chat/channels/${group.id}/messages`, 'POST', { text: 'Read only' }, f.members.Viewer.auth)).status, 403);
    await f.request(`/api/users/${f.members.Member.user.id}`, 'PUT', { permissions: { chatRead: false } }, f.auth);
    assert.equal((await f.request('/api/chat/channels', 'GET', undefined, f.members.Member.auth)).status, 403);
});
test('group creation is independent from sending, and revoking group management blocks an existing owner immediately', async (t) => {
    const f = await team(t), alice = f.members.Member;
    await f.request(`/api/users/${alice.user.id}`, 'PUT', { permissions: { chatSend: false, chatGroupsCreate: true } }, f.auth);
    const group = await create(f, { kind: 'group', name: 'Nur verwalten', visibility: 'private', memberIds: [] }, alice.auth);
    await f.request(`/api/users/${alice.user.id}`, 'PUT', { permissions: { chatGroupsCreate: false } }, f.auth);
    const view = await (await f.request(`/api/chat/channels/${group.id}`, 'GET', undefined, alice.auth)).json();
    assert.equal(view.canManage, false);
    assert.equal((await f.request(`/api/chat/channels/${group.id}`, 'PUT', { name: 'Unzulässig' }, alice.auth)).status, 403);
    await f.request(`/api/users/${alice.user.id}`, 'PUT', { role: 'viewer' }, f.auth);
    assert.equal((await f.request(`/api/chat/channels/${group.id}`, 'PUT', { name: 'Viewer darf nicht verwalten' }, alice.auth)).status, 403);
});
test('messages reject invalid content, allow author edits and soft deletion, and restrict moderation to public channels', async (t) => {
    const f = await team(t), publicChannel = (await (await f.request('/api/chat/channels', 'GET', undefined, f.auth)).json())[0];
    for (const text of ['', ' ', 'x'.repeat(4001), 42])
        assert.equal((await f.request(`/api/chat/channels/${publicChannel.id}/messages`, 'POST', { text }, f.auth)).status, 400);
    const msg = await send(f, publicChannel.id, '@Member prüfe bitte <script>');
    assert.equal(msg.mentions.length, 1);
    assert.equal((await f.request(`/api/chat/messages/${msg.id}`, 'PUT', { text: 'Fremde Änderung' }, f.members.Member.auth)).status, 403);
    assert.equal((await f.request(`/api/chat/messages/${msg.id}`, 'PUT', { text: 'Erledigt' }, f.auth)).status, 200);
    assert.equal((await f.request(`/api/chat/messages/${msg.id}`, 'DELETE', undefined, f.auth)).status, 200);
    const result = await (await f.request(`/api/chat/channels/${publicChannel.id}/messages`, 'GET', undefined, f.auth)).json();
    assert.equal(result.items[0].deleted, true);
    assert.equal(result.items[0].text, '');
    assert.deepEqual(result.items[0].mentions, []);
});
test('mention notifications are personal, deduplicated and restricted to private-channel participants', async (t) => {
    const f = await team(t), alice = f.members.Member, bob = f.members.Other, channel = await create(f, { kind: 'direct', userId: bob.user.id }, alice.auth);
    const msg = await send(f, channel.id, '@Other @Other @Admin @Viewer email@Other.com', alice.auth);
    assert.deepEqual(msg.mentions.map(u => u.id), [bob.user.id]);
    const inbox = await (await f.request('/api/notifications', 'GET', undefined, bob.auth)).json();
    assert.equal(inbox.items.length, 1);
    assert.equal(inbox.items[0].kind, 'chatMention');
    for (const auth of [f.auth, f.members.Viewer.auth])
        assert.equal((await (await f.request('/api/notifications', 'GET', undefined, auth)).json()).items.length, 0);
});
test('history is paginated in order and marking read cannot consume later incoming messages', async (t) => {
    const f = await team(t), channel = await create(f, { kind: 'direct', userId: f.members.Member.user.id });
    for (let i = 0; i < 55; i++)
        await send(f, channel.id, 'Text ' + i);
    const latest = await (await f.request(`/api/chat/channels/${channel.id}/messages`, 'GET', undefined, f.members.Member.auth)).json();
    assert.equal(latest.items.length, 50);
    assert.equal(latest.hasMore, true);
    assert.ok(latest.items[0].id < latest.items.at(-1).id);
    await f.request(`/api/chat/channels/${channel.id}/read`, 'POST', { messageId: latest.items.at(-1).id }, f.members.Member.auth);
    await send(f, channel.id, 'Neue Nachricht');
    const visible = await (await f.request('/api/chat/channels', 'GET', undefined, f.members.Member.auth)).json();
    assert.equal(visible.find(c => c.id === channel.id).unread, 1);
    const older = await (await f.request(`/api/chat/channels/${channel.id}/messages?before=${latest.items[0].id}`, 'GET', undefined, f.members.Member.auth)).json();
    assert.equal(older.items.length, 5);
    const newer = await (await f.request(`/api/chat/channels/${channel.id}/messages?after=${latest.items.at(-1).id}`, 'GET', undefined, f.members.Member.auth)).json();
    assert.equal(newer.items.length, 1);
    assert.equal(newer.items[0].text, 'Neue Nachricht');
    const snapshot = await (await f.request(`/api/chat/channels/${channel.id}/messages?ids=${older.items[0].id},${latest.items[0].id}`, 'GET', undefined, f.members.Member.auth)).json();
    assert.equal(snapshot.items.length, 2);
    const foreign = await send(f, (await (await f.request('/api/chat/channels', 'GET', undefined, f.auth)).json()).find(c => c.kind === 'public').id, 'Anderer Kanal');
    const isolated = await (await f.request(`/api/chat/channels/${channel.id}/messages?ids=${foreign.id}`, 'GET', undefined, f.members.Member.auth)).json();
    assert.deepEqual(isolated.items, []);
    for (const query of ['?after=-1', '?after=1&before=2', '?ids=1,NaN', '?ids=1&after=0'])
        assert.equal((await f.request(`/api/chat/channels/${channel.id}/messages${query}`, 'GET', undefined, f.auth)).status, 400);
});
test('return comments support mentions, independent write rights, author changes and disappear with deleted returns', async (t) => {
    const f = await team(t), product = await f.app.store.createProduct({ name: 'Testprodukt', sku: 'COMMENT-1' }), ret = await f.app.store.createReturn({ productId: product.id, serialNumber: 'SN-COMMENT' });
    const path = `/api/returns/${ret.id}/comments`;
    assert.equal((await f.request(path)).status, 401);
    assert.equal((await f.request(path, 'POST', { text: 'Leserkommentar' }, f.members.Viewer.auth)).status, 403);
    const response = await f.request(path, 'POST', { text: '@Other bitte die Seriennummer prüfen.' }, f.members.Member.auth);
    assert.equal(response.status, 201);
    const comment = await response.json();
    const inbox = await (await f.request('/api/notifications', 'GET', undefined, f.members.Other.auth)).json(), notice = inbox.items.find(n => n.kind === 'returnMention');
    assert.ok(notice);
    assert.equal(notice.href, `/#returns?detail=${ret.id}`);
    assert.equal((await f.request(`/api/returns/${ret.id}/comments/${comment.id}`, 'PUT', { text: 'Geprüft' }, f.members.Other.auth)).status, 403);
    assert.equal((await f.request(`/api/returns/${ret.id}/comments/${comment.id}`, 'PUT', { text: 'Geprüft' }, f.members.Member.auth)).status, 200);
    await f.request(`/api/users/${f.members.Member.user.id}`, 'PUT', { permissions: { commentsCreate: false } }, f.auth);
    assert.equal((await f.request(path, 'POST', { text: 'Noch ein Kommentar' }, f.members.Member.auth)).status, 403);
    assert.equal((await f.request(path, 'GET', undefined, f.members.Member.auth)).status, 200);
    assert.equal((await f.request(`/api/returns/${ret.id}/comments/${comment.id}`, 'DELETE', undefined, f.auth)).status, 200);
    await f.app.store.deleteReturn(ret.id);
    assert.equal((await f.request(path, 'GET', undefined, f.auth)).status, 404);
});
