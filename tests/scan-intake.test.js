import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import { sourceModule } from './helpers/source-module.js';
import { runtimeFixture } from './helpers/runtime.js';
const intake = await sourceModule("export * from './frontend/src/scan-intake.ts'; export {setLanguage} from './frontend/src/i18n.js'; export {observeForm,refreshFormState} from './frontend/src/unsaved.js'; export {parseDesignRoute,internalNavigationUrl} from './frontend/src/design.ts'; import {addTranslations} from './frontend/src/i18n.js'; import {english} from './frontend/src/i18n-catalog.js'; addTranslations(english);").catch(() => ({}));
function context(extra = {}) { return { authGeneration: 1, unlocked: true, session: { user: { id: 7 }, csrfToken: 'session' }, can: key => key === 'returnsCreate', products: [{ id: 1, name: 'Selected product', sku: 'P-1', active: true, supplierId: 21 }], returns: [], masterdata: { suppliers: [{ id: 21, name: 'Supplier', active: true }], reasons: [{ id: 3, name: 'Reason', active: true, isDefault: true }], conditions: [{ id: 4, name: 'Condition', active: true, isDefault: true }], statuses: [{ id: 5, name: 'Status', active: true, isDefault: true }], resolutions: [{ id: 6, name: 'Resolution', active: true, isDefault: true }] }, config: { rules: { requiredFields: [], timezone: 'Europe/Berlin' } }, ...extra }; }
function setup(extra = {}) { assert.equal(typeof intake.createSerialQueue, 'function'); const ctx = context(extra), queue = intake.createSerialQueue(); return { ctx, queue }; }
test('serial collection preserves punctuation and case, rejects overlong codes and deduplicates repeated scans', () => {
    const { queue } = setup();
    const result = queue.add(['SN-Ab.01/9', 'SN-Ab.01/9', 'sn-ab.01/9', 'X'.repeat(251), 'SN-02\nSN-03']);
    assert.equal(result.added, 1);
    assert.equal(result.duplicates, 2);
    assert.equal(result.invalid, 2);
    assert.equal(queue.rows()[0].serialNumber, 'SN-Ab.01/9');
    const pasted = queue.addText('SN-02\r\nSN-03\n\n SN-04 ');
    assert.equal(pasted.added, 3);
    assert.deepEqual(queue.rows().map(row => row.serialNumber), ['SN-Ab.01/9', 'SN-02', 'SN-03', 'SN-04']);
    assert.equal(queue.add(['X'.repeat(250)]).added, 1);
    assert.equal(queue.rows().at(-1).serialNumber.length, 250);
});
test('existing serials require individual acknowledgment before inclusion; repeat-return values remain exact', () => {
    const { ctx, queue } = setup({ returns: [{ id: 91, serialNumber: 'SN-OLD', returnNumber: 'RET-91' }] });
    queue.add(['SN-NEW', 'SN-OLD'], ctx.returns);
    assert.deepEqual(queue.rows().map(row => row.selected), [true, false]);
    assert.equal(queue.select(queue.rows()[1].key, true), false);
    queue.acknowledge(queue.rows()[1].key, true);
    assert.equal(queue.rows()[1].selected, true);
    const plan = intake.prepareIntakeBatch(ctx, queue, { productId: '1' });
    assert.equal(plan.items.length, 2);
    assert.equal(plan.items[1].body.serialNumber, 'SN-OLD');
    assert.equal(plan.items[1].body.quantity, 1);
});
test('batch payloads use active product and configured master defaults and honor required shared fields', () => {
    const { ctx, queue } = setup({ config: { rules: { requiredFields: ['supplier', 'orderNumber', 'notes'], timezone: 'Europe/Berlin' } } });
    queue.add(['SN-1']);
    assert.throws(() => intake.prepareIntakeBatch(ctx, queue, { productId: '1' }), /Bestellnummer/);
    const plan = intake.prepareIntakeBatch(ctx, queue, { productId: '1', orderNumber: 'ORDER-1', notes: 'Checked', receiptDate: '2026-10-13', customerReference: 'CUSTOMER', trackingNumber: '000123456789' });
    assert.deepEqual(plan.items[0].body, { productId: 1, quantity: 1, receiptDate: '2026-10-13', returnNumber: '', serialNumber: 'SN-1', replacementSerialNumber: '', orderNumber: 'ORDER-1', customerReference: 'CUSTOMER', trackingNumber: '000123456789', reason: 'Reason', condition: 'Condition', status: 'Status', resolution: 'Resolution', notes: 'Checked', assignedUserId: null, nextStep: '', supplier: 'Supplier', supplierId: 21, reasonId: 3, conditionId: 4, statusId: 5, resolutionId: 6 });
    assert.throws(() => intake.prepareIntakeBatch(ctx, queue, { productId: '1', supplierId: '999', orderNumber: 'ORDER', notes: 'Checked' }), /Lieferant/);
    assert.throws(() => intake.prepareIntakeBatch(ctx, queue, { productId: '1', receiptDate: '2026-02-30', orderNumber: 'ORDER', notes: 'Checked' }), /Eingangsdatum/);
    ctx.products[0].active = false;
    assert.throws(() => intake.prepareIntakeBatch(ctx, queue, { productId: '1', orderNumber: 'ORDER', notes: 'Checked' }), /Produkt/);
});
test('partial failures retry only failed selected devices and never repeat a successful creation', async () => {
    const calls = [], { ctx, queue } = setup({ api: async (path, options) => {
            calls.push([path, options.body.serialNumber]);
            if (options.body.serialNumber === 'SN-2' && calls.length === 2)
                throw Object.assign(Error('Rejected'), { status: 400 });
            return { id: calls.length, returnNumber: 'RET-' + calls.length };
        } });
    queue.add(['SN-1', 'SN-2', 'SN-3']);
    const controller = intake.createIntakeController(ctx, queue);
    await controller.create(intake.prepareIntakeBatch(ctx, queue, { productId: '1' }));
    assert.deepEqual(queue.rows().map(row => row.state), ['created', 'failed', 'created']);
    await controller.create(intake.prepareIntakeBatch(ctx, queue, { productId: '1' }, { onlyFailed: true }));
    assert.deepEqual(calls.map(call => call[1]), ['SN-1', 'SN-2', 'SN-3', 'SN-2']);
    assert.equal(queue.rows().every(row => row.state === 'created'), true);
});
test('concurrent creation is blocked, uncertain writes are held for checking, and stale auth cannot start further requests', async () => {
    let finish;
    const calls = [], { ctx, queue } = setup({ api: async (path, options) => {
            calls.push(options.body.serialNumber);
            if (calls.length === 1)
                return new Promise(resolve => finish = resolve);
            throw Error('Connection lost');
        } });
    queue.add(['SN-1', 'SN-2', 'SN-3']);
    const controller = intake.createIntakeController(ctx, queue), plan = intake.prepareIntakeBatch(ctx, queue, { productId: '1' }), pending = controller.create(plan);
    await controller.create(plan);
    assert.deepEqual(calls, ['SN-1']);
    assert.equal(queue.add(['LATE']).added, 0);
    finish({ id: 91 });
    await pending;
    assert.deepEqual(queue.rows().map(row => row.state), ['created', 'uncertain', 'pending']);
    assert.deepEqual(calls, ['SN-1', 'SN-2']);
    assert.throws(() => intake.prepareIntakeBatch(ctx, queue, { productId: '1' }, { onlyFailed: true }), /auswählen/);
    ctx.authGeneration++;
    await controller.create(plan);
    assert.equal(calls.length, 2);
});
test('newly discovered existing returns require review again; discarding a running queue stops later requests', async () => {
    const { ctx, queue } = setup();
    queue.add(['SN-1', 'SN-2']);
    ctx.returns = [{ id: 91, serialNumber: 'SN-1' }];
    queue.reviewExisting(ctx.returns);
    assert.equal(queue.rows()[0].selected, false);
    queue.acknowledge(queue.rows()[0].key, true);
    let finish, calls = 0;
    ctx.api = () => { calls++; return new Promise(resolve => finish = resolve); };
    const controller = intake.createIntakeController(ctx, queue), pending = controller.create(intake.prepareIntakeBatch(ctx, queue, { productId: '1' }));
    queue.discard();
    finish({ id: 92 });
    await pending;
    assert.equal(calls, 1);
    assert.equal(queue.rows().length, 0);
});
test('scan-intake routes remain in the mounted shell and page controls translate without changing serial data', () => {
    assert.deepEqual(intake.parseDesignRoute('#scan-intake'), { view: 'scan-intake', scope: '' });
    assert.equal(intake.internalNavigationUrl('#scan-intake', 'http://example.test/admin'), '/#scan-intake');
    const { ctx } = setup();
    assert.match(String(intake.renderScanIntake(ctx)), /Scan-Erfassung/);
    intake.setLanguage('en');
    try {
        assert.match(String(intake.renderScanIntake(ctx)), /Scan intake/);
        assert.match(String(intake.renderScanIntake(ctx)), /Create one return for each selected serial number/);
    }
    finally {
        intake.setLanguage('de');
    }
});
test('serial collection remains bounded and forged references or revoked creation rights cannot prepare a request', () => {
    const { ctx, queue } = setup();
    assert.equal(queue.add(Array.from({ length: 501 }, (_, i) => 'SN-' + i)).added, 500);
    assert.equal(queue.rows().length, 500);
    assert.equal(queue.add(['EXTRA']).full, 1);
    for (const key of ['reasonId', 'conditionId', 'statusId', 'resolutionId'])
        assert.throws(() => intake.prepareIntakeBatch(ctx, queue, { productId: '1', [key]: '999' }));
    ctx.can = () => false;
    assert.throws(() => intake.prepareIntakeBatch(ctx, queue, { productId: '1' }), /Berechtigung/);
});
test('account changes, CSRF rotation and permission revocation during an API write stop subsequent devices', async () => {
    for (const change of [ctx => ctx.session.user.id = 8, ctx => ctx.session.csrfToken = 'other', ctx => ctx.can = () => false]) {
        let finish, calls = 0;
        const { ctx, queue } = setup({ api: () => { calls++; return new Promise(resolve => finish = resolve); } });
        queue.add(['PRIVATE-1', 'PRIVATE-2']);
        const controller = intake.createIntakeController(ctx, queue), pending = controller.create(intake.prepareIntakeBatch(ctx, queue, { productId: '1' }));
        change(ctx);
        finish({ id: 91 });
        await pending;
        assert.equal(calls, 1);
        assert.equal(queue.busy, false);
    }
});
test('completion notifies the current page binding after the starting page was left, without starting more devices', async () => {
    let finish, visible = true, finishedPaints = 0, calls = 0;
    const { ctx, queue } = setup({ api: () => { calls++; return new Promise(resolve => finish = resolve); } });
    queue.add(['SN-1', 'SN-2']);
    const controller = intake.createIntakeController(ctx, queue, { isCurrent: () => visible, onChange: () => {
            if (!queue.busy)
                finishedPaints++;
        } }), pending = controller.create(intake.prepareIntakeBatch(ctx, queue, { productId: '1' }));
    visible = false;
    finish({ id: 91 });
    await pending;
    assert.equal(calls, 1);
    assert.equal(queue.rows()[0].state, 'created');
    assert.equal(finishedPaints, 1);
});
test('intake payloads create individual returns through the existing authenticated API without duplicating catalogue products', async (t) => {
    const { request, setup: setupServer } = await runtimeFixture(t), { auth } = await setupServer();
    const productResponse = await request('/api/products', 'POST', { name: 'Intake product', sku: 'INTAKE-1', active: true }, auth);
    assert.equal(productResponse.status, 201);
    const product = await productResponse.json();
    const masterdata = await (await request('/api/masterdata', 'GET', undefined, auth)).json(), ctx = context({ products: [product], masterdata, api: async (path, options) => {
            const response = await request(path, options.method, options.body, auth), result = await response.json();
            if (!response.ok)
                throw Object.assign(Error(result.error), { status: response.status });
            return result;
        } }), queue = intake.createSerialQueue();
    queue.add(['SN-Ab.1/2', 'SN-Ab.2/2']);
    await intake.createIntakeController(ctx, queue).create(intake.prepareIntakeBatch(ctx, queue, { productId: String(product.id), receiptDate: '2026-10-13' }));
    const rows = await (await request('/api/returns', 'GET', undefined, auth)).json(), products = await (await request('/api/products', 'GET', undefined, auth)).json();
    assert.equal(products.length, 1);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map(row => row.serialNumber).sort(), ['SN-Ab.1/2', 'SN-Ab.2/2']);
    assert.equal(rows.every(row => row.productId === product.id && row.quantity === 1 && row.receiptDate === '2026-10-13'), true);
    assert.equal(queue.rows().every(row => row.state === 'created'), true);
});
// Replace the DOM boundary while retaining the production binder and real
// FormData comparison. Queue checkboxes have no names in the browser either.
function intakeFormBoundary(t, queueRows = []) {
    const previous = { document: globalThis.document, FormData: globalThis.FormData };
    const node = (value = '') => ({ value, dataset: {}, hidden: false, disabled: false, textContent: '', attrs: {}, handlers: {}, setAttribute(key, value) { this.attrs[key] = value; }, removeAttribute(key) { delete this.attrs[key]; }, addEventListener(type, fn) { (this.handlers[type] ??= []).push(fn); }, emit(type, event = { target: this }) {
            for (const fn of this.handlers[type] ?? [])
                fn(event);
        }, setCustomValidity(message) { this.customValidity = String(message); }, querySelectorAll: () => [], closest: () => null, replaceChildren(...options) { this.options = options; this.value = options.find(option => option.selected)?.value ?? options[0]?.value ?? ''; } });
    const controls = Object.fromEntries(Object.entries({ intakeQueue: JSON.stringify(queueRows), productId: '1', supplierId: '21', reasonId: '3', conditionId: '4', statusId: '5', resolutionId: '6', receiptDate: '2026-10-13', orderNumber: '', customerReference: '', notes: '', intakeSingle: '', intakePaste: '' }).map(([name, value]) => [name, { ...node(value), name }]));
    const elements = {}, aliases = { '[data-intake-queue-value]': 'intakeQueue', '[data-intake-single]': 'intakeSingle', '[data-intake-paste]': 'intakePaste' };
    const form = { ...node(), isConnected: true, dataset: { unsavedNotice: 'hidden' }, controls: Object.values(controls), closest: () => null, reportValidity: () => Object.values(controls).every(control => !control.customValidity), querySelector(selector) {
            if (selector === '[data-product-picker]')
                return null;
            if (selector.startsWith('[name='))
                return controls[selector.slice(6, -1)] ?? null;
            if (aliases[selector])
                return controls[aliases[selector]];
            return elements[selector] ??= node();
        }, querySelectorAll: () => [] };
    globalThis.document = { createElement: () => node() };
    globalThis.FormData = class {
        constructor(form) { this.values = form.controls.filter(control => !control.disabled).map(control => [control.name, control.value]); }
        [Symbol.iterator]() { return this.values[Symbol.iterator](); }
    };
    t.after(() => {
        for (const key of ['document', 'FormData'])
            if (previous[key] === undefined)
                delete globalThis[key];
            else
                globalThis[key] = previous[key];
    });
    return { form, controls, elements, root: { querySelector: selector => selector === '[data-intake-form]' ? form : null } };
}
for (const state of ['pending', 'failed', 'uncertain'])
    test(`a remounted ${state} intake queue stays unsaved through native value comparisons and clears after discard`, t => {
        const ctx = context(), initial = intakeFormBoundary(t), first = intake.bindScanIntake(ctx, initial.root, { openScanner() { } });
        first.queue.add(['SN-PENDING']);
        first.queue.update(first.queue.rows()[0].key, { state });
        initial.form.isConnected = false;
        const remounted = intakeFormBoundary(t, first.queue.rows());
        intake.bindScanIntake(ctx, remounted.root, { openScanner() { } });
        intake.observeForm(remounted.form);
        intake.refreshFormState(remounted.form);
        assert.equal(remounted.form.dataset.dirty, 'true');
        remounted.controls.notes.value = 'Temporary';
        intake.refreshFormState(remounted.form);
        remounted.controls.notes.value = '';
        intake.refreshFormState(remounted.form);
        assert.equal(remounted.form.dataset.dirty, 'true');
        remounted.elements['[data-intake-clear]'].onclick();
        intake.refreshFormState(remounted.form);
        assert.equal(remounted.form.dataset.dirty, 'false');
        remounted.controls.notes.value = 'New note';
        intake.refreshFormState(remounted.form);
        assert.equal(remounted.form.dataset.dirty, 'true');
        remounted.controls.notes.value = '';
        intake.refreshFormState(remounted.form);
        assert.equal(remounted.form.dataset.dirty, 'false');
    });
