import {createDisposals} from './disposals.js';
import {handleDisposalRoute} from './disposal-routes.js';
import { resolve } from 'node:path';
import { mkdirSync, lstatSync } from 'node:fs';
import { openDatabase } from './database/connection.js';
import { readDatabaseConfig } from './database/config.js';
import { acquireRuntimeLease } from './database/runtime-lease.js';
import { createMutationGuard } from './database/authorize.js';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { readFileSync, readdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from './store.js';
import { createAuth } from './auth.js';
import {createSsoStore} from './sso-store.js';
import {createSso} from './sso.js';
import {handleSsoPublic,handleSsoAdmin,ssoBrowserToken} from './sso-routes.js';
import { createClientAddress } from './client-address.js';
import { resolveRequestAccess } from './request-access.js';
import { loginPathFor } from '../shared/auth-navigation.js';
import { createServerLog } from './server-log.js';
import { handleServerRoute } from './server-routes.js';
import { createUsers } from './users.js';
import { previewImport, commitImport } from './import.js';
import { InputError, PRODUCT_COLUMNS, RETURN_COLUMNS } from '../shared/model.js';
import {expectedRevision,checkRecordRevision} from './database/record-metadata.js';
import { exportCsv } from '../shared/csv.js';
import { isInventoryText, MAX_INVENTORY_BYTES } from '../shared/inventory-file.js';
import { exportInventory, previewInventoryImport, commitInventoryImport } from './inventory-transfer.js';
import { createAttachments } from './attachments.js';
import { createSettings } from './settings.js';
import { createCurrency } from './currency.js';
import { createPreferences } from './preferences.js';
import { requireCapability, requirePermission } from './permissions.js';
import { ADMIN_SECTION_PERMISSIONS, hasPermission } from '../shared/permissions.js';
import { createWriteCoordinator } from './write-coordinator.js';
import { createSecrets } from './secrets.js';
import { createMfa } from './mfa.js';
import { createAccountSettings } from './account-settings.js';
import { createCsvProfiles, resolveProfile } from './csv-profiles.js';
import { parseCsv, guessCsvMapping, inferCsvKind } from '../shared/csv.js';
import { createAudit } from './audit.js';
import { randomUUID } from 'node:crypto';
import { createBackups } from './backups.js';
import { createJobs } from './jobs.js';
import { createDiagnostics } from './diagnostics.js';
import { createVersionCheck } from './version-check.js';
import { createUpdateClient } from './update-client.js';
import { createInAppUpdater } from './in-app-updater.js';
import { UPDATE_MARKER } from './update-linux.js';
import { createMail } from './mail.js';
import { createNotifications } from './notifications.js';
import { createCollaboration } from './collaboration.js';
import { handleCollaborationRoute } from './collaboration-routes.js';
import { handleRestoreRoute } from './restore-routes.js';
import { createReturnWorkflow } from './return-workflow.js';
import { handleReturnWorkflowRoute } from './return-workflow-routes.js';
import { handleReturnLabelRoute } from './return-labels.js';
const root = new URL('../', import.meta.url);
const { version } = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
const files = new Map([
    ['/bootstrap.js', ['public/bootstrap.js', 'text/javascript']],
    ['/icon-motion.js', ['public/icon-motion.js', 'text/javascript']],
    ['/notices.js', ['public/notices.js', 'text/javascript']],
    ['/i18n.js', ['public/i18n.js', 'text/javascript']],
    ['/i18n-catalog.js', ['public/i18n-catalog.js', 'text/javascript']],
    ['/login.js', ['public/login.js', 'text/javascript']],
    ['/sso-login.js', ['public/sso-login.js', 'text/javascript']],
    ['/admin-sso.js', ['public/admin-sso.js', 'text/javascript']],
    ['/auth-security.js', ['public/auth-security.js', 'text/javascript']],
    ['/ui.js', ['public/ui.js', 'text/javascript']],
    ['/switches.js', ['public/switches.js', 'text/javascript']],
    ['/switches.css', ['public/switches.css', 'text/css']],
    ['/auth-context.js', ['public/auth-context.js', 'text/javascript']],
    ['/login', ['public/login.html', 'text/html']], ['/login/', ['public/login.html', 'text/html']],
    ['/shared/auth-navigation.js', ['shared/auth-navigation.js', 'text/javascript']],
    ['/', ['public/index.html', 'text/html']], ['/index.html', ['public/index.html', 'text/html']],
    ['/admin', ['public/admin.html', 'text/html']], ['/admin/', ['public/admin.html', 'text/html']],
    ['/admin.html', ['public/admin.html', 'text/html']],
    ['/chat', ['public/index.html', 'text/html']], ['/chat/', ['public/index.html', 'text/html']],
    ['/chat.js', ['public/chat.js', 'text/javascript']], ['/chat.css', ['public/chat.css', 'text/css']],
    ['/comments.js', ['public/comments.js', 'text/javascript']], ['/collaboration-ui.js', ['public/collaboration-ui.js', 'text/javascript']],
    ['/account', ['public/account.html', 'text/html']], ['/account/', ['public/account.html', 'text/html']],
    ['/account.html', ['public/account.html', 'text/html']],
    ['/account.js', ['public/account.js', 'text/javascript']], ['/settings.css', ['public/settings.css', 'text/css']],
    ['/permission-editor.js', ['public/permission-editor.js', 'text/javascript']],
    ['/unsaved.js', ['public/unsaved.js', 'text/javascript']], ['/input-generation.js', ['public/input-generation.js', 'text/javascript']], ['/return-status.js', ['public/return-status.js', 'text/javascript']],
    ['/admin-rules.js', ['public/admin-rules.js', 'text/javascript']], ['/admin-csv-profiles.js', ['public/admin-csv-profiles.js', 'text/javascript']],
    ['/admin-audit.js', ['public/admin-audit.js', 'text/javascript']],
    ['/appearance.js', ['public/appearance.js', 'text/javascript']], ['/pagination.js', ['public/pagination.js', 'text/javascript']],
    ['/admin-notifications.js', ['public/admin-notifications.js', 'text/javascript']], ['/notifications.js', ['public/notifications.js', 'text/javascript']],
    ['/admin-backups.js', ['public/admin-backups.js', 'text/javascript']], ['/admin-diagnostics.js', ['public/admin-diagnostics.js', 'text/javascript']],
    ['/admin-updates.js', ['public/admin-updates.js', 'text/javascript']],
    ['/admin-updater.js', ['public/admin-updater.js', 'text/javascript']],
    ['/backup-restore.js', ['public/backup-restore.js', 'text/javascript']], ['/navigation-tools.js', ['public/navigation-tools.js', 'text/javascript']],
    ['/admin-settings.js', ['public/admin-settings.js', 'text/javascript']],
    ['/inventory-display.js', ['public/inventory-display.js', 'text/javascript']],
    ['/inventory-transfer.js', ['public/inventory-transfer.js', 'text/javascript']],
    ['/product-images.js', ['public/product-images.js', 'text/javascript']],
    ['/selects.js', ['public/selects.js', 'text/javascript']],
    ['/currency-control.js', ['public/currency-control.js', 'text/javascript']],
    ['/section-transition.js', ['public/section-transition.js', 'text/javascript']],
    ['/server-operations.js', ['public/server-operations.js', 'text/javascript']],
    ['/styles.css', ['public/styles.css', 'text/css']], ['/app.js', ['public/app.js', 'text/javascript']],
    ['/design.js', ['public/design.js', 'text/javascript']], ['/design.css', ['public/design.css', 'text/css']],
    ['/sidebar-navigation.js', ['public/sidebar-navigation.js', 'text/javascript']],
    ['/motion.css', ['public/motion.css', 'text/css']],
    ['/theme.js', ['public/theme.js', 'text/javascript']], ['/theme.css', ['public/theme.css', 'text/css']],
    ['/forms.js', ['public/forms.js', 'text/javascript']], ['/import.js', ['public/import.js', 'text/javascript']],
    ['/product-picker.js', ['public/product-picker.js', 'text/javascript']],
    ['/quick-actions.js', ['public/quick-actions.js', 'text/javascript']],
    ['/chat-files.js', ['public/chat-files.js', 'text/javascript']],
    ['/workspace-tools.js', ['public/workspace-tools.js', 'text/javascript']], ['/workspace-tools.css', ['public/workspace-tools.css', 'text/css']], ['/workflow.css', ['public/workflow.css', 'text/css']],
    ...['table-preferences.js', 'workspace-insights.js', 'scanner-loading.js', 'scan-labels.js', 'pdf-serial-scan.js', 'barcode-image.js', 'serial-ocr.js', 'return-labels.js', 'label-identifiers.js', 'return-drafts.js', 'scan-preview.js', 'workspace-personalization.js', 'table-sort.js', 'record-action-menu.js', 'scan-intake.js'].map(file => ['/' + file, ['public/' + file, 'text/javascript']]),
    ...['workspace-refinements.css', 'workspace-insights.css', 'scan-labels.css', 'return-labels.css', 'return-drafts.css', 'workspace-personalization.css', 'scan-intake.css', 'inventory-polish.css'].map(file => ['/' + file, ['public/' + file, 'text/css']]),
    ['/form-feedback.js', ['public/form-feedback.js', 'text/javascript']], ['/return-timeline.js', ['public/return-timeline.js', 'text/javascript']], ['/workflow-actions.js', ['public/workflow-actions.js', 'text/javascript']],
    ['/presentation.js', ['public/presentation.js', 'text/javascript']],
    ['/admin.js', ['public/admin.js', 'text/javascript']],
    ['/accounts.js', ['public/accounts.js', 'text/javascript']],
    ['/account-deletion.js', ['public/account-deletion.js', 'text/javascript']],
    ['/attachments.js', ['public/attachments.js', 'text/javascript']],
    ['/pdf-preview.js', ['public/pdf-preview.js', 'text/javascript']],
    ['/shared/model.js', ['shared/model.js', 'text/javascript']], ['/shared/csv.js', ['shared/csv.js', 'text/javascript']],
    ...['return-completion','import-diff','return-transitions','serial-recognition'].map(name=>['/'+name+'.js',['public/'+name+'.js','text/javascript']]),
    ['/shared/return-completion.js',['shared/return-completion.js','text/javascript']],
    ['/shared/serial-number.js',['shared/serial-number.js','text/javascript']],
    ['/shared/permissions.js', ['shared/permissions.js', 'text/javascript']],
    ['/shared/import-session.js', ['shared/import-session.js', 'text/javascript']],
    ['/shared/inventory-file.js', ['shared/inventory-file.js', 'text/javascript']],
    ['/favicon.svg', ['public/favicon.svg', 'image/svg+xml']],
    ['/kofi.avif', ['public/kofi.avif', 'image/avif']]
]);
for(const name of ['disposals','disposal-copy','disposal-forms','disposal-labels','disposal-transfer'])files.set('/'+name+'.js',['public/'+name+'.js','text/javascript']);
files.set('/disposals.css',['public/disposals.css','text/css']);
// Only the dependency graph required for login, setup and 2FA is public.
// New application assets are private by default.
const publicScripts = new Set(['/theme.js', '/bootstrap.js', '/icon-motion.js', '/login.js', '/sso-login.js', '/auth-security.js', '/auth-context.js', '/ui.js', '/unsaved.js', '/i18n.js', '/notices.js', '/shared/auth-navigation.js']);
for (const name of ['tesseract.esm.min.js', 'worker.min.js'])
    files.set('/vendor/ocr/' + name, ['public/vendor/ocr/' + name, 'text/javascript']);
for (const folder of ['core', 'lang'])
    for (const name of readdirSync(new URL(`../public/vendor/ocr/${folder}/`, import.meta.url))) {
        if (!/^[\w.-]+\.(js|traineddata\.gz)$/.test(name))
            continue;
        files.set(`/vendor/ocr/${folder}/${name}`, [`public/vendor/ocr/${folder}/${name}`, name.endsWith('.js') ? 'text/javascript' : 'application/octet-stream']);
    }
for (const name of ['pdf.min.mjs', 'pdf.worker.min.mjs'])
    files.set('/vendor/pdfjs/' + name, ['public/vendor/pdfjs/' + name, 'text/javascript']);
for (const folder of ['cmaps', 'standard_fonts', 'wasm'])
    for (const name of readdirSync(new URL(`../public/vendor/pdfjs/${folder}/`, import.meta.url))) {
        if (!/^[\w.-]+\.(bcmap|pfb|ttf|wasm|js)$/.test(name))
            continue;
        const type = name.endsWith('.wasm') ? 'application/wasm' : name.endsWith('.js') ? 'text/javascript' : 'application/octet-stream';
        files.set(`/vendor/pdfjs/${folder}/${name}`, [`public/vendor/pdfjs/${folder}/${name}`, type]);
    }
async function jsonBody(req, limit = 3000000) {
    if (!String(req.headers['content-type'] ?? '').startsWith('application/json'))
        throw new InputError('JSON-Daten erwartet.', 415);
    if (Number(req.headers['content-length']) > limit)
        throw new InputError('Anfrage ist zu groß.', 413);
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
        size += chunk.length;
        if (size > limit)
            throw new InputError('Anfrage ist zu groß.', 413);
        chunks.push(chunk);
    }
    try {
        const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!value || typeof value !== 'object' || Array.isArray(value))
            throw new Error();
        return value;
    }
    catch {
        throw new InputError('Ungültige JSON-Daten.');
    }
}
export async function createApp({ dbPath, databaseConfig, database, runtimeLease, internalSchema = 'retourenboard', dataDir = resolve(process.env.DATA_DIR || 'data'), maintenance: initialMaintenance = false, onLeaseLost = () => { }, secureCookies = false, publicOrigin = '', port = 3000, host = '127.0.0.1', trustedProxies = [], production = false, now = Date.now, runtime = null, activeNetwork = null, versionFetch = fetch, automaticVersionCheck = false, ssoAllowLoopback = false, ssoFetch = fetch, currencyFetch = fetch, updateService = createUpdateClient(), serverControl = null, serverLog = createServerLog({ now }) }) {
    if (dbPath !== undefined)
        throw new Error('Bestehende SQLite-Installationen zuerst nach PostgreSQL migrieren und DATA_DIR/DATABASE_URL konfigurieren.');
    dataDir = resolve(dataDir);
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    if (lstatSync(dataDir).isSymbolicLink())
        throw new Error('Datenverzeichnis darf kein symbolischer Link sein.');
    const connectionConfig = databaseConfig ?? readDatabaseConfig(), opened = database ?? await openDatabase(connectionConfig, internalSchema);
    let lease, leaseLost = false;
    try {
        lease = runtimeLease ?? await acquireRuntimeLease(connectionConfig, opened.schema, () => { leaseLost = true; onLeaseLost(); });
        const clientAddress = createClientAddress(trustedProxies);
        const store = await createStore({ database: opened }), settings = createSettings(store.db, { port, publicOrigin, secureCookies }, production);
        let network;
        try {
            network = activeNetwork ?? await settings.network();
            settings.ensureProduction(network);
        }
        catch (error) {
            store.close();
            throw error;
        }
        secureCookies = network.secureCookies;
        publicOrigin = network.publicOrigin;
        const users = createUsers(store), secrets = createSecrets(dataDir), mfa = createMfa({ db: store.db, users, clock: { now }, secrets, record: async (change) => store.recordChange?.(change) });
        const auth = createAuth({ users, now, secondFactor: mfa, sessionHours: async () => (await settings.get()).sessionHours });
        const accountSettings = createAccountSettings(store.db, users, mfa, { now });
        const preferences = createPreferences(store.db), coordinator = createWriteCoordinator();
        const currency = await createCurrency({ db: store.db, fetcher: currencyFetch, now, coordinator, displayCurrency: async () => (await settings.get()).displayCurrency });
        store.setRules(async () => preferences.get('rules'), { now });
        const csvProfiles = createCsvProfiles(store.db);
        const audit = createAudit(store);
        const ssoAccounts=createSsoStore({store,secrets,now,onRevoke:id=>mfa.invalidate(id),allowLoopback:ssoAllowLoopback&&!production});
        const sso=createSso({accounts:ssoAccounts,auth,mfa,now,fetcher:ssoFetch,allowLoopback:ssoAllowLoopback&&!production});
        store.withActor = async (actor, job) => audit.wrap(actor, job);
        const removeProfile = csvProfiles.remove;
        csvProfiles.remove = async (id) => store.transaction(async () => { const before = await csvProfiles.get(id), result = await removeProfile(id); await audit.record({ entity: 'csvProfiles', id, action: 'delete', before, after: {} }); return result; });
        for (const [target, method, entity, getBefore] of [[settings, 'update', 'serverSettings', async () => settings.get()], [preferences, 'update', 'preferences', async (args) => preferences.get(args[0])], [csvProfiles, 'save', 'csvProfiles', async (args) => args[1] ? await csvProfiles.get(args[1]) : null], [accountSettings, 'profile', 'account', async (args) => users.get(args[0])], [accountSettings, 'preferences', 'accountPreferences', async (args) => accountSettings.preferences(args[0])]]) {
            const original = target[method];
            target[method] = async (...args) => {
                if ((target === accountSettings && !args[1]))
                    return original(...args);
                return store.transaction(async () => { const before = await getBefore(args), after = await original(...args); await audit.record({ entity, id: target === preferences ? args[0] : after.id ?? args[0], action: before ? 'update' : 'create', before, after }); return after; });
            };
        }
        const attachments = createAttachments(store, dataDir, async () => settings.get());
        const backups = await createBackups({ store, dataDir, coordinator, clock: { now }, preferences, version });
        store.settings = settings;
        const mail = createMail({ store, secrets, dataDir, preferences, clock: { now }, coordinator }), notifications = createNotifications({ store, preferences, mail, clock: { now } });
        const collaboration = await createCollaboration({ store, users, preferences, now, dataDir, limits: async () => settings.get() });
        const returnWorkflow = createReturnWorkflow({ store, users, now });
        const disposals=createDisposals({store,now,timezone:async()=>(await preferences.get('rules')).timezone});
        const jobs = createJobs({ store, preferences, backups, coordinator, clock: { now }, startImmediately: !initialMaintenance, onTick: async () => { await coordinator.run(async () => {await ssoAccounts.prune();await notifications.checkOverdue();}); await mail.tick(); } });
        const diagnostics = createDiagnostics({ dbPath: dataDir, dataDir, version, network, backups, jobs, store, settings, mail, now });
        const versionCheck = createVersionCheck({ version, fetcher: versionFetch, now });
        const inAppUpdater = createInAppUpdater({ version, updater: updateService, coordinator, backups, verifyIdentity: accountSettings.verifyIdentity, now });
        const startedAt = Date.now();
        const settingsBody = async () => ({ settings: await settings.get(), currency: currency.read((await settings.get()).displayCurrency), activeNetwork: network, restartRequired: JSON.stringify(await settings.network()) !== JSON.stringify(network), server: { host, nodeVersion: process.version, version, uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000), production } });
        let maintenance = initialMaintenance, startupMaintenance = initialMaintenance;
        const server = createServer(async (req, res) => {
            const access = resolveRequestAccess(req, { secureCookies, publicOrigin });
            const cookieName = access.cookieName;
            const cookie = (token, maxAge) => `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${access.secure ? '; Secure' : ''}`;
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('X-Frame-Options', 'DENY');
            res.setHeader('Referrer-Policy', 'same-origin');
            res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; font-src 'self' data: blob:; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
            if (access.secure)
                res.setHeader('Strict-Transport-Security', 'max-age=31536000');
            function json(value, status = 200) {
                res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
                res.end(JSON.stringify(value));
            }
            try {
                const path = new URL(req.url, 'http://localhost').pathname;
                const method = req.method;
                const isWrite = !['GET', 'HEAD'].includes(method);
                if (isWrite && existsSync(join(dataDir, UPDATE_MARKER)))
                    throw new InputError('Update läuft. Änderungen sind bis zum Abschluss gesperrt.', 503);
                if (maintenance && !['GET', 'HEAD'].includes(method))
                    throw new InputError('Wiederherstellung läuft. Bitte kurz warten.', 503);
                if (leaseLost || !lease.held)
                    throw new InputError('Datenbankverbindung unterbrochen. Server wird neu verbunden.', 503);
                if (path === '/health' && method === 'GET') {
                    await store.db.query('SELECT 1');
                    return json({ ok: true, version,databaseEngine: 'postgresql', maintenance: startupMaintenance });
                }
                if (startupMaintenance)
                    throw new InputError('Datenbankumstellung wird geprüft. Bitte kurz warten.', 503);
                const token = String(req.headers.cookie ?? '').split(';').map(c => c.trim()).find(c => c.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
                const currentSession = async () => auth.getSession(token, true, access.scope);
                if (!path.startsWith('/api/')) {
                    const asset = files.get(path);
                    if (!asset || !['GET', 'HEAD'].includes(method))
                        throw new InputError('Seite nicht gefunden.', 404);
                    const privatePage = asset[1] === 'text/html' && !['/login', '/login/'].includes(path);
                    const toLogin = () => { res.writeHead(302, { 'Location': loginPathFor(req.url), 'Cache-Control': 'private, no-store', 'Vary': 'Cookie' }); res.end(); };
                    if (privatePage && !await currentSession())
                        return toLogin();
                    const privateAsset = !['text/html', 'text/css', 'image/svg+xml'].includes(asset[1]) && path !== '/kofi.avif' && !publicScripts.has(path);
                    if (privateAsset && !await currentSession())
                        throw new InputError('Bitte zuerst anmelden.', 401);
                    const content = await readFile(fileURLToPath(new URL(asset[0], root)));
                    if (privatePage && !await currentSession())
                        return toLogin();
                    if (privateAsset && !await currentSession())
                        throw new InputError('Bitte zuerst anmelden.', 401);
                    res.writeHead(200, { 'Content-Type': `${asset[1]}; charset=utf-8`, 'Cache-Control': privateAsset || asset[1] === 'text/html' ? 'private, no-store' : 'no-cache', ...(privateAsset || privatePage ? { 'Vary': 'Cookie' } : {}) });
                    return res.end(method === 'HEAD' ? undefined : content);
                }
                const session = await currentSession();
                const anonymousAction = ['/api/login', '/api/setup', '/api/login/mfa', '/api/login/mfa/setup', '/api/login/mfa/verify', '/api/login/mfa/confirm'].includes(path);
                const ip = clientAddress(req);
                const ssoOrigin=publicOrigin||(ssoAllowLoopback&&!production&&access.local?access.expectedOrigin:'');
                const ssoRun=job=>coordinator.run(async()=>{if(maintenance||existsSync(join(dataDir,UPDATE_MARKER))||leaseLost||!lease.held)throw new InputError('Serverwartung läuft. Bitte kurz warten.',503);return job();});
                if(await handleSsoPublic({req,res,path,method,json,body:()=>jsonBody(req),accounts:ssoAccounts,sso,origin:ssoOrigin,expectedOrigin:access.expectedOrigin,secure:access.secure,scope:access.scope,ip,userAgent:req.headers['user-agent'],currentSession,sessionBody,setSession:async(login,checkpoint)=>{const hours=(await settings.get()).sessionHours;checkpoint();res.appendHeader('Set-Cookie',cookie(login.token,hours*3600));},run:ssoRun,setupRequired:users.setupRequired,allowLoopback:ssoAllowLoopback&&!production}))return;
                async function sessionBody(value) { return { unlocked: !!value, csrfToken: value?.csrfToken ?? null, expiresAt: value?.expiresAt ?? null, user: value?.user ?? null, setupRequired: await users.setupRequired(), version }; }
                async function requireSession() {
                    const current = await currentSession();
                    if (!current)
                        throw new InputError('Bitte zuerst anmelden.', 401);
                    return current;
                }
                async function requireAdmin() {
                    const current = await currentSession();
                    if (!current)
                        throw new InputError('Bitte zuerst anmelden.', 401);
                    if (current.user.role !== 'admin')
                        throw new InputError('Diese Funktion ist nur für Administratoren verfügbar.', 403);
                    return current;
                }
                async function requireAdministration() {
                    const section = path.startsWith('/api/masterdata/') ? 'masterdata' : path.split('/')[3];
                    const key = ADMIN_SECTION_PERMISSIONS[section];
                    if (!key)
                        return requireAdmin();
                    const current = await requireSession();
                    requirePermission(current.user, key);
                    return current;
                }
                async function requireAccess() {
                    if (isWrite && existsSync(join(dataDir, UPDATE_MARKER)))
                        throw new InputError('Update läuft. Änderungen sind bis zum Abschluss gesperrt.', 503);
                    if (maintenance && !['GET', 'HEAD'].includes(method))
                        throw new InputError('Serverwartung läuft. Bitte kurz warten.', 503);
                    const current = await requireSession();
                    if (path.startsWith('/api/admin/') || path.startsWith('/api/users') || isWrite && path.startsWith('/api/masterdata/'))
                        await requireAdministration();
                    if (path.startsWith('/api/import/') || path.startsWith('/api/template/'))
                        requireCapability(current.user, 'import');
                    else if (path.startsWith('/api/export/'))
                        requireCapability(current.user, 'export');
                    const csvKind = path.match(/^\/api\/(export|template)\/(products|returns)$/);
                    if (csvKind)
                        requirePermission(current.user, csvKind[2] + (csvKind[1] === 'export' ? 'Export' : 'Import'));
                    if (/^\/api\/returns\/[1-9]\d*\/attachments$/.test(path))
                        requirePermission(current.user, method === 'POST' ? 'attachmentsUpload' : 'attachmentsView');
                    else if (/^\/api\/attachments\//.test(path))
                        requirePermission(current.user, method === 'DELETE' ? 'attachmentsDelete' : 'attachmentsView');
                    else if (/^\/api\/returns\/[1-9]\d*\/status$/.test(path))
                        requirePermission(current.user, 'returnsStatus');
                    else if (/^\/api\/returns\/[1-9]\d*\/(reopen|handover)$/.test(path)){requirePermission(current.user,'returnsEdit');requirePermission(current.user,'returnsStatus');}
                    else if (path === '/api/returns/bulk/status')
                        requirePermission(current.user, 'returnsStatus');
                    else if (isWrite) {
                        const kind = path.match(/^\/api\/(products|returns)(?:\/[1-9]\d*)?$/)?.[1];
                        if (kind)
                            requirePermission(current.user, kind + (method === 'DELETE' ? 'Delete' : method === 'POST' ? 'Create' : 'Edit'));
                    }
                    if(path.startsWith('/api/disposals')){requirePermission(current.user,'disposalsRead');const action=path.split('/')[4],key=path.startsWith('/api/disposals/import/')?'disposalsImport':path==='/api/disposals/export'?'disposalsExport':method==='GET'?(action==='label'?'disposalsExport':'disposalsRead'):method==='PUT'?'disposalsEdit':action==='approve'?'disposalsApprove':action==='complete'||action==='correct'?'disposalsComplete':action==='cancel'?'disposalsEdit':'disposalsCreate';requirePermission(current.user,key);if(action==='correct')requirePermission(current.user,'disposalsEdit');}
                    return current;
                }
                const withAuthorizedMutation = createMutationGuard(store.db, requireAccess);
                const mutate = async (job) => coordinator.run(async () => { const current = await requireAccess(); return withAuthorizedMutation(current, [], async () => audit.wrap({ id: current.user.id, name: current.user.displayName, source: 'user', ...(path === '/api/import/commit' ? { operationId: randomUUID() } : {}) }, job)); });
                if (method === 'GET' && path === '/api/session')
                    return json(await sessionBody(session));
                if (!anonymousAction)
                    await requireAccess();
                async function body() {
                    const value = await jsonBody(req, ['/api/import/preview', '/api/import/commit','/api/disposals/import/preview','/api/disposals/import/commit'].includes(path) ? MAX_INVENTORY_BYTES * 2 + 100000 : 3000000);
                    if (!anonymousAction) {
                        await requireAccess();
                    }
                    return value;
                }
                if (isWrite) {
                    if (!anonymousAction && !session)
                        throw new InputError('Bitte zuerst anmelden.', 401);
                    if (req.headers.origin !== access.expectedOrigin)
                        throw new InputError('Diese Anfrage ist nicht erlaubt. Prüfe die eingestellte Domain, das Protokoll und den Port in den Servereinstellungen sowie die Host-/HTTPS-Weiterleitung des Reverse Proxys.', 403);
                    if (!anonymousAction && req.headers['x-csrf-token'] !== session.csrfToken)
                        throw new InputError('Sitzung ungültig. Bitte erneut anmelden.', 403);
                }
                if(await handleSsoAdmin({path,method,body,json,accounts:ssoAccounts,sso,requireAdmin,verifyIdentity:accountSettings.verifyIdentity,mutate,publicOrigin:ssoOrigin}))return;
                if (method==='GET'&&path==='/api/account/sso')return json(await ssoAccounts.identities((await requireSession()).user.id));
                if (await handleRestoreRoute({ req, res, path, method, runtime, backups, body, json, coordinator, owner: async () => { const current = await requireAdmin(); return { userId: current.user.id, sessionId: current.id, authVersion: (await users.credentialsById(current.user.id)).authVersion }; }, checkOwner: async (old) => {
                        const current = await requireAdmin();
                        if (current.user.id !== old.userId || current.id !== old.sessionId || (await users.credentialsById(old.userId)).authVersion !== old.authVersion)
                            throw new InputError('Kontozugang wurde geändert. Bitte erneut anmelden.', 401);
                    }, verifyIdentity: accountSettings.verifyIdentity, beginMaintenance: () => {
                        if (maintenance)
                            throw new InputError('Eine Wiederherstellung läuft bereits.', 409);
                        maintenance = true;
                        return () => { maintenance = false; };
                    }, actor: async () => { const current = await requireAdmin(); return { id: current.user.id, name: current.user.displayName, source: 'user' }; } }))
                    return;
                if (await handleCollaborationRoute({ req, res, path, method, query: Object.fromEntries(new URL(req.url, 'http://localhost').searchParams), body, json, user: async () => (await requireAccess()).user, mutate, collaboration }))
                    return;
                if(await handleDisposalRoute({path,method,query:Object.fromEntries(new URL(req.url,'http://localhost').searchParams),body,json,user:async()=>(await requireAccess()).user,mutate,disposals,store,now}))return;
                if (await handleReturnLabelRoute({ path, method, json, user: async () => (await requireAccess()).user, store }))
                    return;
                if (await handleReturnWorkflowRoute({ path, method, query: new URL(req.url, 'http://localhost').searchParams, body, json, user: async () => (await requireAccess()).user, mutate, workflow: returnWorkflow }))
                    return;
                if (method === 'POST' && path === '/api/setup') {
                    if (!await users.setupRequired())
                        throw new InputError('Die Ersteinrichtung ist bereits abgeschlossen.', 409);
                    const setupInput = await jsonBody(req);
                    const account = await coordinator.run(async () => users.createFirst(setupInput)), login = await auth.startSession(account.id, { accessScope: access.scope });
                    res.setHeader('Set-Cookie', cookie(login.token, (await settings.get()).sessionHours * 60 * 60));
                    return json(await sessionBody(login), 201);
                }
                if (method === 'POST' && path === '/api/login') {
                    sso.invalidate(ssoBrowserToken(req,access.secure,access.scope));
                    const body = await jsonBody(req);
                    const login = await auth.login(body, ip, req.headers['user-agent'], access.scope);
                    if (!login.token)
                        return json(login);
                    res.setHeader('Set-Cookie', cookie(login.token, (await settings.get()).sessionHours * 60 * 60));
                    return json(await sessionBody(login));
                }
                async function issueMfaSession(login,checkpoint,challengeId){try{sso.registerChallengeSession(challengeId,login);const hours=(await settings.get()).sessionHours,payload=await sessionBody(login);checkpoint();res.setHeader('Set-Cookie',cookie(login.token,hours*3600));return json(payload);}catch(error){auth.logout(login.token);throw error;}}
                async function fullLogin(userId,checkpoint=()=>{},challengeId) {checkpoint();auth.logoutAll(userId);const login=await auth.startSession(userId,{mfaVerified:true,userAgent:req.headers['user-agent'],accessScope:access.scope});return issueMfaSession(login,checkpoint,challengeId);}
                if (method === 'POST' && path.startsWith('/api/login/mfa')) {
                    const input = await body();
                    const checkpoint=sso.challengeCheckpoint(input.challengeId,ssoBrowserToken(req,access.secure,access.scope));
                    return await coordinator.run(async () => {
                        checkpoint();
                        if (maintenance)
                            throw new InputError('Wiederherstellung läuft. Bitte kurz warten.', 503);
                        if (path === '/api/login/mfa') {
                            const result = await mfa.verifyChallenge(input.challengeId, input.code, ip);
                            const login = await auth.startSession(result.userId, { expectedAuthVersion: result.authVersion, mfaVerified: true, userAgent: req.headers['user-agent'], accessScope: access.scope });
                            return issueMfaSession(login,checkpoint,input.challengeId);
                        }
                        const proof = await mfa.proofForEnrollment(input.challengeId, ip);
                        if (path.endsWith('/setup')){const value=await mfa.beginEnrollment(proof);checkpoint();return json(value);}
                        if (path.endsWith('/verify')){const value=await mfa.verifyEnrollment(proof,input.enrollmentId,input.code);checkpoint();return json(value);}
                        if (path.endsWith('/confirm')) {
                            await mfa.confirmEnrollment(proof, input.confirmationId, input.saved,checkpoint);
                            return fullLogin(proof.userId,checkpoint,input.challengeId);
                        }
                    });
                }
                if (path === '/api/account/profile') {
                    if (method === 'GET')
                        return json(await accountSettings.profile((await requireSession()).user.id));
                    if (method === 'PUT') {
                        const input = await body();
                        return json(await mutate(async () => accountSettings.profile((await requireSession()).user.id, input)));
                    }
                }
                if (path === '/api/account/preferences') {
                    if (method === 'GET')
                        return json(await accountSettings.preferences((await requireSession()).user.id));
                    if (method === 'PUT') {
                        const input = await body();
                        return json(await mutate(async () => accountSettings.preferences((await requireSession()).user.id, input)));
                    }
                }
                if (path === '/api/account/sessions' && method === 'GET')
                    return json(await auth.listSessions((await requireSession()).user.id, token));
                if (path === '/api/account/sessions/revoke' && method === 'POST') {
                    const input = await body();
                    if (!['all', 'others'].includes(input.mode) && typeof input.id !== 'string')
                        throw new InputError('Bitte Sitzung oder Widerrufsart auswählen.');
                    return await mutate(async () => {
                        const current = await requireSession();
                        await accountSettings.verifyIdentity(current.user.id, input.password, input.factor, requireSession);
                        await store.transaction(async () => { auth.revoke(current.user.id, input, token); await audit.record({ entity: 'users', id: current.user.id, action: 'sessionsRevoke' }); });
                        if (input.mode === 'all')
                            res.setHeader('Set-Cookie', cookie('', 0));
                        return json({ ok: true });
                    });
                }
                if (path === '/api/account/mfa' && method === 'GET')
                    return json(await mfa.status((await requireSession()).user.id));
                if (path.startsWith('/api/account/mfa/') && method === 'POST') {
                    const input = await body();
                    return await mutate(async () => {
                        const current = await requireSession(), proof = { userId: current.user.id, scope: 'account', id: current.id };
                        if (path.endsWith('/setup')) {
                            await accountSettings.verifyIdentity(proof.userId, input.password, input.factor, requireSession);
                            const result = await mfa.beginEnrollment(proof);
                            await requireSession();
                            return json(result);
                        }
                        if (path.endsWith('/verify'))
                            return json(await mfa.verifyEnrollment(proof, input.enrollmentId, input.code));
                        if (path.endsWith('/confirm')) {
                            await mfa.confirmEnrollment(proof, input.confirmationId, input.saved);
                            return fullLogin(proof.userId);
                        }
                        if (path.endsWith('/disable')) {
                            await accountSettings.verifyIdentity(proof.userId, input.password, input.factor, requireSession);
                            await mfa.disable(proof.userId);
                            return fullLogin(proof.userId);
                        }
                        if (path.endsWith('/recovery-codes')) {
                            await accountSettings.verifyIdentity(proof.userId, input.password, input.factor, requireSession);
                            if (!(await mfa.status(proof.userId)).enabled)
                                throw new InputError('Bitte zuerst 2FA aktivieren.');
                            return json({ recoveryCodes: await mfa.replaceRecoveryCodes(proof.userId) });
                        }
                        throw new InputError('Endpunkt nicht gefunden.', 404);
                    });
                }
                const resetMfaPath = path.match(/^\/api\/users\/([1-9]\d*)\/mfa\/reset$/);
                if (resetMfaPath && method === 'POST') {
                    await requireAdmin();
                    const input = await body();
                    return await mutate(async () => {
                        const current = await requireAdmin(), id = Number(resetMfaPath[1]);
                        if (input.confirmed !== true || id === current.user.id)
                            throw new InputError('Für das eigene Konto bitte die Kontoeinstellungen verwenden. Reset eines anderen Kontos ausdrücklich bestätigen.');
                        if (!await users.get(id))
                            throw new InputError('Konto nicht gefunden.', 404);
                        await accountSettings.verifyIdentity(current.user.id, input.password, input.factor, requireAdmin);
                        await mfa.reset(id);
                        auth.logoutAll(id);
                        return json({ ok: true });
                    });
                }
                if (method === 'POST' && path === '/api/logout') {
                    auth.logout(token);
                    res.setHeader('Set-Cookie', cookie('', 0));
                    return json(await sessionBody(null));
                }
                if (path === '/api/admin/settings') {
                    await requireAdmin();
                    if (method === 'GET')
                        return json(await settingsBody());
                    if (method === 'PUT') {
                        const original = await requireAdmin(), identity = (await users.credentialsById(original.user.id)).authVersion, input = settings.validate(await body());
                        const owner = async () => {
                            const current = await requireAdmin();
                            if (current.id !== original.id || current.user.id !== original.user.id || (await users.credentialsById(current.user.id)).authVersion !== identity)
                                throw new InputError('Kontozugang wurde geändert. Bitte erneut anmelden.', 401);
                            return current;
                        };
                        if (input.displayCurrency === 'USD') {
                            const available = await currency.current('USD');
                            await owner();
                            if (available.rate === null)
                                throw new InputError('Der EUR/USD-Wechselkurs ist zurzeit nicht verfügbar. Bitte später erneut versuchen; die Einstellungen wurden nicht gespeichert.', 503);
                        }
                        return json(await mutate(async () => { await owner(); await settings.update(input); return settingsBody(); }));
                    }
                }
                if (path === '/api/admin/currency/refresh' && method === 'POST') {
                    const original = await requireAdmin(), identity = (await users.credentialsById(original.user.id)).authVersion;
                    await body();
                    await currency.refresh((await settings.get()).displayCurrency);
                    const current = await requireAdmin();
                    if (current.id !== original.id || current.user.id !== original.user.id || (await users.credentialsById(current.user.id)).authVersion !== identity)
                        throw new InputError('Kontozugang wurde geändert. Bitte erneut anmelden.', 401);
                    const snapshot = currency.read((await settings.get()).displayCurrency);
                    if (snapshot.rate === null)
                        throw new InputError('Der EUR/USD-Wechselkurs ist zurzeit nicht verfügbar. Bitte später erneut versuchen.', 503);
                    return json(snapshot);
                }
                if (await handleServerRoute({ req, res, path, method, body, json, control: serverControl, logs: serverLog, coordinator, verifyFactor: async (id, factor) => {
                        if ((await mfa.status(id)).enabled)
                            await mfa.verifyFactor(id, factor);
                    }, secondFactorRequired: async (id) => (await mfa.status(id)).enabled, backupBusy: () => backups.status().running,
                    owner: async (original) => {
                        const current = await requireAdmin(), authVersion = (await users.credentialsById(current.user.id)).authVersion;
                        if (original && (current.id !== original.id || current.user.id !== original.user.id || authVersion !== original.authVersion))
                            throw new InputError('Kontozugang wurde geändert. Bitte erneut anmelden.', 401);
                        return { ...current, authVersion };
                    },
                    beginMaintenance: () => {
                        if (maintenance)
                            throw new InputError('Server ist bereits im Wartungsmodus.', 409);
                        maintenance = true;
                        return () => { maintenance = false; };
                    },
                    record: async (job) => { const current = await requireAdmin(); await store.withActor({ id: current.user.id, name: current.user.displayName, source: 'user' }, async () => store.recordChange({ entity: 'server', id: job.id, action: 'restartRequested' })); },
                    nextOrigin: async () => {
                        const desired = await settings.network();
                        if (!access.local)
                            return desired.publicOrigin || access.expectedOrigin;
                        const url = new URL(access.expectedOrigin);
                        if (desired.port && desired.port !== network.port)
                            url.port = String(desired.port);
                        return url.origin;
                    }
                }))
                    return;
                const sectionPaths = { rules: 'rules', backups: 'backups', notifications: 'notifications' };
                if (path === '/api/notifications' && method === 'GET') {
                    const current = await requireSession();
                    return json(await coordinator.run(async () => { const fresh = await requireSession(); await collaboration.pruneNotifications(fresh.user); return notifications.list(current.user.id, Object.fromEntries(new URL(req.url, 'http://localhost').searchParams)); }));
                }
                const notificationRead = path.match(/^\/api\/notifications\/([1-9]\d*|all)\/read$/);
                if (notificationRead && method === 'POST') {
                    await body();
                    return json(await mutate(async () => notifications.markRead((await requireSession()).user.id, notificationRead[1] === 'all' ? 'all' : Number(notificationRead[1]))));
                }
                if (path === '/api/admin/notifications') {
                    await requireAdmin();
                    if (method === 'GET')
                        return json({ ...await mail.config(), outbox: await mail.status() });
                    if (method === 'PUT') {
                        const input = await body();
                        return json(await mutate(async () => { await requireAdmin(); return mail.update(input); }));
                    }
                }
                if (path === '/api/admin/notifications/test' && method === 'POST') {
                    await requireAdmin();
                    await body();
                    const result = await mail.test();
                    await requireAdmin();
                    return json(result);
                }
                if (path === '/api/admin/backups/list' && method === 'GET') {
                    await requireAdmin();
                    return json(await backups.list());
                }
                if (path === '/api/admin/backups/create' && method === 'POST') {
                    const current = await requireAdmin();
                    await body();
                    return json(await backups.create({ id: current.user.id, name: current.user.displayName, source: 'user' }, 'manual', requireAdmin), 201);
                }
                const backupDownload = path.match(/^\/api\/admin\/backups\/([\da-f-]+)\/download$/);
                if (backupDownload && method === 'GET') {
                    await requireAdmin();
                    const { meta, stream, size } = await backups.download(backupDownload[1]);
                    try {
                        await requireAdmin();
                        if (res.destroyed) return;
                        res.writeHead(200, { 'Content-Type': 'application/gzip', 'Content-Length': String(size), 'Content-Disposition': `attachment; filename="${meta.filename}"`, 'Cache-Control': 'no-store' });
                        await pipeline(stream, res);
                    } catch (error) {
                        if (!res.headersSent) throw error;
                        if (!['ERR_STREAM_PREMATURE_CLOSE', 'ECONNRESET', 'ABORT_ERR'].includes(error.code))
                            serverLog.write('error', 'Ein Sicherungsdownload wurde wegen eines Lesefehlers abgebrochen. Archiv und Datenträger prüfen.');
                        res.destroy();
                    } finally { stream.destroy(); }
                    return;
                }
                if (path === '/api/admin/diagnostics' && method === 'GET') {
                    await requireAdministration();
                    const result = await diagnostics.read({ refresh: new URL(req.url, 'http://localhost').searchParams.get('refresh') === 'true' });
                    await requireAdministration();
                    return json(result);
                }
                if (path === '/api/admin/version-check') {
                    await requireAdmin();
                    if (method === 'GET')
                        return json(versionCheck.read());
                    if (method === 'POST') {
                        await body();
                        const result = await versionCheck.check();
                        await requireAdmin();
                        return json(result);
                    }
                }
                if (path === '/api/admin/updater' && method === 'GET') {
                    await requireAdmin();
                    const result = await updateService.status();
                    await requireAdmin();
                    return json(result);
                }
                if (path === '/api/admin/updater/start' && method === 'POST') {
                    const original = await requireAdmin(), identity = (await users.credentialsById(original.user.id)).authVersion, input = await body();
                    const owner = async () => {
                        const current = await requireAdmin();
                        if (current.id !== original.id || current.user.id !== original.user.id || (await users.credentialsById(current.user.id)).authVersion !== identity)
                            throw new InputError('Kontozugang wurde geändert. Bitte erneut anmelden.', 401);
                        return current;
                    };
                    const result = await inAppUpdater.start(input, { owner, cancelled: () => res.destroyed, beginMaintenance: () => {
                            if (maintenance)
                                throw new InputError('Der Server ist bereits im Wartungsmodus.', 409);
                            maintenance = true;
                            return () => { maintenance = false; };
                        }, record: async (change) => store.withActor({ id: original.user.id, name: original.user.displayName, source: 'user' }, async () => store.recordChange({ entity: 'updates', id: change.id, action: 'requested', after: change })) });
                    await requireAdmin();
                    return json(result, 202);
                }
                if (path === '/api/admin/audit' && method === 'GET') {
                    const current = await requireAdministration();
                    return json(await audit.list(Object.fromEntries(new URL(req.url, 'http://localhost').searchParams), { masterdataManage: hasPermission(current.user, 'masterdataManage') }));
                }
                if (path === '/api/admin/audit/actors' && method === 'GET') {
                    await requireAdministration();
                    return json(await audit.actors());
                }
                const profilePath = path.match(/^\/api\/admin\/csv-profiles(?:\/([1-9]\d*))?$/);
                if (profilePath) {
                    await requireAdministration();
                    const id = profilePath[1] ? Number(profilePath[1]) : undefined;
                    if (method === 'GET')
                        return json(id ? await csvProfiles.get(id) : await csvProfiles.list());
                    if (method === 'POST' && !id || method === 'PUT' && id) {
                        const input = await body();
                        return json(await mutate(async () => { await requireAdministration(); return csvProfiles.save(input, id); }), id ? 200 : 201);
                    }
                    if (method === 'DELETE' && id)
                        return json(await mutate(async () => { await requireAdministration(); return csvProfiles.remove(id); }));
                }
                if (path === '/api/import/profiles' && method === 'GET') {
                    const current = await requireSession();
                    return json((await csvProfiles.list()).filter(profile => hasPermission(current.user, profile.kind + 'Import')));
                }
                const preferencePath = path.match(/^\/api\/admin\/(rules|backups|notifications)$/);
                if (preferencePath) {
                    await requireAdministration();
                    const section = sectionPaths[preferencePath[1]];
                    if (method === 'GET')
                        return json(await preferences.get(section));
                    if (method === 'PUT') {
                        const input = await body();
                        return json(await mutate(async () => { await requireAdministration(); return preferences.update(section, input); }));
                    }
                }
                if (path === '/api/config' && method === 'GET') {
                    await currency.current((await settings.get()).displayCurrency);
                    await requireAccess();
                    const { uploadMaxMb, maxFilesPerReturn } = await settings.get();
                    return json({ uploadMaxMb, maxFilesPerReturn, rules: await preferences.get('rules'), currency: currency.read((await settings.get()).displayCurrency) });
                }
                if (path === '/api/currency' && method === 'GET') {
                    const query = new URL(req.url, 'http://localhost').searchParams, values = query.getAll('display');
                    if (values.length > 1 || values.length === 1 && !['EUR', 'USD'].includes(values[0]))
                        throw new InputError('Anzeigewährung muss EUR oder USD sein.');
                    const display = values[0] ?? (await settings.get()).displayCurrency;
                    await currency.current(display);
                    await requireAccess();
                    return json(currency.read(display));
                }
                if (path === '/api/users') {
                    await requireAdmin();
                    if (method === 'GET')
                        return json(await Promise.all((await users.list()).map(async (user) => { const factor = await mfa.status(user.id); return { ...user, mfaEnabled: factor.enabled, mfaRequired: factor.enrollmentRequired }; })));
                    if (method === 'POST') {
                        const value = await body();
                        return json(await mutate(async () => users.create(value, requireAdmin)), 201);
                    }
                }
                const userPath = path.match(/^\/api\/users\/([1-9]\d*)$/);
                if (userPath) {
                    await requireAdmin();
                    const id = Number(userPath[1]);
                    if (!Number.isSafeInteger(id))
                        throw new InputError('Ungültige ID.');
                    if (method === 'PUT') {
                        const value = await body();
                        return json(await mutate(async () => users.update(id, value, requireAdmin)));
                    }
                    if (method === 'DELETE') {
                        const value = await body();
                        return json(await mutate(async () => {
                            const current = await requireAdmin(), target = await users.get(id);
                            if (!target)
                                throw new InputError('Konto nicht gefunden.', 404);
                            if (value.confirmed !== true)
                                throw new InputError('Bitte die Kontolöschung bestätigen.');
                            if (typeof value.username !== 'string' || value.username.trim().toLowerCase() !== target.username.toLowerCase())
                                throw new InputError('Der Benutzername passt nicht zum ausgewählten Konto.');
                            await accountSettings.verifyIdentity(current.user.id, value.password, value.factor, requireAdmin);
                            const result = await users.remove(id, current.user.id, requireAdmin);
                            await mfa.invalidate(id);
                            auth.logoutAll(id);
                            return result;
                        }));
                    }
                }
                if (method === 'POST' && path === '/api/account/password') {
                    const value = await body(), current = await requireSession();
                    await mutate(async () => { await accountSettings.verifyIdentity(current.user.id, value.currentPassword, value.factor, requireSession); await users.changePassword(current.user.id, value.currentPassword, value.newPassword, requireSession); await mfa.invalidate(current.user.id); auth.logoutAll(current.user.id); });
                    auth.logout(token);
                    res.setHeader('Set-Cookie', cookie('', 0));
                    return json(await sessionBody(null));
                }
                const attachmentList = path.match(/^\/api\/returns\/([1-9]\d*)\/attachments$/);
                if (attachmentList) {
                    const id = Number(attachmentList[1]);
                    if (!Number.isSafeInteger(id))
                        throw new InputError('Ungültige ID.');
                    if (method === 'GET')
                        return json(await attachments.list(id));
                    if (method === 'POST')
                        return json(await attachments.upload(id, req, requireAccess, async (job) => mutate(job)), 201);
                }
                const attachmentPath = path.match(/^\/api\/attachments\/([1-9]\d*)(?:\/(preview|download))?$/);
                if (attachmentPath) {
                    const id = Number(attachmentPath[1]);
                    if (!Number.isSafeInteger(id))
                        throw new InputError('Ungültige ID.');
                    if (method === 'DELETE' && !attachmentPath[2])
                        return json(await mutate(async () => attachments.remove(id)));
                    if (['GET', 'HEAD'].includes(method) && attachmentPath[2]) {
                        const { item, bytes } = await attachments.read(id), mode = attachmentPath[2] === 'download' ? 'attachment' : 'inline';
                        await requireAccess();
                        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
                        res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'self'; base-uri 'none'");
                        res.writeHead(200, { 'Content-Type': item.mediaType, 'Content-Length': item.size, 'Cache-Control': 'no-store', 'Content-Disposition': `${mode}; filename="datei${item.mediaType === 'application/pdf' ? '.pdf' : item.mediaType === 'image/png' ? '.png' : item.mediaType === 'image/webp' ? '.webp' : '.jpg'}"; filename*=UTF-8''${encodeURIComponent(item.originalName)}` });
                        return res.end(method === 'HEAD' ? undefined : bytes);
                    }
                }
                if (method === 'GET' && path === '/api/masterdata') {
                    const values = await store.listMasterData();
                    if (!hasPermission((await requireSession()).user, 'masterdataManage'))
                        for (const entries of Object.values(values))
                            for (const item of entries) {
                                delete item.code;
                                delete item.notes;
                                delete item.nameKey;
                            }
                    return json(values);
                }
                const masterMatch = path.match(/^\/api\/masterdata\/([a-z]+|[1-9]\d*)$/);
                if (masterMatch) {
                    if (isWrite)
                        await requireAdministration();
                    const key = masterMatch[1];
                    if (method === 'POST' && /^[a-z]+$/.test(key)) {
                        const value = await body();
                        return json(await mutate(async () => { await requireAdministration(); return store.createMasterData(key, value); }), 201);
                    }
                    if (/^\d+$/.test(key)) {
                        const id = Number(key);
                        if (!Number.isSafeInteger(id))
                            throw new InputError('Ungültige ID.');
                        if (method === 'PUT') {
                            const value = await body();
                            return json(await mutate(async () => { await requireAdministration(); return store.updateMasterData(id, value); }));
                        }
                        if (method === 'DELETE')
                            return json(await mutate(async () => { await requireAdministration(); return store.deleteMasterData(id); }));
                    }
                }
                const statusPath = path.match(/^\/api\/returns\/([1-9]\d*)\/status$/);
                if (statusPath && method === 'PUT') {
                    const input = await body();
                    if (Object.keys(input).some(key => !['status', 'statusId'].includes(key)) || Object.keys(input).length !== 1)
                        throw new InputError('Bitte ausschließlich den neuen Status angeben.');
                    return json(await mutate(async () => {
                        const id = Number(statusPath[1]), old = await store.getReturn(id);
                        if (!old)
                            throw new InputError('Retoure nicht gefunden.', 404);
                        const value = { ...old, ...input };
                        if (Object.hasOwn(input, 'status'))
                            delete value.statusId;
                        return store.updateReturn(id, value);
                    }));
                }
                const productImageMatch = path.match(/^\/api\/products\/([1-9]\d*)\/image$/);
                if (productImageMatch && ['GET', 'HEAD'].includes(method)) {
                    const id = Number(productImageMatch[1]);
                    if (!Number.isSafeInteger(id))
                        throw new InputError('Ungültige ID.');
                    const image = (await store.db.query("SELECT mediaType,data FROM product_images WHERE productId=$1", [id])).rows[0];
                    if (!image || !['image/png', 'image/jpeg', 'image/webp'].includes(image.mediaType))
                        throw new InputError('Produktbild nicht gefunden.', 404);
                    res.writeHead(200, { 'Content-Type': image.mediaType, 'Content-Length': image.data.length, 'Cache-Control': 'private, no-store', 'Vary': 'Cookie' });
                    return res.end(method === 'HEAD' ? undefined : image.data);
                }
                for (const kind of ['products', 'returns']) {
                    if (path === `/api/${kind}`) {
                        if (method === 'GET') {
                            if (kind === 'products')
                                return json(await store.listProducts());
                            const page=await store.pageReturns(new URL(req.url,'http://localhost').searchParams),rows=page?.items??await store.listReturns();
                            const counts = new Map((rows.length?(await store.db.query("SELECT returnId,COUNT(*) AS total FROM attachments WHERE returnId=ANY($1::bigint[]) GROUP BY returnId", [rows.map(row=>row.id)])).rows:[]).map(row => [row.returnId, Number(row.total)]));
                            const enriched=await returnWorkflow.enrichReturns(rows,(await requireSession()).user),items=returnWorkflow.visibleRows((await requireSession()).user,enriched).map(item=>({...item,attachmentCount:counts.get(item.id)??0}));return json(page?{...page,items}:items);
                        }
                        if (method === 'POST') {
                            const value = await body();
                            return json(await mutate(async () => kind === 'products' ? await store.createProduct(value) : await store.createReturn(value)), 201);
                        }
                    }
                    const match = path.match(new RegExp(`^/api/${kind}/([1-9]\\d*)$`));
                    if (match) {
                        const id = Number(match[1]);
                        if (!Number.isSafeInteger(id))
                            throw new InputError('Ungültige ID.');
                        if (method === 'GET') {
                            const item = kind === 'products' ? await store.getProduct(id) : await store.getReturn(id);
                            if (!item)
                                throw new InputError('Eintrag nicht gefunden.', 404);
                            if(kind==='returns'){const enriched=await returnWorkflow.enrichReturns([item],(await requireSession()).user),attachmentCount=Number((await store.db.query('SELECT COUNT(*) AS total FROM attachments WHERE returnId=$1',[id])).rows[0].total);return json({...returnWorkflow.visibleRows((await requireSession()).user,enriched)[0],attachmentCount});}return json(item);
                        }
                        if (method === 'PUT') {
                            const value = await body();
                            return json(await mutate(async () => {
                                await checkRecordRevision(store.db,kind,id,expectedRevision(value?.revision));
                                if (kind === 'products') {
                                    const prepared = await store.prepareProduct(value, id);
                                    if ((await store.getProduct(id)).active && !prepared.active)
                                        requirePermission((await requireSession()).user, 'productsDelete');
                                    return store.updateProduct(id, value);
                                }
                                const prepared = await store.prepareReturn(value, id);
                                if (prepared.statusId !== (await store.getReturn(id)).statusId)
                                    requirePermission((await requireSession()).user, 'returnsStatus');
                                return store.updateReturn(id, value);
                            }));
                        }
                        if (method === 'DELETE') {
                            const value=await body();
                            return json(await mutate(async () => {
                                const revision=expectedRevision(value?.revision);
                                await checkRecordRevision(store.db,kind,id,revision);
                                if (kind === 'products')
                                    return store.deleteProduct(id,{expectedRevision:revision});
                                if ((await attachments.list(id)).length)
                                    requirePermission((await requireSession()).user, 'attachmentsDelete');
                                return attachments.removeReturn(id,{expectedRevision:revision});
                            }));
                        }
                    }
                    if (method === 'GET' && [`/api/export/${kind}`, `/api/template/${kind}`].includes(path)) {
                        const columns = kind === 'products' ? PRODUCT_COLUMNS : RETURN_COLUMNS;
                        const data = path.includes('/template/') ? [] : (kind === 'products' ? await store.listProducts() : await returnWorkflow.selectedExport(new URL(req.url, 'http://localhost').searchParams));
                        const rows = data.map(item => Object.keys(columns).map(key => key === 'price' ? (item.priceCents / 100).toFixed(2).replace('.', ',') : key === 'active' ? (('active' in item && item.active) ? 'ja' : 'nein') : item[key]));
                        res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${kind === 'products' ? 'produkte' : 'retouren'}${path.includes('/template/') ? '-vorlage' : ''}.csv"`, 'Cache-Control': 'no-store' });
                        return res.end(exportCsv(Object.values(columns), rows));
                    }
                }
                if (method === 'GET' && path === '/api/export/all') {
                    const current = await requireAccess();
                    requirePermission(current.user, 'productsExport');
                    requirePermission(current.user, 'returnsExport');
                    const data = await exportInventory(store);
                    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="retourenboard-bestand.json"', 'Cache-Control': 'no-store' });
                    return res.end(JSON.stringify(data));
                }
                if (method === 'POST' && ['/api/import/preview', '/api/import/commit'].includes(path)) {
                    const b = await body();
                    const operation = path.endsWith('preview') ? previewImport : commitImport;
                    const run = async () => {
                        const importer = (await requireAccess()).user;
                        if (b.kind === 'all' || (b.kind === undefined || b.kind === 'auto') && isInventoryText(b.text)) {
                            requirePermission(importer, 'productsImport');
                            requirePermission(importer, 'returnsImport');
                            if (b.profileId !== undefined)
                                throw new InputError('CSV-Profile können nicht auf Bestandsdateien angewendet werden.');
                            if (b.createMissingMasterdata === true)
                                requirePermission(importer, 'masterdataManage');
                            const options = {clearEmptyFields:b.clearEmptyFields??false,expectedState:b.expectedState, duplicates: b.duplicates ?? (hasPermission(importer, 'productsEdit') && hasPermission(importer, 'returnsEdit') ? 'update' : 'skip'), createMissingMasterdata: b.createMissingMasterdata ?? hasPermission(importer, 'masterdataManage') };
                            const authorize = async (preview) => {
                                const current = await requireAccess();
                                requirePermission(current.user, 'productsImport');
                                requirePermission(current.user, 'returnsImport');
                                if (preview.newMasterdata.length)
                                    requirePermission(current.user, 'masterdataManage');
                                for (const row of preview.rows)
                                    if (row.action !== 'skip') {
                                        requirePermission(current.user, row.kind + (row.action === 'update' ? 'Edit' : 'Create'));
                                        if (row.kind === 'products' && row.action === 'update' && (await store.getProduct(row.id)).active && !row.data.active)
                                            requirePermission(current.user, 'productsDelete');
                                        if (row.kind === 'returns' && row.action === 'update' && (await store.getReturn(row.id)).statusId !== row.data.statusId)
                                            requirePermission(current.user, 'returnsStatus');
                                    }
                            };
                            if (path.endsWith('preview')) {
                                const preview = await previewInventoryImport(store, b.text, options);
                                await authorize(preview);
                                return preview;
                            }
                            return commitInventoryImport(store, b.text, options, authorize);
                        }
                        let profile;
                        if (b.profileId !== undefined) {
                            if (!Number.isSafeInteger(b.profileId))
                                throw new InputError('Ungültiges CSV-Profil.');
                            profile = await csvProfiles.get(b.profileId);
                            if (profile.revision !== b.profileRevision)
                                throw new InputError('CSV-Profil wurde geändert. Bitte Vorschau erneut prüfen.', 409);
                        }
                        const automatic = b.kind === undefined || b.kind === 'auto';
                        const kind = automatic ? (profile?.kind ?? inferCsvKind(parseCsv(b.text, { delimiter: b.delimiter ?? 'auto' }).headers, null)) : b.kind;
                        if (!kind)
                            throw new InputError('Der Importtyp konnte nicht automatisch erkannt werden. Bitte Produkte oder Retouren auswählen.');
                        if (!['products', 'returns'].includes(kind))
                            throw new InputError('Unbekannter Importtyp.');
                        requirePermission(importer, kind + 'Import');
                        const authorize = async (preview) => {
                            const current = await requireAccess();
                            requirePermission(current.user, kind + 'Import');
                            if (preview.newProducts?.length)
                                requirePermission(current.user, 'productsCreate');
                            if (preview.newMasterdata?.length)
                                requirePermission(current.user, 'masterdataManage');
                            for (const row of preview.rows)
                                if (row.action !== 'skip') {
                                    requirePermission(current.user, kind + (row.action === 'update' ? 'Edit' : 'Create'));
                                    if (kind === 'products' && row.action === 'update' && (await store.getProduct(row.id)).active && !row.data.active)
                                        requirePermission(current.user, 'productsDelete');
                                    if (kind === 'returns' && row.action === 'update' && (await store.getReturn(row.id)).statusId !== row.data.statusId)
                                        requirePermission(current.user, 'returnsStatus');
                                }
                        };
                        if (b.createMissingMasterdata === true)
                            requirePermission(importer, 'masterdataManage');
                        if (b.createMissingMasterdata !== undefined && typeof b.createMissingMasterdata !== 'boolean')
                            throw new InputError('Ungültige Stammdatenoption.');
                        if (b.createMissingProducts === true)
                            requirePermission(importer, 'productsCreate');
                        if (b.createMissingProducts !== undefined && typeof b.createMissingProducts !== 'boolean')
                            throw new InputError('Ungültige Produktoption.');
                        let mapping = b.mapping, options = {clearEmptyFields:b.clearEmptyFields??false,expectedState:b.expectedState, duplicates: b.duplicates ?? (b.updateExisting !== undefined ? (b.updateExisting ? 'update' : 'error') : kind === 'returns' ? 'skip' : hasPermission(importer, 'productsEdit') ? 'update' : 'skip'), delimiter: b.delimiter ?? 'auto', createMissingMasterdata: b.createMissingMasterdata ?? hasPermission(importer, 'masterdataManage'), createMissingProducts: b.createMissingProducts ?? (kind === 'returns' && hasPermission(importer, 'productsCreate')) };
                        if (profile) {
                            if (profile.kind !== kind)
                                throw new InputError('Profil passt nicht zum Importtyp.');
                            mapping = resolveProfile(profile, parseCsv(b.text, { delimiter: profile.delimiter }).headers);
                            options = { ...options, duplicates: profile.duplicates, delimiter: profile.delimiter };
                        }
                        if (mapping === undefined)
                            mapping = guessCsvMapping(kind, parseCsv(b.text, { delimiter: options.delimiter }).headers);
                        if (path.endsWith('preview')) {
                            const preview = await operation(store, kind, b.text, mapping, options);
                            await authorize(preview);
                            return preview;
                        }
                        return operation(store, kind, b.text, mapping, options, authorize);
                    };
                    return json(path.endsWith('preview') ? await run() : await mutate(run));
                }
                throw new InputError('Endpunkt nicht gefunden.', 404);
            }
            catch (error) {
                if (error.status === 429)
                    res.setHeader('Retry-After', '900');
                if (!(error instanceof InputError))
                    console.error('Serverfehler:', error);
                if (!(error instanceof InputError))
                    serverLog.write('error', 'Eine Serveranfrage ist fehlgeschlagen (HTTP 500). Details im Dienstprotokoll.');
                if (!res.headersSent)
                    json({ error: error instanceof InputError ? error.message : 'Ein Serverfehler ist aufgetreten.' }, error.status ?? 500);
                else
                    res.end();
            }
        });
        server.requestTimeout = 30000;
        server.headersTimeout = 15000;
        if (!initialMaintenance)
            server.once('listening', () => { void currency.startAutomatic(); if (automaticVersionCheck) void versionCheck.startAutomatic(); });
        let closing;
        return { server, store, disposals, users, settings, preferences, currency, coordinator, network, secrets, mfa, sso, ssoAccounts, dataDir, auth, backups, jobs, mail, notifications, collaboration, serverLog,
            async releaseStartupMaintenance() {
                startupMaintenance = false;
                maintenance = false;
                jobs.start();
                void currency.startAutomatic();
                if (automaticVersionCheck)
                    void versionCheck.startAutomatic();
            },
            close: async () => closing ??= await (async () => {
                currency.close();
                versionCheck.close();
                const stopped = new Promise((resolve, reject) => server.close(error => error && error.code !== 'ERR_SERVER_NOT_RUNNING' ? reject(error) : resolve()));
                server.closeIdleConnections();
                try {
                    await jobs.close();
                    await backups.close();
                    await mail.close();
                    await coordinator.close();
                    await stopped;
                }
                finally {
                    attachments.dispose();
                    collaboration.dispose();
                    if(!runtimeLease)await lease.close();
                    await store.close();
                }
            })()
        };
    }
    catch (error) {
        if(!runtimeLease)await lease?.close();
        await opened.close();
        throw error;
    }
}
