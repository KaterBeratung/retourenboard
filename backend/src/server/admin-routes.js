import { pipeline } from 'node:stream/promises';
import { InputError } from '../shared/model.js';
import { hasPermission } from '../shared/permissions.js';
import { handleServerRoute } from './server-routes.js';
import { NOT_HANDLED } from './route-result.js';
export async function handleAdminRoute(ctx) {
    const { req, res, path, method, body, json, mutate, requireAdmin, requireAdministration, settings, settingsBody, currency, preferences, users, auth, mfa, accountSettings, store, audit, coordinator, access, backups, mail, diagnostics, versionCheck, updateService, inAppUpdater, csvProfiles, serverControl, serverLog, network, beginMaintenance } = ctx;
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
        beginMaintenance: () => beginMaintenance('Server ist bereits im Wartungsmodus.'),
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
        const result = await inAppUpdater.start(input, { owner, cancelled: () => res.destroyed, beginMaintenance: () => beginMaintenance('Der Server ist bereits im Wartungsmodus.'), record: async (change) => store.withActor({ id: original.user.id, name: original.user.displayName, source: 'user' }, async () => store.recordChange({ entity: 'updates', id: change.id, action: 'requested', after: change })) });
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
    return NOT_HANDLED;
}
