import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectRuntime } from './runtime-layout.mjs';
import { isolatedDatabase } from './isolated-database.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
let port = 3002;
while (args.length) {
    if (args.shift() !== '--port' || !args.length)
        throw new Error('Aufruf: npm run preview -- [--port PORT]');
    const value = args.shift();
    if (!/^\d{1,5}$/.test(value))
        throw new Error('Ungültiger Vorschauport.');
    port = Number(value);
}
if (port > 65535)
    throw new Error('Ungültiger Vorschauport.');
const runtime = selectRuntime(root);
const { createRuntime } = await import(new URL('../' + (runtime.compiled ? 'dist/' : '') + 'server/runtime.js', import.meta.url).href);
const prefix = runtime.compiled ? 'dist/' : '';
const staticFiles = new Map();
staticFiles.set('/preview-info.js', { data: readFileSync(join(root, 'previews/design/public/preview-info.js')), type: 'text/javascript; charset=utf-8' });
for (const [file, routes] of [['index.html', ['/', '/index.html', '/chat', '/chat/']], ['admin.html', ['/admin', '/admin/', '/admin.html']], ['login.html', ['/login', '/login/']], ['account.html', ['/account', '/account/', '/account.html']]]) {
    const html = readFileSync(join(root, prefix, 'public', file), 'utf8')
        .replace('</head>', '  <script type="module" src="/preview-info.js"></script>\n</head>')
        .replace('<body ', '<body data-design-preview ')
        .replace('<div class="topbar-right">', '<div class="topbar-right"><span class="preview-badge" data-i18n="Demomodus">Demomodus</span>')
        .replace('<span>retourenboard. <span class="footer-divider">', '<span><span data-i18n="Testdaten">Testdaten</span> · retourenboard. <span class="footer-divider">');
    for (const route of routes)
        staticFiles.set(route, { data: Buffer.from(html), type: 'text/html; charset=utf-8' });
}
const dataDir = mkdtempSync(join(tmpdir(), 'retourenboard-design-'));
let app, serverRuntime, closing, database;
async function close() {
    return closing ??= await (async () => {
        try {
            if (serverRuntime)
                await serverRuntime.close();
        }
        finally {
            await database?.close();
            rmSync(dataDir, { recursive: true, force: true });
            if (process.connected)
                process.disconnect();
        }
    })();
}
function attachPreview(app) {
    const originalHandler = app.server.listeners('request')[0];
    app.server.removeListener('request', originalHandler);
    app.server.on('request', (req, res) => {
        let pathname;
        try {
            pathname = new URL(req.url, 'http://localhost').pathname;
        }
        catch {
            return originalHandler(req, res);
        }
        const asset = staticFiles.get(pathname);
        if (!asset || !['GET', 'HEAD'].includes(req.method))
            return originalHandler(req, res);
        // Let the production handler enforce login redirects before decorating HTML.
        if (asset.type.startsWith('text/html')) {
            // The preview substitutes decorated identity HTML for the production body.
            // Keep its length and encoding consistent, including authenticated HEAD.
            const writeHead = res.writeHead;
            res.writeHead = function (statusCode, statusMessage, headers) {
                const values = typeof statusMessage === 'string' ? headers : statusMessage;
                if (statusCode === 200 && String(values?.['Content-Type'] ?? res.getHeader('Content-Type')).startsWith('text/html')) {
                    const previewHeaders = { ...values, 'Content-Length': asset.data.length };
                    delete previewHeaders['Content-Encoding'];
                    return typeof statusMessage === 'string'
                        ? writeHead.call(this, statusCode, statusMessage, previewHeaders)
                        : writeHead.call(this, statusCode, previewHeaders);
                }
                return writeHead.call(this, statusCode, statusMessage, headers);
            };
            const end = res.end;
            res.end = function (body, ...args) {
                if (req.method === 'GET' && res.statusCode === 200 && String(res.getHeader('Content-Type')).startsWith('text/html'))
                    body = asset.data;
                return end.call(this, body, ...args);
            };
            return originalHandler(req, res);
        }
        res.writeHead(200, {
            'Content-Type': asset.type, 'Content-Length': asset.data.length, 'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin',
            'Content-Security-Policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; font-src 'self' data: blob:; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
        });
        res.end(req.method === 'HEAD' ? undefined : asset.data);
    });
}
try {
    database = await isolatedDatabase();
    serverRuntime = createRuntime({ databaseConfig: database.config, internalSchema: database.schema, dataDir, port, host: '127.0.0.1', publicOrigin: '', production: false, secureCookies: false, onApp: attachPreview });
    await serverRuntime.start();
    app = serverRuntime.current();
    const demo = await app.users.createFirst({ username: 'demo', displayName: 'Max Demo', password: 'RetourenboardDemo2026!' });
    const lena = await app.users.create({ username: 'Lena', displayName: 'Lena Beispiel', role: 'member', password: 'RetourenboardDemo2026!' });
    const tom = await app.users.create({ username: 'Tom', displayName: 'Tom Beispiel', role: 'member', password: 'RetourenboardDemo2026!' });
    const supplier = await Promise.all(['Nordlicht Handel', 'Technikpartner West', 'Home & Co.'].map(async (name) => app.store.createMasterData('suppliers', { name })));
    const categories = await Promise.all(['Audio', 'Computer', 'Haushalt'].map(async (name) => app.store.createMasterData('categories', { name })));
    const manufacturer = await app.store.createMasterData('manufacturers', { name: 'DemoTech' });
    const definitions = [
        ['Studio Wireless Kopfhörer', 'KH-101', 12900, 0, 0],
        ['Mechanische Tastatur K80', 'KB-080', 8990, 1, 1],
        ['27″ IPS-Monitor', 'MON-027', 24900, 1, 1],
        ['Filterkaffeemaschine', 'HOME-012', 5990, 2, 2],
        ['Bluetooth-Lautsprecher', 'BT-042', 6990, 0, 0],
        ['USB-C Dockingstation', 'DOCK-007', 11900, 1, 1]
    ];
    const products = await Promise.all(definitions.map(async ([name, sku, priceCents, supply, category], index) => app.store.createProduct({ name, sku, priceCents, ean: '40012345000' + String(index + 1).padStart(2, '0'), supplierId: supplier[supply].id, categoryId: categories[category].id, manufacturerId: manufacturer.id, active: true, description: 'Beispielprodukt für die Designvorschau.' })));
    const masters = await app.store.listMasterData();
    for (let index = 0; index < 10; index++) {
        const status = masters.statuses[index % masters.statuses.length];
        const selected=masters.resolutions[index % masters.resolutions.length],resolution=status.isClosed&&selected.builtinKey==='resolutions.pending'?masters.resolutions.find(row=>row.builtinKey==='resolutions.refund'):selected;
        await app.store.createReturn({ replacementSerialNumber:resolution?.builtinKey==='resolutions.exchange'?`DEMO-REPLACE-${index+1}`:'',productId: products[index % products.length].id, supplierId: index === 2 ? null : products[index % products.length].supplierId, serialNumber: `DEMO-SN-${String(index + 1).padStart(4, '0')}`, orderNumber: `BEST-DEMO-${1000 + index}`, receiptDate: `2026-10-${String(6 - index % 5).padStart(2, '0')}`, quantity: 1 + Number(index === 8), statusId: status.id, reasonId: masters.reasons[index % masters.reasons.length].id, conditionId: masters.conditions[index % masters.conditions.length].id, resolutionId: resolution.id, notes: index % 2 ? 'Zubehör vollständig. Ergebnis der Prüfung bitte dokumentieren.' : 'Kundin meldet einen sporadischen Fehler. Funktionsprüfung vorgesehen.' });
    }
    const disposalPlanned = await app.disposals.create(demo, {productName:'Externe Festplatte 2 TB',serialNumber:'DEMO-HDD-001',mode:'destroy',location:'Sicherheitslager A',reason:'Defektes Gerät',notes:'Beispielauftrag – nur synthetische Daten.'});
    const disposalApproved = await app.disposals.create(demo, {productName:'Notebook SSD 512 GB',serialNumber:'DEMO-SSD-002',mode:'erase',location:'Prüfplatz 2'});
    await app.disposals.change(demo,disposalApproved.id,'approve',{revision:disposalApproved.revision});
    const disposalComplete = await app.disposals.create(demo, {productId:products[3].id,serialNumber:'DEMO-HOME-003',mode:'dispose',reason:'Nicht reparierbar'});
    const approved = await app.disposals.change(demo,disposalComplete.id,'approve',{revision:disposalComplete.revision});
    await app.disposals.change(demo,disposalComplete.id,'complete',{revision:approved.revision,completedOn:new Date().toISOString().slice(0,10),method:'An Elektroschrott-Sammelstelle übergeben',performedBy:'Demo Recycling'});
    const actualPort = app.server.address().port;
    const team = (await app.collaboration.channels(demo))[0];
    await app.collaboration.postMessage(lena, team.id, { text: 'Guten Morgen! Die neuen Rückläufer sind erfasst. @demo kannst du die Prüfung übernehmen?' });
    await app.collaboration.postMessage(demo, team.id, { text: 'Ja, ich beginne mit den Kopfhörern. Rückfragen halten wir direkt als Kommentar an der Retoure fest.' });
    const group = await app.collaboration.createChannel(demo, { kind: 'group', name: 'Wareneingang', visibility: 'private', memberIds: [lena.id, tom.id] });
    await app.collaboration.postMessage(tom, group.id, { text: 'Zubehör ist vollständig. Die Geräte liegen im Prüfbereich.' });
    const direct = await app.collaboration.createChannel(demo, { kind: 'direct', userId: lena.id });
    await app.collaboration.postMessage(lena, direct.id, { text: 'Kannst du dir die Seriennummer des Monitors ansehen?' });
    await app.collaboration.postComment(lena, (await app.store.listReturns())[0].id, { text: '@demo die Verpackung ist vollständig. Bitte das Ergebnis der Funktionsprüfung hier ergänzen.' });
    console.log(`DESIGN_URL=http://localhost:${actualPort}\nDESIGN_DATA=${dataDir}\nretourenboard. ${runtime.version} – Designvorschau`);
    console.log('Testkonto: demo / RetourenboardDemo2026!');
    console.log('Nur synthetische Testdaten. Mit Strg+C beenden; Vorschau-Daten werden entfernt.');
    if (process.send)
        process.send({ type: 'ready', port: actualPort, dataDir });
    for (const signal of ['SIGINT', 'SIGTERM'])
        process.once(signal, () => void close().catch(error => { console.error(error.message); process.exitCode = 1; }));
    if (process.send)
        process.on('message', message => {
            if (message === 'stop')
                void close();
        });
}
catch (error) {
    await close();
    console.error(error.code === 'EADDRINUSE' ? `Port ${port} ist belegt. Mit --port einen freien Port wählen.` : error.message);
    process.exitCode = 1;
}
