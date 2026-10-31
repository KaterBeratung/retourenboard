import { InputError } from '../shared/model.js';
import { hasPermission } from '../shared/permissions.js';
import { NOT_HANDLED } from './route-result.js';
export async function handleGeneralRoute(ctx) {
    const { req, path, method, body, json, mutate, requireSession, requireAccess, settings, currency, preferences, collaboration, notifications, csvProfiles, coordinator } = ctx;
    if (path === '/api/notifications' && method === 'GET') {
        const current = await requireSession();
        return json(await coordinator.run(async () => { const fresh = await requireSession(); await collaboration.pruneNotifications(fresh.user); return notifications.list(current.user.id, Object.fromEntries(new URL(req.url, 'http://localhost').searchParams)); }));
    }
    const notificationRead = path.match(/^\/api\/notifications\/([1-9]\d*|all)\/read$/);
    if (notificationRead && method === 'POST') {
        await body();
        return json(await mutate(async () => notifications.markRead((await requireSession()).user.id, notificationRead[1] === 'all' ? 'all' : Number(notificationRead[1]))));
    }
    if (path === '/api/import/profiles' && method === 'GET') {
        const current = await requireSession();
        return json((await csvProfiles.list()).filter(profile => hasPermission(current.user, profile.kind + 'Import')));
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
    return NOT_HANDLED;
}