test('inventory refresh exposes new active reference choices while preserving a now invalid selection and the serial queue', async (t) => {
    const ctx = context(), boundary = intakeFormBoundary(t);
    boundary.controls.statusId.options = [{ value: '5', textContent: 'Old status', selected: true }];
    ctx.ensureInventory = async () => { ctx.masterdata.statuses = [{ id: 5, name: 'Old status', active: false }, { id: 7, name: 'New status', active: true, isDefault: true }]; };
    const bound = intake.bindScanIntake(ctx, boundary.root, { openScanner() { } });
    bound.queue.add(['SN-KEEP']);
    boundary.form.onsubmit({ preventDefault() { } });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(boundary.controls.statusId.options.some(option => option.value === '7' && !option.disabled), true);
    assert.equal(boundary.controls.statusId.value, '5');
    assert.ok(boundary.controls.statusId.customValidity);
    assert.equal(bound.queue.rows()[0].serialNumber, 'SN-KEEP');
    boundary.controls.statusId.value = '7';
    boundary.controls.statusId.emit('change');
    boundary.form.emit('change', { target: boundary.controls.statusId });
    assert.equal(boundary.controls.statusId.customValidity, '');
    assert.equal(intake.prepareIntakeBatch(ctx, bound.queue, { productId: '1', statusId: '7' }).items[0].body.statusId, 7);
});

test('scan status choices follow the same process order as a single return',()=>{
 const ctx=context();ctx.masterdata.statuses=[{id:8,name:'Closed',active:true,isClosed:true,statusTone:'done',tone:'done'},{id:7,name:'Working',active:true,isClosed:false,tone:'working'},{id:5,name:'Received',active:true,isDefault:true,isClosed:false,tone:'received'},{id:6,name:'Checking',active:true,isClosed:false,tone:'checking'}];
 const markup=String(intake.renderScanIntake(ctx)),options=markup.match(/<select name="statusId"[\s\S]*?<\/select>/)[0];assert.ok(options.indexOf('Received')<options.indexOf('Checking'));assert.ok(options.indexOf('Checking')<options.indexOf('Working'));assert.ok(options.indexOf('Working')<options.indexOf('Closed'));
});
