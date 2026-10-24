import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import { runtimeFixture, testPassword } from './helpers/runtime.js';
import { sourceModule } from './helpers/source-module.js';
import { enableMfa } from './helpers/mfa.js';
import { createStore } from './helpers/postgres-fixtures.js';
import { createUsers } from '../dist/server/users.js';
const confirmation = username => ({ username, confirmed: true, password: testPassword });
test('an administrator with MFA must supply a valid factor to delete an account', async (t) => {
    const f = await runtimeFixture(t), { auth } = await f.setup();
    const factor = await enableMfa(f, auth, Date.now());
    const worker = await f.app.users.create({ username: 'Worker', password: testPassword });
    assert.equal((await f.request(`/api/users/${worker.id}`, 'DELETE', confirmation('Worker'), factor.auth)).status, 401);
    assert.ok(await f.app.users.get(worker.id));
    assert.equal((await f.request(`/api/users/${worker.id}`, 'DELETE', { ...confirmation('Worker'), factor: factor.recoveryCodes[0] }, factor.auth)).status, 200);
});
test('an admin can delete a different account, invalidate its sessions and reuse its username without reviving access', async (t) => {
    const f = await runtimeFixture(t), { auth } = await f.setup();
    assert.equal((await f.request('/account-deletion.js')).status, 401);
    assert.equal((await f.request('/account-deletion.js', 'GET', undefined, auth)).status, 200);
    const worker = await f.app.users.create({ username: 'Worker', displayName: 'Old Worker', password: testPassword });
    const workerAuth = (await f.login('Worker')).auth;
    const direct = await f.app.collaboration.createChannel(await f.app.users.get(1), { kind: 'direct', userId: worker.id });
    const response = await f.request(`/api/users/${worker.id}`, 'DELETE', confirmation('Worker'), auth);
    assert.equal(response.status, 200, await response.text());
    assert.equal(await f.app.users.get(worker.id), null);
    assert.equal(await f.app.users.credentialsById(worker.id), null);
    assert.equal(await f.app.users.credentialsByName('Worker'), null);
    assert.equal((await (await f.request('/api/session', 'GET', undefined, workerAuth)).json()).unlocked, false);
    assert.equal((await f.login('Worker')).res.status, 401);
    assert.equal((await (await f.request('/api/users', 'GET', undefined, auth)).json()).some(user => user.id === worker.id), false);
    const recreated = await f.app.users.create({ username: 'Worker', displayName: 'New Worker', password: testPassword });
    assert.notEqual(recreated.id, worker.id);
    await assert.rejects(async () => f.app.collaboration.getChannel(recreated, direct.id), /gefunden/);
    assert.equal(await f.app.users.setupRequired(), false);
});
test('account deletion enforces admin, CSRF, identity, explicit confirmation and own-account protection', async (t) => {
    const f = await runtimeFixture(t), { auth, data } = await f.setup();
    const worker = await f.app.users.create({ username: 'Worker', password: testPassword });
    const member = (await f.login('Worker')).auth;
    assert.equal((await f.request(`/api/users/${worker.id}`, 'DELETE', confirmation('Worker'))).status, 401);
    assert.equal((await f.request(`/api/users/${data.user.id}`, 'DELETE', confirmation('Admin'), member)).status, 403);
    assert.equal((await f.request(`/api/users/${worker.id}`, 'DELETE', confirmation('Worker'), { Cookie: auth.Cookie })).status, 403);
    for (const body of [{ ...confirmation('Worker'), confirmed: false }, { ...confirmation('Worker'), confirmed: 'true' }, confirmation('Wrong'), { ...confirmation('Worker'), password: 'WrongPassword!' }]) {
        const response = await f.request(`/api/users/${worker.id}`, 'DELETE', body, auth);
        assert.ok([400, 401].includes(response.status), `Unexpected status ${response.status}`);
        assert.ok(await f.app.users.get(worker.id));
    }
    await f.app.users.create({ username: 'SecondAdmin', role: 'admin', password: testPassword });
    assert.equal((await f.request(`/api/users/${data.user.id}`, 'DELETE', confirmation('Admin'), auth)).status, 400);
    assert.equal((await f.request('/api/users/999', 'DELETE', confirmation('Missing'), auth)).status, 404);
    assert.equal((await f.request(`/api/users/${worker.id}`, 'DELETE', confirmation('Worker'), auth)).status, 200);
    assert.equal((await f.request(`/api/users/${worker.id}`, 'DELETE', confirmation('Worker'), auth)).status, 404);
});
test('deletion preserves messages/comments and their IDs, clears assignments and credentials, and transfers existing private group ownership safely', async (t) => {
    const f = await runtimeFixture(t), { auth, data } = await f.setup(), admin = await f.app.users.get(data.user.id);
    const worker = await f.app.users.create({ username: 'Worker', password: testPassword }), outside = await f.app.users.create({ username: 'Outside', role: 'admin', password: testPassword });
    const product = await f.app.store.createProduct({ name: 'Device', sku: 'DEVICE' }), row = await f.app.store.createReturn({ productId: product.id, serialNumber: 'SN-1', assignedUserId: worker.id });
    const team = (await f.app.collaboration.channels(worker)).find(c => c.kind === 'public'), message = await f.app.collaboration.postMessage(worker, team.id, { text: 'Historical message' });
    await f.app.collaboration.pinMessage(worker, message.id, { pinned: true });
    const comment = await f.app.collaboration.postComment(worker, row.id, { text: 'Historical comment' });
    const group = await f.app.collaboration.createChannel(worker, { kind: 'group', name: 'Private history', visibility: 'private', memberIds: [admin.id] });
    const publicGroup = await f.app.collaboration.createChannel(worker, { kind: 'group', name: 'Public history', visibility: 'public', memberIds: [] });
    const direct = await f.app.collaboration.createChannel(worker, { kind: 'direct', userId: admin.id });
    const db = f.app.store.db;
    await db.query("INSERT INTO account_preferences(userId,value) VALUES($1,$2)", [worker.id, '{"theme":"dark"}']);
    await db.query("INSERT INTO user_mfa(userId,secretEnc) VALUES($1,$2)", [worker.id, 'TEST-SECRET']);
    await db.query("INSERT INTO recovery_codes(userId,hash) VALUES($1,$2)", [worker.id, 'TEST-RECOVERY']);
    const response = await f.request(`/api/users/${worker.id}`, 'DELETE', confirmation('Worker'), auth);
    assert.equal(response.status, 200, await response.text());
    assert.equal((await f.app.store.getReturn(row.id)).assignedUserId, null);
    assert.equal((await f.app.store.getReturn(row.id)).assignedDisplayName, '');
    assert.equal((await f.app.store.listProducts()).length, 1);
    assert.equal((await f.app.store.listReturns()).length, 1);
    const retained = (await f.app.collaboration.messages(admin, team.id)).items.find(item => item.id === message.id);
    assert.equal(retained.text, 'Historical message');
    assert.equal(retained.author.displayName, 'Gelöschtes Konto');
    assert.equal(retained.pinned, true);
    assert.equal((await f.app.collaboration.comments(admin, row.id)).items.find(item => item.id === comment.id).text, 'Historical comment');
    assert.equal((await f.app.collaboration.getChannel(admin, group.id)).ownerId, admin.id);
    assert.equal((await f.app.collaboration.getChannel(admin, group.id)).canManage, true);
    await assert.rejects(async () => f.app.collaboration.getChannel(outside, group.id), /gefunden/);
    assert.equal((await f.app.collaboration.getChannel(admin, publicGroup.id)).ownerId, null);
    assert.equal((await f.app.collaboration.updateChannel(admin, publicGroup.id, { memberIds: [admin.id] })).members.length, 1);
    assert.equal((await f.app.collaboration.getChannel(admin, direct.id)).name, 'Gelöschtes Konto');
    for (const table of ['account_preferences', 'user_mfa', 'recovery_codes', 'mfa_enrollments', 'notifications', 'chat_members'])
        assert.equal((await db.query(`SELECT COUNT(*) AS n FROM ${table} WHERE userId=$1`, [worker.id])).rows[0].n, 0, table);
    assert.deepEqual((await db.query("SELECT conname FROM pg_constraint WHERE connamespace=$1::regnamespace AND contype='f' AND NOT convalidated", [db.schema])).rows, []);
    const csv = { kind: 'returns', text: `Artikelnummer;Seriennummer;Zuständig (Konto-ID)\nDEVICE;SN-IMPORTED;${worker.id}` };
    assert.equal((await f.request('/api/import/commit', 'POST', csv, auth)).status, 400);
    const file = await (await f.request('/api/export/all', 'GET', undefined, auth)).json();
    file.returns[0].returnNumber = 'RET-DELETED-ASSIGNEE';
    file.returns[0].assignedUserId = worker.id;
    assert.equal((await f.request('/api/import/commit', 'POST', { kind: 'all', text: JSON.stringify(file) }, auth)).status, 400);
    assert.equal((await f.app.store.listReturns()).length, 1);
    const audit = (await (await f.request(`/api/admin/audit?entity=users&entityId=${worker.id}`, 'GET', undefined, auth)).json()).items;
    assert.equal(audit[0].action, 'delete');
    assert.equal(audit[0].actorName, 'Test Admin');
    assert.equal(JSON.stringify(audit).includes('TEST-SECRET'), false);
});
test('an audit failure rolls back account removal, assignment cleanup and memberships', async (t) => {
    const f = await runtimeFixture(t), { auth } = await f.setup(), worker = await f.app.users.create({ username: 'Worker', password: testPassword });
    const product = await f.app.store.createProduct({ name: 'Device', sku: 'DEVICE' }), row = await f.app.store.createReturn({ productId: product.id, serialNumber: 'SN-1', assignedUserId: worker.id });
    const workerAuth = (await f.login('Worker')).auth, record = f.app.store.recordChange;
    f.app.store.recordChange = change => {
        if (change.entity === 'users' && change.action === 'delete')
            throw Error('Simulated audit failure');
        return record(change);
    };
    assert.equal((await f.request(`/api/users/${worker.id}`, 'DELETE', confirmation('Worker'), auth)).status, 500);
    f.app.store.recordChange = record;
    assert.equal((await f.app.users.get(worker.id)).active, true);
    assert.equal((await f.app.store.getReturn(row.id)).assignedUserId, worker.id);
    assert.equal((await (await f.request('/api/session', 'GET', undefined, workerAuth)).json()).unlocked, true);
});
test('account deletion dialog escapes identifiers, uses a confirmation switch and translates', async () => {
    const ui = await sourceModule("export {renderDeleteUserForm,deleteUserLabel} from './frontend/src/account-deletion.ts'; export {renderMessage,channelDisplayName} from './frontend/src/collaboration-ui.ts'; export {setLanguage,addTranslations} from './frontend/src/i18n.js'; export {english} from './frontend/src/i18n-catalog.js';");
    assert.equal(typeof ui.renderDeleteUserForm, 'function');
    ui.addTranslations(ui.english);
    const user = { username: 'User<script>bad</script>', displayName: '<img onerror=bad>' };
    const markup = String(ui.renderDeleteUserForm(user));
    assert.match(markup, /role="switch"/);
    assert.match(markup, /name="confirmed"/);
    assert.match(markup, /data-form-mode="action"/);
    assert.doesNotMatch(markup, /<script>bad|<img onerror/);
    ui.setLanguage('en');
    try {
        assert.match(String(ui.renderDeleteUserForm(user)), /Delete account/);
        assert.equal(String(ui.deleteUserLabel('Lena')), 'Delete account Lena');
        assert.equal(String(ui.channelDisplayName({ kind: 'direct', name: 'Gelöschtes Konto', members: [{ id: 1 }] })), 'Deleted account');
        assert.equal(String(ui.channelDisplayName({ kind: 'group', name: 'Gelöschtes Konto', members: [{ id: 1 }] })), 'Gelöschtes Konto');
        assert.match(String(ui.renderMessage({ id: 1, createdAt: new Date().toISOString(), text: 'Retained', author: { id: 2, username: '', displayName: 'Gelöschtes Konto' } }, 1)), /Deleted account/);
    }
    finally {
        ui.setLanguage('de');
    }
});
