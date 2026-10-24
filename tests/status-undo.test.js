import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import { createStore } from './helpers/postgres-fixtures.js';
import { createAudit } from '../dist/server/audit.js';
import { createUsers } from '../dist/server/users.js';
import { createReturnWorkflow } from '../dist/server/return-workflow.js';
import { handleReturnWorkflowRoute } from '../dist/server/return-workflow-routes.js';
import { runtimeFixture, testPassword } from './helpers/runtime.js';
import { once } from 'node:events';
async function fixture(t) {
    const store = await createStore(':memory:');
    createUsers(store);
    const audit = createAudit(store);
    t.after(() => store.close());
    const user = { id: 7, role: 'member', displayName: 'Bearbeiter' }, actor = { id: user.id, name: user.displayName, source: 'user' };
    let now = Date.parse('2026-10-13T08:00:00Z');
    const workflow = createReturnWorkflow({ store, users: { list: () => [] }, now: () => now });
    const product = await store.createProduct({ name: 'Undo', sku: 'UNDO' }), create = async (input = {}) => store.createReturn({ productId: product.id, serialNumber: 'UNDO',resolutionId:17,...input });
    const run = async (job) => audit.wrap(actor, job);
    return { store, audit, user, workflow, create, run, advance: ms => now += ms };
}
const rejects = async (job, status) => assert.rejects(job, error => error.status === status);
test('bulk undo restores only changed rows once and appends status history', async (t) => {
    const f = await fixture(t), one = await f.create(), two = await f.create({ statusId: 13 });
    const changed = await f.run(async () => f.workflow.bulkStatus(f.user, { ids: [one.id, two.id], statusId: 13 }));
    assert.ok(changed.undo?.token, 'Changed status exposes a short-lived undo token');
    assert.equal(changed.undo.expiresAt, '2026-10-13T08:00:12.000Z');
    const result = await f.run(async () => f.workflow.undoStatus(f.user, { token: changed.undo.token }));
    assert.equal(result.updated, 1);
    assert.equal((await f.store.getReturn(one.id)).statusId, 12);
    assert.equal((await f.store.getReturn(two.id)).statusId, 13);
    const audit = (await f.store.db.query("SELECT actorId,changes FROM audit WHERE entity='returns' AND entityId=$1 AND action='update' ORDER BY id", [String(one.id)])).rows;
    assert.equal(audit.length, 2);
    assert.equal(audit[1].actorId, 7);
    assert.deepEqual(JSON.parse(audit[1].changes).statusId, { before: 13, after: 12 });
    await rejects(async () => f.workflow.undoStatus(f.user, { token: changed.undo.token }), 409);
    assert.equal((await f.run(async () => f.workflow.bulkStatus(f.user, { ids: [two.id], statusId: 13 }))).undo, null);
});
test('undo rejects another actor, revoked rights and expiry without consuming a valid owner token', async (t) => {
    const f = await fixture(t), row = await f.create(), changed = await f.run(async () => f.workflow.bulkStatus(f.user, { ids: [row.id], statusId: 13 }));
    assert.ok(changed.undo?.token, 'Changed status exposes undo');
    await rejects(async () => f.workflow.undoStatus({ ...f.user, id: 8 }, { token: changed.undo.token }), 403);
    await rejects(async () => f.workflow.undoStatus({ ...f.user, permissions: { returnsStatus: false } }, { token: changed.undo.token }), 403);
    f.advance(12000);
    await rejects(async () => f.workflow.undoStatus(f.user, { token: changed.undo.token }), 409);
    assert.equal((await f.store.getReturn(row.id)).statusId, 13);
});
test('bulk undo refuses all rows when one changed concurrently, even with an unchanged millisecond timestamp', async (t) => {
    const f = await fixture(t), one = await f.create(), two = await f.create(), changed = await f.run(async () => f.workflow.bulkStatus(f.user, { ids: [one.id, two.id], statusId: 13 }));
    assert.ok(changed.undo?.token, 'Changed status exposes undo');
    const at = (await f.store.getReturn(two.id)).updatedAt;
    await f.run(async () => f.store.updateReturn(two.id, { ...await f.store.getReturn(two.id), nextStep: 'Neue Information' }));
    await f.store.db.query("UPDATE returns SET updatedAt=$1 WHERE id=$2", [at, two.id]);
    await rejects(async () => f.run(async () => f.workflow.undoStatus(f.user, { token: changed.undo.token })), 409);
    assert.equal((await f.store.getReturn(one.id)).statusId, 13);
    assert.equal((await f.store.getReturn(two.id)).nextStep, 'Neue Information');
});
test('undo sees an intervening status round trip and rolls back a later SQLite failure', async (t) => {
    const f = await fixture(t), one = await f.create(), two = await f.create(), changed = await f.run(async () => f.workflow.bulkStatus(f.user, { ids: [one.id, two.id], statusId: 13 }));
    assert.ok(changed.undo?.token, 'Changed status exposes undo');
    const row = await f.store.getReturn(two.id);
    await f.run(async () => f.store.updateReturn(two.id, { ...row, statusId: 14 }));
    await f.run(async () => f.store.updateReturn(two.id, { ...await f.store.getReturn(two.id), statusId: 13 }));
    await f.store.db.query("UPDATE returns SET updatedAt=$1 WHERE id=$2", [row.updatedAt, two.id]);
    await rejects(async () => f.workflow.undoStatus(f.user, { token: changed.undo.token }), 409);
    const second = await f.run(async () => f.workflow.bulkStatus(f.user, { ids: [one.id, two.id], statusId: 15 })), count = (await f.store.db.query("SELECT COUNT(*) n FROM audit", [])).rows[0].n;
    const original = f.store.db.query;
    f.store.db.query = async function (sql, values) {
        if (/^UPDATE returns SET /i.test(sql) && values?.[3] === two.id)
            throw Error('undo test rollback');
        return original.call(this, sql, values);
    };
    await assert.rejects(async () => f.run(async () => f.workflow.undoStatus(f.user, { token: second.undo.token })), /rollback/);
    assert.equal((await f.store.getReturn(one.id)).statusId, 15);
    assert.equal((await f.store.db.query("SELECT COUNT(*) n FROM audit", [])).rows[0].n, count);
    f.store.db.query = original;
    assert.equal((await f.run(async () => f.workflow.undoStatus(f.user, { token: second.undo.token }))).updated, 2);
});
test('quick status route preserves row response, supports status name and offers the same undo endpoint', async (t) => {
    const f = await fixture(t), row = await f.create();
    let response;
    const base = { query: new URLSearchParams(), json: value => response = value, user: () => f.user, mutate: async (job) => f.run(job), workflow: f.workflow };
    assert.equal(await handleReturnWorkflowRoute({ ...base, path: `/api/returns/${row.id}/status`, method: 'PUT', body: async () => ({ status: 'In Prüfung',revision:row.revision }) }), true);
    assert.equal(response.id, row.id);
    assert.equal(response.statusId, 13);
    assert.ok(response.undo?.token);
    const token = response.undo.token;
    assert.equal(await handleReturnWorkflowRoute({ ...base, path: '/api/returns/status/undo', method: 'POST', body: async () => ({ token }) }), true);
    assert.equal(response.updated, 1);
    assert.equal((await f.store.getReturn(row.id)).statusId, 12);
});
test('completedAt comes from the last audited closing transition, never from an unrelated edit', async (t) => {
    const f = await fixture(t), closed = await f.create(), legacy = await f.create({ statusId: 15 });
    assert.equal(typeof f.workflow.enrichReturns, 'function', 'Completion date enrichment is available');
    await f.run(async () => f.store.updateReturn(closed.id, { ...closed, statusId: 15 }));
    await f.store.db.query("UPDATE audit SET createdAt='2026-10-10T10:00:00Z' WHERE entity='returns' AND entityId=$1 AND action='update'", [String(closed.id)]);
    await f.run(async () => f.store.updateReturn(closed.id, { ...await f.store.getReturn(closed.id), nextStep: 'Nur Notiz' },{allowClosedEdit:true}));
    await f.store.db.query("DELETE FROM audit WHERE entity='returns' AND entityId=$1", [String(legacy.id)]);
    const enriched = await f.workflow.enrichReturns(await f.store.listReturns());
    assert.equal(enriched.find(r => r.id === closed.id).completedAt, '2026-10-10T10:00:00Z');
    assert.equal(enriched.find(r => r.id === legacy.id).completedAt, null);
    await f.run(async () => f.store.updateReturn(closed.id, { ...await f.store.getReturn(closed.id), statusId: 12 },{allowReopen:true,reopenReason:'Timeline verification'}));
    assert.equal((await f.workflow.enrichReturns([await f.store.getReturn(closed.id)]))[0].completedAt, null);
});
test('historically imported closed returns do not acquire the import time as completion time', async (t) => {
    const f = await fixture(t), product = (await f.store.listProducts())[0];
    const imported = await f.store.createReturn({ productId: product.id, serialNumber: 'HISTORICAL',resolutionId:17,statusId: 15 }, { createdAt: '2020-01-01T08:00:00Z', updatedAt: '2020-01-04T08:00:00Z' });
    assert.equal((await f.workflow.enrichReturns([imported]))[0].completedAt, null);
});
test('completion enrichment uses a bounded number of queries for an entire inventory', async (t) => {
    const f = await fixture(t), rows = [];
    for (let i = 0; i < 100; i++)
        rows.push(await f.create());
    const original = f.store.db.query.bind(f.store.db);
    let queries = 0;
    f.store.db.query = (...args) => { queries++; return original(...args); };
    try {
        const result = await f.workflow.enrichReturns(rows);
        assert.equal(result.length, 100);
        assert.ok(result.every(row => row.completedAt === null));
        assert.ok(queries <= 3, 'Inventory enrichment must not run a query for each row');
    }
    finally {
        f.store.db.query = original;
    }
});
async function httpTeam(t) {
    const f = await runtimeFixture(t), { auth } = await f.setup();
    const member = await (await f.request('/api/users', 'POST', { username: 'UndoMember', role: 'member', password: testPassword, permissions: { returnsEdit: false, returnsStatus: true } }, auth)).json();
    const memberAuth = (await f.login('UndoMember')).auth;
    const product = await f.app.store.createProduct({ name: 'HTTP Undo', sku: 'HTTP-UNDO' }), row = await f.app.store.createReturn({ productId: product.id, serialNumber: 'HTTP-UNDO' });
    return { ...f, auth, member, memberAuth, row };
}
test('HTTP undo requires current authentication, CSRF, matching actor and status permission without edit permission', async (t) => {
    const f = await httpTeam(t), path = `/api/returns/${f.row.id}/status`;
    const changed = await f.request(path, 'PUT', { statusId: 13,revision:f.row.revision }, f.memberAuth);
    assert.equal(changed.status, 200);
    const result = await changed.json(), token = result.undo.token;
    assert.equal(result.id, f.row.id);
    assert.equal((await f.request('/api/returns/status/undo', 'POST', { token })).status, 401);
    assert.equal((await f.request('/api/returns/status/undo', 'POST', { token }, { ...f.memberAuth, 'X-CSRF-Token': 'wrong' })).status, 403);
    assert.equal((await f.request('/api/returns/status/undo', 'POST', { token }, f.auth)).status, 403);
    await f.app.users.update(f.member.id, { permissions: { returnsEdit: false, returnsStatus: false } });
    assert.equal((await f.request('/api/returns/status/undo', 'POST', { token }, f.memberAuth)).status, 403);
    await f.app.users.update(f.member.id, { permissions: { returnsEdit: false, returnsStatus: true } });
    const undo = await f.request('/api/returns/status/undo', 'POST', { token }, f.memberAuth);
    assert.equal(undo.status, 200);
    assert.equal((await undo.json()).items[0].statusId, 12);
    assert.equal((await f.request('/api/returns/status/undo', 'POST', { token }, f.memberAuth)).status, 409);
});
test('HTTP bulk undo refuses to overwrite any row after a concurrent edit and preserves audit history', async (t) => {
    const f = await httpTeam(t), two = await f.app.store.createReturn({ productId: f.row.productId, serialNumber: 'HTTP-TWO' });
    const changed = await f.request('/api/returns/bulk/status', 'POST', { ids: [f.row.id, two.id], statusId: 13,revisions:{[f.row.id]:f.row.revision,[two.id]:two.revision} }, f.memberAuth);
    assert.equal(changed.status, 200);
    const result = await changed.json();
    await f.app.store.updateReturn(two.id, { ...await f.app.store.getReturn(two.id), nextStep: 'Concurrent note' });
    const count = (await f.app.store.db.query("SELECT COUNT(*) AS n FROM audit", [])).rows[0].n;
    const undo = await f.request('/api/returns/status/undo', 'POST', { token: result.undo.token }, f.memberAuth);
    assert.equal(undo.status, 409);
    assert.equal((await f.app.store.getReturn(f.row.id)).statusId, 13);
    assert.equal((await f.app.store.getReturn(two.id)).nextStep, 'Concurrent note');
    assert.equal((await f.app.store.db.query("SELECT COUNT(*) AS n FROM audit", [])).rows[0].n, count);
});
test('queued HTTP undo rechecks permission revocation at the write boundary', async (t) => {
    const f = await httpTeam(t), result = await (await f.request(`/api/returns/${f.row.id}/status`, 'PUT', { statusId: 13,revision:f.row.revision }, f.memberAuth)).json();
    let unblock, entered;
    const waiting = new Promise(resolve => entered = resolve), blocked = f.app.coordinator.run(() => new Promise(resolve => { unblock = resolve; entered(); }));
    await waiting;
    const arrived = once(f.app.server, 'request'), pending = f.request('/api/returns/status/undo', 'POST', { token: result.undo.token }, f.memberAuth);
    await arrived;
    await f.app.users.update(f.member.id, { permissions: { returnsStatus: false } });
    unblock();
    await blocked;
    assert.equal((await pending).status, 403);
    assert.equal((await f.app.store.getReturn(f.row.id)).statusId, 13);
});
