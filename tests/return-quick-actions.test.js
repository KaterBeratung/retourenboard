import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import { runtimeFixture } from './helpers/runtime.js';
const actions = await import('../dist/public/quick-actions.js').catch(() => ({}));
test('product search and shortcut modules are served only after authentication', async (t) => {
    const { request, setup } = await runtimeFixture(t), { auth } = await setup();
    for (const path of ['/product-picker.js', '/quick-actions.js', '/presentation.js']) {
        assert.equal((await request(path)).status, 401, path + ' anonymous');
        const response = await request(path, 'GET', undefined, auth);
        assert.equal(response.status, 200, path + ' signed in');
        assert.match(response.headers.get('content-type'), /javascript/);
        assert.match(response.headers.get('cache-control'), /private.*no-store/);
    }
});
test('return quick actions expose status changes only to permitted accounts', () => {
    assert.equal(typeof actions.returnQuickActions, 'function');
    const row = { id: 9, returnNumber: 'RET-009' };
    assert.match(String(actions.returnQuickActions({ can: () => true }, row)), /data-quick-status="9"/);
    const readOnly = String(actions.returnQuickActions({ can: () => false }, row));
    assert.doesNotMatch(readOnly, /data-quick-status/);
    assert.match(readOnly, /data-copy-return="9"/);
    assert.match(readOnly, /data-detail="returns"/);
});
test('quick action handlers recheck permissions and resolve the current row before a status change', async () => {
    assert.equal(typeof actions.bindQuickActions, 'function');
    const status = { dataset: { quickStatus: '9' } }, copy = { dataset: { copyReturn: '9' } }, create = { dataset: { returnProduct: '3' } };
    const root = { querySelectorAll: s => s === '[data-quick-status]' ? [status] : s === '[data-copy-return]' ? [copy] : s === '[data-return-product]' ? [create] : [] };
    let permitted = false;
    const calls = [];
    const ctx = { can: () => permitted, ensureUnlocked: fn => fn(), products: [{ id: 3, active: false }], toast: () => { } };
    const rows = () => [{ id: 9, returnNumber: 'RET-009' }];
    actions.bindQuickActions(ctx, root, rows, { status: (_, row) => calls.push(row.id), create: (_, row) => calls.push(row.productId) });
    await status.onclick();
    assert.deepEqual(calls, []);
    permitted = true;
    await status.onclick();
    assert.deepEqual(calls, [9]);
    await create.onclick();
    assert.deepEqual(calls, [9], 'Archived products cannot seed new returns');
    ctx.products[0].active = true;
    await create.onclick();
    assert.deepEqual(calls, [9, 3]);
});
test('copy action falls back to a temporary selection on HTTP and restores the previous focus', async (t) => {
    assert.equal(typeof actions.copyText, 'function');
    const old = { document: globalThis.document, navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator') };
    const focused = { focus() { this.restored = true; } }, area = { style: {}, setAttribute() { }, focus() { }, select() { this.selected = true; }, remove() { this.removed = true; } };
    globalThis.document = { activeElement: focused, body: { append(node) { assert.equal(node, area); } }, createElement: () => area, execCommand: command => command === 'copy' };
    Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
    t.after(() => {
        if (old.document === undefined)
            delete globalThis.document;
        else
            globalThis.document = old.document;
        if (old.navigator)
            Object.defineProperty(globalThis, 'navigator', old.navigator);
        else
            delete globalThis.navigator;
    });
    await actions.copyText('RET-009');
    assert.equal(area.value, 'RET-009');
    assert.ok(area.selected && area.removed && focused.restored);
});
test('a product shortcut retains its supplier only while the supplier is active', async () => {
    const create = { dataset: { returnProduct: '3' } }, root = { querySelectorAll: s => s === '[data-return-product]' ? [create] : [] };
    const seeds = [], supplier = { id: 21, active: false };
    const ctx = { can: () => true, ensureUnlocked: fn => fn(), products: [{ id: 3, active: true, supplierId: 21 }], masterdata: { suppliers: [supplier] } };
    actions.bindQuickActions(ctx, root, () => [], { status() { }, create: (_, item) => seeds.push(item) });
    await create.onclick();
    assert.deepEqual(seeds[0], { productId: 3, supplierId: undefined });
    supplier.active = true;
    await create.onclick();
    assert.deepEqual(seeds[1], { productId: 3, supplierId: 21 });
});
test('serial number shortcut is available to readers and disabled without a serial number', () => {
    const markup = String(actions.returnQuickActions({ can: () => false }, { id: 9, returnNumber: 'RET-009', serialNumber: 'SN-ABC-9' }));
    assert.match(markup, /data-copy-serial="9"/);
    assert.match(markup, /aria-label="Seriennummer kopieren"/);
    assert.doesNotMatch(markup, /data-copy-serial="9"[^>]*disabled/);
    const empty = String(actions.returnQuickActions({ can: () => false }, { id: 10, returnNumber: 'RET-010', serialNumber: '' }));
    assert.match(empty, /data-copy-serial="10"[^>]*disabled/);
});
test('serial copy resolves the latest record, copies its serial rather than its return number and ignores missing values', async (t) => {
    const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator'), copied = [], toasts = [];
    Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText: async (value) => copied.push(value) } }, configurable: true });
    t.after(() => {
        if (oldNavigator)
            Object.defineProperty(globalThis, 'navigator', oldNavigator);
        else
            delete globalThis.navigator;
    });
    const serial = { dataset: { copySerial: '9' } }, root = { querySelectorAll: s => s === '[data-copy-serial]' ? [serial] : [] };
    let current = { id: 9, returnNumber: 'RET-009', serialNumber: 'SN-OLD' };
    actions.bindQuickActions({ toast: value => toasts.push(String(value)) }, root, () => current ? [current] : [], { status() { }, create() { } });
    assert.equal(typeof serial.onclick, 'function');
    current = { ...current, serialNumber: 'SN-CURRENT' };
    await serial.onclick();
    assert.deepEqual(copied, ['SN-CURRENT']);
    assert.deepEqual(toasts, ['Seriennummer kopiert.']);
    current.serialNumber = '';
    await serial.onclick();
    current = undefined;
    await serial.onclick();
    assert.deepEqual(copied, ['SN-CURRENT']);
    assert.equal(toasts.length, 1);
});
