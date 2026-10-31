import {createStaticAssetReader,acceptsGzip} from './static-assets.js';
import {createCustomerStatus,customerStatusLimiter} from './customer-status.js';
import {handleCustomerStatusPublic,handleCustomerStatusRoute} from './customer-status-routes.js';
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
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from './store.js';
import { createAuth } from './auth.js';
import {createSsoStore} from './sso-store.js';
import {createSso} from './sso.js';
import {handleSsoPublic,handleSsoAdmin} from './sso-routes.js';
import { createClientAddress } from './client-address.js';
import { resolveRequestAccess } from './request-access.js';
import { loginPathFor } from '../shared/auth-navigation.js';
import { createServerLog } from './server-log.js';
import { createUsers } from './users.js';
import { InputError } from '../shared/model.js';
import { MAX_INVENTORY_BYTES } from '../shared/inventory-file.js';
import { createAttachments } from './attachments.js';
import { createSettings } from './settings.js';
import { createCurrency } from './currency.js';
import { createPreferences } from './preferences.js';
import { requirePermission } from './permissions.js';
import { ADMIN_SECTION_PERMISSIONS } from '../shared/permissions.js';
import { createWriteCoordinator } from './write-coordinator.js';
import { createSecrets } from './secrets.js';
import { createMfa } from './mfa.js';
import { createAccountSettings } from './account-settings.js';
import { createCsvProfiles } from './csv-profiles.js';
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
import { createStaticFileTable, root, version } from './static-files.js';
import { jsonBody } from './request-body.js';
import { requireRoutePermissions } from './route-permissions.js';
import { NOT_HANDLED } from './route-result.js';
import { handleRecordRoute } from './record-routes.js';
import { handleImportExportRoute } from './import-export-routes.js';
import { handleAccountRoute } from './account-routes.js';
import { handleAdminRoute } from './admin-routes.js';
import { handleGeneralRoute } from './general-routes.js';
import { createErrorPages } from './error-page.js';
const staticAssets=createStaticAssetReader();
const { files, publicScripts } = createStaticFileTable();
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
        const customerStatus=createCustomerStatus({store,users,secrets,now}),customerLimit=customerStatusLimiter(now),disposalCustomerStatus=createCustomerStatus({store,users,secrets,now,kind:'disposals'});
        const disposals=createDisposals({store,now,timezone:async()=>(await preferences.get('rules')).timezone});
        const jobs = createJobs({ store, preferences, backups, coordinator, clock: { now }, startImmediately: !initialMaintenance, onTick: async () => { await coordinator.run(async () => {await ssoAccounts.prune();await notifications.checkOverdue();}); await mail.tick(); } });
        const diagnostics = createDiagnostics({ dbPath: dataDir, dataDir, version, network, backups, jobs, store, settings, mail, now });
        const versionCheck = createVersionCheck({ version, fetcher: versionFetch, now });
        const inAppUpdater = createInAppUpdater({ version, updater: updateService, coordinator, backups, verifyIdentity: accountSettings.verifyIdentity, now });
        const startedAt = Date.now();
        const settingsBody = async () => ({ settings: await settings.get(), currency: currency.read((await settings.get()).displayCurrency), activeNetwork: network, restartRequired: JSON.stringify(await settings.network()) !== JSON.stringify(network), server: { host, nodeVersion: process.version, version, uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000), production } });
        let maintenance = initialMaintenance, startupMaintenance = initialMaintenance;
        // Shared by every route that takes the server into maintenance mode; the caller supplies its own conflict message.
        const beginMaintenance = (message) => {
            if (maintenance)
                throw new InputError(message, 409);
            maintenance = true;
            return () => { maintenance = false; };
        };
        const errorPages = createErrorPages(() => readFile(fileURLToPath(new URL('public/error.html', root))));
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
                if(await handleCustomerStatusPublic({path,method,res,json,readPage:()=>readFile(fileURLToPath(new URL('public/customer-status.html',root))),service:customerStatus,limit:customerLimit,ip:clientAddress(req)}))return;
                if(await handleCustomerStatusPublic({path,method,res,json,readPage:()=>readFile(fileURLToPath(new URL('public/customer-status.html',root))),kind:'disposals',service:disposalCustomerStatus,limit:customerLimit,ip:clientAddress(req)}))return;
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
                    const compressible=asset[1].startsWith('text/')||['image/svg+xml','application/javascript','application/json','application/wasm'].includes(asset[1]);
                    const {body:content,encoding}=await staticAssets.read(fileURLToPath(new URL(asset[0], root)),compressible&&acceptsGzip(req.headers['accept-encoding']));
                    if (privatePage && !await currentSession())
                        return toLogin();
                    if (privateAsset && !await currentSession())
                        throw new InputError('Bitte zuerst anmelden.', 401);
                    const vary=[...(privateAsset||privatePage?['Cookie']:[]),...(compressible?['Accept-Encoding']:[])];
                    res.writeHead(200, { 'Content-Type': `${asset[1]}; charset=utf-8`, 'Content-Length': content.length, 'Cache-Control': privateAsset || asset[1] === 'text/html' ? 'private, no-store' : 'no-cache', ...(vary.length?{'Vary':vary.join(', ')}:{}),...(encoding?{'Content-Encoding':encoding}:{}) });
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
                    requireRoutePermissions(current.user, path, method, isWrite);
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
                if(await handleCustomerStatusRoute({path,method,query:new URL(req.url,'http://localhost').searchParams,body,json,user:async()=>(await requireAccess()).user,mutate,service:customerStatus,publicOrigin}))return;
                if(await handleCustomerStatusRoute({path,method,query:new URL(req.url,'http://localhost').searchParams,body,json,user:async()=>(await requireAccess()).user,mutate,kind:'disposals',service:disposalCustomerStatus,publicOrigin}))return;
                if (await handleReturnWorkflowRoute({ path, method, query: new URL(req.url, 'http://localhost').searchParams, body, json, user: async () => (await requireAccess()).user, mutate, workflow: returnWorkflow }))
                    return;
                {const handled = await handleAccountRoute({ req, res, path, method, token, access, ip, cookie, json, body, mutate, requireSession, requireAdmin, sessionBody, isMaintenance: () => maintenance, coordinator, users, auth, mfa, sso, accountSettings, settings, store, audit }); if (handled !== NOT_HANDLED) return;}
                {const handled = await handleAdminRoute({ req, res, path, method, body, json, mutate, requireAdmin, requireAdministration, settings, settingsBody, currency, preferences, users, auth, mfa, accountSettings, store, audit, coordinator, access, backups, mail, diagnostics, versionCheck, updateService, inAppUpdater, csvProfiles, serverControl, serverLog, network, beginMaintenance }); if (handled !== NOT_HANDLED) return;}
                {const handled = await handleGeneralRoute({ req, path, method, body, json, mutate, requireSession, requireAccess, settings, currency, preferences, collaboration, notifications, csvProfiles, coordinator }); if (handled !== NOT_HANDLED) return;}
                {const handled = await handleRecordRoute({ req, res, path, method, isWrite, json, body, mutate, requireAccess, requireSession, requireAdministration, store, attachments, returnWorkflow }); if (handled !== NOT_HANDLED) return;}
                {const handled = await handleImportExportRoute({ req, res, path, method, json, body, mutate, requireAccess, store, csvProfiles, returnWorkflow }); if (handled !== NOT_HANDLED) return;}
                throw new InputError('Endpunkt nicht gefunden.', 404);
            }
            catch (error) {
                if (error.status === 429)
                    res.setHeader('Retry-After', '900');
                if (!(error instanceof InputError))
                    console.error('Serverfehler:', error);
                if (!(error instanceof InputError))
                    serverLog.write('error', 'Eine Serveranfrage ist fehlgeschlagen (HTTP 500). Details im Dienstprotokoll.');
                if (!res.headersSent) {
                    if (!await errorPages.respond(req, res, error))
                        json({ error: error instanceof InputError ? error.message : 'Ein Serverfehler ist aufgetreten.' }, error.status ?? 500);
                }
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
