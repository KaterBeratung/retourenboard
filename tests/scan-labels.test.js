import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import QRCode from 'qrcode';
import { PNG } from 'pngjs';
import { BinaryBitmap, HybridBinarizer, RGBLuminanceSource } from '@zxing/library';
import { setLanguage } from '../dist/public/i18n.js';
import { runtimeFixture, testPassword } from './helpers/runtime.js';
const scanner = await import('../dist/public/scan-labels.js').catch(() => ({}));
const labels = await import('../dist/server/return-labels.js').catch(() => ({}));
test('scanned values preserve leading zeroes and treat links as plain search text', () => {
    assert.equal(typeof scanner.normalizeScannedValue, 'function');
    for (const [input, expected] of [[' 0012345678905\r\n', '0012345678905'], ['SN-Ä-01', 'SN-Ä-01'], ['https://example.org/?q=<script>', 'https://example.org/?q=<script>']])
        assert.equal(scanner.normalizeScannedValue(input), expected);
    for (const value of ['', 42, null, 'x'.repeat(501), 'SN\u0000x', 'SN\nx'])
        assert.equal(scanner.normalizeScannedValue(value), null);
});
function qrBitmap(value) {
    const qr = QRCode.create(value, { errorCorrectionLevel: 'M' }), scale = 5, margin = 4, width = (qr.modules.size + margin * 2) * scale;
    const pixels = new Uint8ClampedArray(width * width).fill(255);
    for (let y = 0; y < qr.modules.size; y++)
        for (let x = 0; x < qr.modules.size; x++)
            if (qr.modules.get(y, x))
                for (let dy = 0; dy < scale; dy++)
                    for (let dx = 0; dx < scale; dx++)
                        pixels[((y + margin) * scale + dy) * width + (x + margin) * scale + dx] = 0;
    return new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels, width, width)));
}
function eanBitmap() {
    // Independent EAN-13 fixture for 4006381333931; L/G parity for first digit 4.
    const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
    const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
    const digits = '4006381333931', parity = 'LGLLGG';
    const bits = '00000000000' + '101' + [...digits.slice(1, 7)].map((d, i) => (parity[i] === 'L' ? L : G)[+d]).join('') + '01010' + [...digits.slice(7)].map(d => L[+d].replace(/[01]/g, b => b === '0' ? '1' : '0')).join('') + '101' + '00000000000';
    const scale = 3, width = bits.length * scale, height = 90, pixels = new Uint8ClampedArray(width * height).fill(255);
    for (let y = 8; y < height - 8; y++)
        for (let x = 0; x < width; x++)
            if (bits[Math.floor(x / scale)] === '1')
                pixels[y * width + x] = 0;
    return new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels, width, height)));
}
function pngBitmap(dataUrl) {
    const png = PNG.sync.read(Buffer.from(dataUrl.split(',')[1], 'base64')), pixels = new Uint8ClampedArray(png.width * png.height);
    for (let i = 0; i < pixels.length; i++)
        pixels[i] = (png.data[i * 4] + 2 * png.data[i * 4 + 1] + png.data[i * 4 + 2]) / 4;
    return new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels, png.width, png.height)));
}
test('local decoder reads real QR and EAN-13 pixels without BarcodeDetector', () => {
    assert.equal(typeof scanner.createBarcodeReader, 'function');
    assert.equal(scanner.createBarcodeReader().decodeBitmap(qrBitmap('RET-2026-0049')).getText(), 'RET-2026-0049');
    assert.equal(scanner.createBarcodeReader().decodeBitmap(eanBitmap()).getText(), '4006381333931');
});
test('camera requests only start explicitly and stop tracks when permission resolves after cancellation', async () => {
    assert.equal(typeof scanner.createScanSession, 'function');
    let resolveStream, calls = 0, stops = 0, decoded = 0;
    const stream = { getTracks: () => [{ stop() { stops++; } }] }, video = { srcObject: null, pause() { } };
    const session = scanner.createScanSession({ video, mediaDevices: { getUserMedia() { calls++; return new Promise(resolve => resolveStream = resolve); } }, reader: { decodeFromStream() { decoded++; } }, onValue() { }, onError() { } });
    assert.equal(calls, 0);
    const starting = session.start();
    assert.equal(calls, 1);
    session.stop();
    resolveStream(stream);
    await starting;
    assert.equal(decoded, 0);
    assert.equal(stops, 1);
    assert.equal(video.srcObject, null);
});
test('camera scan stops its reader and stream before delivering one result and ignores later callbacks', async () => {
    assert.equal(typeof scanner.createScanSession, 'function');
    let callback, readerStops = 0, trackStops = 0;
    const values = [];
    const session = scanner.createScanSession({ video: { srcObject: null, pause() { } }, mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop() { trackStops++; } }] }) }, reader: { async decodeFromStream(stream, video, fn) { callback = fn; return { stop() { readerStops++; } }; } }, onValue(value) { assert.ok(readerStops && trackStops); values.push(value); }, onError() { } });
    await session.start();
    callback({ getText: () => ' 0012345678905 ' }, undefined, { stop() { readerStops++; } });
    assert.deepEqual(values, []);
    callback({ getText: () => ' 0012345678905 ' }, undefined, { stop() { readerStops++; } });
    callback({ getText: () => 'SECOND' });
    assert.deepEqual(values, ['0012345678905']);
    assert.ok(trackStops);
    assert.ok(readerStops);
});
test('camera denial leaves a retryable session and reports the error', async () => {
    assert.equal(typeof scanner.createScanSession, 'function');
    const errors = [];
    let requests = 0;
    const session = scanner.createScanSession({ video: { srcObject: null, pause() { } }, mediaDevices: { getUserMedia: async () => { requests++; throw Object.assign(new Error('denied'), { name: 'NotAllowedError' }); } }, reader: {}, onValue() { }, onError: error => errors.push(error.name) });
    await session.start();
    await session.start();
    assert.equal(requests, 2);
    assert.deepEqual(errors, ['NotAllowedError', 'NotAllowedError']);
    session.stop();
});
test('decoder controls arriving after close are stopped and cannot deliver a stale result', async () => {
    let controlsReady, callback, stops = 0;
    const values = [];
    const session = scanner.createScanSession({ video: { srcObject: null, pause() { } }, mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop() { stops++; } }] }) }, reader: { decodeFromStream(stream, video, fn) { callback = fn; return new Promise(resolve => controlsReady = resolve); } }, onValue: value => values.push(value), onError() { } });
    const pending = session.start();
    await Promise.resolve();
    session.stop();
    controlsReady({ stop() { stops++; } });
    await pending;
    callback({ getText: () => 'STALE' });
    assert.ok(stops >= 2);
    assert.deepEqual(values, []);
});
// Native dialog/media APIs are the boundary; controller code stays real.
function scannerDom(t) {
    const listeners = {}, nodes = {};
    for (const name of ['video', 'value', 'status', 'start', 'stop', 'camera-idle', 'close', 'use', 'photo'])
        nodes[`[data-scan-${name}]`] = { value: '', hidden: false, disabled: false, srcObject: null, pause() { }, focus() { this.focused = true; }, addEventListener(event, fn) { this[event] = fn; } };
    const dialog = { open: false, attrs: {}, events: {}, classList: { add() { }, remove() { } }, setAttribute(key, value) { this.attrs[key] = value; }, querySelector(selector) { return nodes[selector]; }, querySelectorAll() { return []; }, showModal() { this.open = true; }, close() { this.open = false; this.events.close?.(); }, remove() { this.removed = true; }, addEventListener(event, fn) { this.events[event] = fn; } };
    const old = { document: globalThis.document, window: globalThis.window, navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'), secure: globalThis.isSecureContext };
    globalThis.document = { createElement: () => dialog, body: { append() { } }, addEventListener(event, fn) { listeners[event] = fn; }, removeEventListener() { }, hidden: false };
    globalThis.window = { addEventListener(event, fn) { listeners[event] = fn; }, removeEventListener() { } };
    Object.defineProperty(globalThis, 'navigator', { value: { mediaDevices: { getUserMedia: async () => { throw new Error('camera must not start automatically'); } } }, configurable: true });
    globalThis.isSecureContext = true;
    t.after(() => {
        scanner.stopScanner();
        globalThis.document = old.document;
        globalThis.window = old.window;
        globalThis.isSecureContext = old.secure;
        if (old.navigator)
            Object.defineProperty(globalThis, 'navigator', old.navigator);
        else
            delete globalThis.navigator;
    });
    return { dialog, nodes, listeners };
}
test('manual and USB entry uses a separate dialog and navigation cancels its controller', async (t) => {
    const d = scannerDom(t), values = [], ctx = { unlocked: true, authGeneration: 1, session: { user: { id: 1 } } };
    assert.equal(scanner.openScanner(ctx, { onScan: value => values.push(value) }), d.dialog);
    assert.equal(d.dialog.open, true);
    d.nodes['[data-scan-value]'].value = ' 0012345678905 ';
    d.nodes['[data-scan-value]'].keydown({ key: 'Enter', preventDefault() { } });
    await Promise.resolve();
    assert.deepEqual(values, ['0012345678905']);
    assert.equal(d.dialog.removed, true);
    scanner.openScanner(ctx, { onScan: value => values.push(value) });
    d.listeners.popstate();
    assert.equal(d.dialog.open, false);
    assert.deepEqual(values, ['0012345678905']);
});
test('a scanner result cannot cross an authentication generation', async (t) => {
    const d = scannerDom(t), values = [], ctx = { unlocked: true, authGeneration: 1, session: { user: { id: 1 } } };
    scanner.openScanner(ctx, { onScan: value => values.push(value) });
    ctx.authGeneration++;
    d.nodes['[data-scan-value]'].value = 'SN-OLD';
    d.nodes['[data-scan-use]'].onclick();
    await Promise.resolve();
    assert.deepEqual(values, []);
    assert.equal(d.dialog.open, false);
});
const saved = { id: 7, returnNumber: 'RET-0049', serialNumber: 'SN-001', replacementSerialNumber: 'REPLACEMENT-002', productName: 'Kopfhörer', sku: 'AUDIO-001', customerReference: 'REF-001', createdAt: '2026-10-13T10:30:00.000Z', receiptDate: '2026-10-13', status: 'In Prüfung', reason: 'Defekt', condition: 'Ungeprüft', resolution: 'Austausch', supplier: 'Home & Co.', nextStep: 'Neues Gerät prüfen', notes: 'private note', orderNumber: 'private order' };
function labelRequest(overrides = {}) { const result = { value: null }; return { path: '/api/returns/7/label', method: 'GET', store: { getReturn: id => id === 7 ? saved : null }, user: () => ({ id: 1, role: 'admin' }), json: value => result.value = value, result, ...overrides }; }
test('print label endpoint includes only saved label fields and QR payload contains only the return number', async () => {
    assert.equal(typeof labels.handleReturnLabelRoute, 'function');
    const request = labelRequest();
    assert.equal(await labels.handleReturnLabelRoute(request), true);
    assert.deepEqual(Object.keys(request.result.value).sort(), ['condition', 'createdAt', 'customerReference', 'id', 'nextStep', 'orderNumber', 'productName', 'qrDataUrl', 'reason', 'receiptDate', 'replacementSerialNumber', 'resolution', 'returnNumber', 'serialNumber', 'sku', 'status', 'supplier', 'trackingNumber']);
    assert.equal(request.result.value.replacementSerialNumber, 'REPLACEMENT-002');
    assert.equal(request.result.value.sku, 'AUDIO-001');
    assert.equal(request.result.value.receiptDate, '2026-10-13');
    assert.equal(request.result.value.status, 'In Prüfung');
    assert.equal(request.result.value.returnNumber, saved.returnNumber);
    assert.match(request.result.value.qrDataUrl, /^data:image\/png;base64,/);
    assert.equal(scanner.createBarcodeReader().decodeBitmap(pngBitmap(request.result.value.qrDataUrl)).getText(), saved.returnNumber);
    // Payload helper defines the QR input, independent of the image encoding.
    assert.equal(labels.returnLabelPayload(saved), saved.returnNumber);
    assert.doesNotMatch(labels.returnLabelPayload(saved), /SN-|REF-|private/);
});
test('label export checks authentication and return export permission before reading the store', async () => {
    assert.equal(typeof labels.handleReturnLabelRoute, 'function');
    let reads = 0;
    const store = { getReturn() { reads++; return saved; } };
    await assert.rejects(labels.handleReturnLabelRoute(labelRequest({ store, user: () => { throw Object.assign(new Error('signin'), { status: 401 }); } })), /signin/);
    await assert.rejects(labels.handleReturnLabelRoute(labelRequest({ store, user: () => ({ id: 2, role: 'viewer' }) })), error => error.status === 403);
    await assert.rejects(labels.handleReturnLabelRoute(labelRequest({ store, user: () => ({ id: 2, role: 'member', permissions: { returnsExport: false } }) })), error => error.status === 403);
    assert.equal(reads, 0);
});
test('label route rejects missing and unsafe ids, ignores nonmatching routes and rechecks authentication after QR generation', async () => {
    assert.equal(typeof labels.handleReturnLabelRoute, 'function');
    for (const path of ['/api/returns/8/label', '/api/returns/9007199254740992/label'])
        await assert.rejects(labels.handleReturnLabelRoute(labelRequest({ path })), error => [400, 404].includes(error.status));
    for (const [path, method] of [['/api/returns/7/label', 'POST'], ['/api/returns/../label', 'GET'], ['/api/returns/0/label', 'GET']])
        assert.equal(await labels.handleReturnLabelRoute(labelRequest({ path, method })), false);
    let calls = 0;
    const request = labelRequest({ user() {
            if (calls++)
                throw Object.assign(new Error('session changed'), { status: 401 });
            return { id: 1, role: 'admin' };
        } });
    await assert.rejects(labels.handleReturnLabelRoute(request), /session changed/);
    assert.equal(request.result.value, null);
});
test('print preview escapes hostile record fields and rejects unsafe QR image URLs', () => {
    assert.equal(typeof scanner.renderReturnLabelDocument, 'function');
    const qrDataUrl = 'data:image/png;base64,aGVsbG8=';
    const rendered = String(scanner.renderReturnLabelDocument({ ...saved, returnNumber: '<img src=x onerror=alert(1)>', serialNumber: '" autofocus onfocus="x', productName: '<script>alert(1)</script>', customerReference: '<svg onload=x>', qrDataUrl }));
    assert.doesNotMatch(rendered, /<script|onerror=alert\(1\)>|<svg onload/);
    assert.match(rendered, /&lt;img/);
    assert.match(rendered, /&lt;script/);
    assert.match(rendered, /src="\/favicon\.svg"/);
    assert.match(rendered, /data-label-print/);
    assert.doesNotMatch(rendered, /window\.print|<[^>]*\sonload=/);
    assert.throws(() => scanner.renderReturnLabelDocument({ ...saved, qrDataUrl: 'https://example.org/qr.png' }), /QR/);
    assert.throws(() => scanner.renderReturnLabelDocument({ ...saved, qrDataUrl: 'data:image/svg+xml;base64,aGVsbG8=' }), /QR/);
});
test('English label preview uses translated controls and keeps stored values verbatim', t => {
    assert.equal(typeof scanner.renderReturnLabelDocument, 'function');
    setLanguage('en');
    t.after(() => setLanguage('de'));
    const rendered = String(scanner.renderReturnLabelDocument({ ...saved, qrDataUrl: 'data:image/png;base64,aGVsbG8=' }));
    assert.match(rendered, /Print label/);
    assert.match(rendered, /Return number/);
    assert.match(rendered, /Serial number/);
    assert.match(rendered, /Kopfhörer/);
    assert.match(rendered, /lang="en"/);
});
function labelDom(t, { decode = async () => { } } = {}) {
    const listeners = {}, classes = new Set(), original = { open: true, innerHTML: '<form>unsaved record</form>' };
    const print = { disabled: true, focus() { } }, close = {}, product = { checked: true, dataset: { labelOption: 'product' } }, reference = { checked: true, dataset: { labelOption: 'reference' } }, fields = { product: { hidden: false }, reference: { hidden: false } };
    const label = { dataset: { labelSize: 'a4' }, clientWidth: 794, clientHeight: 1123, scrollWidth: 794, scrollHeight: 1123 }, size = { value: 'a4' };
    const status = { textContent: '' }, dialog = { open: false, removed: false, dataset: {}, attrs: {}, events: {}, setAttribute(key, value) { this.attrs[key] = value; }, showModal() { this.open = true; }, close() { this.open = false; this.events.close?.(); }, remove() { this.removed = true; }, addEventListener(event, fn) { this.events[event] = fn; }, querySelector(selector) {
            if (selector === '[data-label-print]')
                return print;
            if (selector === '[data-label-close]')
                return close;
            if (selector === '[data-label-status]')
                return status;
            if (selector === '[data-label-size-select]')
                return size;
            if (selector === '.return-print-label')
                return label;
            const match = selector.match(/^\[data-label-field="(product|reference)"\]$/);
            return match ? fields[match[1]] : null;
        }, querySelectorAll(selector) { return selector === '[data-label-option]' ? [product, reference] : selector === 'img' ? [{ decode }] : []; } };
    const old = { document: globalThis.document, window: globalThis.window };
    let printed = 0, popups = 0;
    globalThis.document = { createElement: () => dialog, querySelector: () => original, body: { append() { }, classList: { add: name => classes.add(name), remove: name => classes.delete(name) } }, addEventListener(event, fn) { listeners[event] = fn; }, removeEventListener() { } };
    globalThis.window = { open() { popups++; throw new Error('Popup printing is not supported'); }, print() { printed++; }, addEventListener(event, fn) { listeners[event] = fn; }, removeEventListener() { } };
    t.after(() => { scanner.stopScanner(); globalThis.document = old.document; globalThis.window = old.window; });
    return { dialog, original, print, close, product, reference, fields, listeners, classes, label, size, status, printed: () => printed, popups: () => popups };
}
test('label opens a separate in-app dialog and prints only on explicit button click', async (t) => {
    const d = labelDom(t), ctx = { unlocked: true, authGeneration: 1, session: { user: { id: 1 } }, can: () => true, api: async () => ({ ...saved, qrDataUrl: 'data:image/png;base64,aGVsbG8=' }) };
    const preview = await scanner.printReturnLabel(ctx, saved.id);
    assert.equal(preview, d.dialog);
    assert.equal(d.dialog.open, true);
    assert.equal(d.original.open, true);
    assert.equal(d.original.innerHTML, '<form>unsaved record</form>');
    assert.equal(d.popups(), 0);
    assert.equal(d.printed(), 0);
    assert.equal(d.print.disabled, false);
    assert.ok(d.classes.has('return-label-printing'));
    d.product.checked = false;
    d.product.onchange();
    assert.equal(d.fields.product.hidden, true);
    assert.equal(d.fields.reference.hidden, false);
    d.print.onclick();
    assert.equal(d.printed(), 1);
    d.close.onclick();
    assert.equal(d.dialog.removed, true);
    assert.equal(d.original.open, true);
    assert.equal(d.classes.has('return-label-printing'), false);
});
test('closing a loading label ignores the late response and navigation removes an open label', async (t) => {
    const d = labelDom(t);
    let resolveLabel;
    const ctx = { unlocked: true, authGeneration: 1, session: { user: { id: 1 } }, can: () => true, api: () => new Promise(resolve => resolveLabel = resolve) };
    const pending = scanner.printReturnLabel(ctx, saved.id);
    assert.equal(d.dialog.open, true);
    assert.match(d.dialog.innerHTML, /Etikett wird geladen/);
    d.close.onclick();
    resolveLabel({ ...saved, qrDataUrl: 'data:image/png;base64,aGVsbG8=' });
    assert.equal(await pending, null);
    assert.equal(d.printed(), 0);
    assert.equal(d.original.open, true);
    ctx.api = async () => ({ ...saved, qrDataUrl: 'data:image/png;base64,aGVsbG8=' });
    await scanner.printReturnLabel(ctx, saved.id);
    d.listeners.popstate();
    assert.equal(d.dialog.open, false);
    assert.equal(d.classes.has('return-label-printing'), false);
});
test('label waits for images and closes if authentication changes before printing', async (t) => {
    let resolveImage;
    const d = labelDom(t, { decode: () => new Promise(resolve => resolveImage = resolve) }), ctx = { unlocked: true, authGeneration: 1, session: { user: { id: 1 } }, can: () => true, api: async () => ({ ...saved, qrDataUrl: 'data:image/png;base64,aGVsbG8=' }) };
    const pending = scanner.printReturnLabel(ctx, saved.id);
    await Promise.resolve();
    assert.equal(d.print.disabled, true);
    assert.equal(d.printed(), 0);
    resolveImage();
    await pending;
    assert.equal(d.print.disabled, false);
    ctx.authGeneration++;
    d.print.onclick();
    assert.equal(d.printed(), 0);
    assert.equal(d.dialog.open, false);
    assert.equal(d.original.open, true);
});
test('label never prints overflowing content and a supported size updates the sheet before printing', async (t) => {
    const d = labelDom(t), ctx = { unlocked: true, authGeneration: 1, session: { user: { id: 1 } }, can: () => true, api: async () => ({ ...saved, qrDataUrl: 'data:image/png;base64,aGVsbG8=' }) };
    await scanner.printReturnLabel(ctx, saved.id);
    d.label.scrollHeight = 1500;
    d.listeners.beforeprint();
    assert.equal(d.dialog.dataset.labelPrintState, 'blocked');
    d.print.onclick();
    assert.equal(d.printed(), 0);
    assert.equal(d.print.disabled, true);
    assert.match(d.status.textContent, /größeres Format/);
    d.label.scrollHeight = 1123;
    d.size.value = '62x29';
    d.size.onchange();
    assert.equal(d.label.dataset.labelSize, '62x29');
    assert.equal(d.dialog.dataset.labelSize, '62x29');
    assert.equal(d.reference.checked, false);
    d.print.onclick();
    assert.equal(d.printed(), 1);
});
test('HTTP label endpoint requires authentication and explicit return export permission', async (t) => {
    const f = await runtimeFixture(t), { auth } = await f.setup(), product = await f.app.store.createProduct({ name: 'Etikett Produkt', sku: 'LABEL-API-49' }), ret = await f.app.store.createReturn({ productId: product.id, serialNumber: 'LABEL-SN', returnNumber: 'LABEL-0049' });
    assert.equal((await f.request(`/api/returns/${ret.id}/label`)).status, 401);
    await f.request('/api/users', 'POST', { username: 'LabelReader', password: testPassword, role: 'viewer' }, auth);
    const viewer = (await f.login('LabelReader')).auth;
    assert.equal((await f.request(`/api/returns/${ret.id}/label`, 'GET', undefined, viewer)).status, 403);
    const response = await f.request(`/api/returns/${ret.id}/label`, 'GET', undefined, auth);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control'), /no-store/);
    const data = await response.json();
    assert.equal(data.serialNumber, 'LABEL-SN');
    assert.equal(scanner.createBarcodeReader().decodeBitmap(pngBitmap(data.qrDataUrl)).getText(), 'LABEL-0049');
    assert.equal((await f.request('/api/returns/999999/label', 'GET', undefined, auth)).status, 404);
    assert.equal((await f.request('/api/returns/9007199254740992/label', 'GET', undefined, auth)).status, 400);
});
