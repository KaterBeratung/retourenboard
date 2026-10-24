import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import { runtimeFixture } from './helpers/runtime.js';
const rules = await import('../dist/server/return-rules.js').catch(() => ({}));
test('calendar deadline survives Berlin daylight saving and disabled rules', () => {
    assert.equal(typeof rules.dueDate, 'function');
    assert.equal(rules.dueDate('2026-10-24', 2), '2026-10-26');
    assert.equal(rules.dueDate('2026-03-28', 2), '2026-03-30');
    assert.equal(rules.dueDate('2026-10-24', 0), null);
    const r = { receiptDate: '2026-10-24', isClosed: false }, config = { deadlineDays: 2, timezone: 'Europe/Berlin' };
    assert.equal(rules.isOverdue(r, config, { now: () => Date.parse('2026-10-26T23:10:00Z') }), true);
    assert.equal(rules.isOverdue({ ...r, isClosed: true }, config, { now: () => Date.parse('2026-10-26T23:10:00Z') }), false);
});
test('return rules enforce required fields on saves and CSV without changing old numbers', async (t) => {
    const f = await runtimeFixture(t), { auth } = await f.setup();
    const p = await (await f.request('/api/products', 'POST', { sku: 'R1', name: 'Regelprodukt' }, auth)).json();
    const old = await (await f.request('/api/returns', 'POST', { productId: p.id, serialNumber: 'OLD', receiptDate: '2026-10-06' }, auth)).json();
    assert.match(old.returnNumber, /^RET-/);
    assert.equal((await f.request('/api/admin/rules', 'PUT', { requiredFields: ['orderNumber'], numberPrefix: 'TEST', deadlineDays: 14 }, auth)).status, 200);
    assert.equal((await f.request('/api/returns', 'POST', { productId: p.id, serialNumber: 'SN', receiptDate: '2026-10-06' }, auth)).status, 400);
    const preview = await (await f.request('/api/import/preview', 'POST', { kind: 'returns', text: 'SKU;SN\nR1;SN', mapping: { sku: 0, serialNumber: 1 } }, auth)).json();
    assert.equal(preview.errors.length, 1);
    const next = await (await f.request('/api/returns', 'POST', { productId: p.id, receiptDate: '2026-10-06', serialNumber: 'SN', orderNumber: 'ORDER' }, auth)).json();
    assert.match(next.returnNumber, /^TEST-/);
    assert.equal(next.dueDate, '2026-10-20');
    assert.equal((await (await f.request('/api/returns', 'GET', undefined, auth)).json()).find(r => r.id === old.id).returnNumber, old.returnNumber);
    for (const change of [{ deadlineDays: 366 }, { deadlineDays: -1 }, { numberPrefix: '' }, { numberPrefix: 'a'.repeat(17) }, { numberPrefix: 'bad prefix' }])
        assert.equal((await f.request('/api/admin/rules', 'PUT', change, auth)).status, 400);
});
