import { InputError } from '../shared/model.js';
const ranges = {
    uploadMaxMb: [1, 50, 'Dateigröße'], maxFilesPerReturn: [1, 30, 'Dateien pro Retoure'],
    sessionHours: [1, 24, 'Sitzungsdauer'], port: [1024, 65535, 'Interner Port']
};
export function validateOrigin(value) {
    if (typeof value !== 'string' || value.length > 300 || /[\s\\]/.test(value))
        throw new InputError('Bitte eine gültige öffentliche Adresse ohne Leerzeichen eingeben.');
    if (value === '')
        return '';
    let url;
    try {
        url = new URL(value);
    }
    catch {
        throw new InputError('Öffentliche Adresse muss mit http:// oder https:// beginnen.');
    }
    if (!/^https?:\/\//.test(value) || url.username || url.password || url.pathname !== '/' || url.search || url.hash || url.port === '0' || !/^([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?|\[[0-9a-f:]+\])$/i.test(url.hostname))
        throw new InputError('Nur eine HTTP-/HTTPS-Adresse mit Domain oder IP, optionalem Port und ohne Pfad ist erlaubt.');
    return url.origin;
}
export function createSettings(db, defaults, production = false) {
    db.exec('CREATE TABLE IF NOT EXISTS server_settings (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL)');
    const base = { uploadMaxMb: 10, maxFilesPerReturn: 10, sessionHours: 8, port: defaults.port, publicOrigin: defaults.publicOrigin, displayCurrency: 'EUR' };
    function validate(input) {
        const result = {};
        for (const [key, value] of Object.entries(input)) {
            if (key === 'displayCurrency') {
                if (value !== 'EUR' && value !== 'USD')
                    throw new InputError('Anzeigewährung muss EUR oder USD sein.');
                result.displayCurrency = value;
                continue;
            }
            if (key === 'publicOrigin') {
                result.publicOrigin = validateOrigin(value);
                continue;
            }
            const range = ranges[key];
            if (!range)
                throw new InputError('Unbekannte Servereinstellung.');
            if (typeof value !== 'number' || !Number.isInteger(value) || value < range[0] || value > range[1])
                throw new InputError(`${range[2]} muss zwischen ${range[0]} und ${range[1]} liegen.`);
            result[key] = value;
        }
        return result;
    }
    function saved() {
        const row = db.prepare('SELECT value FROM server_settings WHERE id=1').get();
        if (!row)
            return {};
        const value = JSON.parse(row.value);
        if (!value || typeof value !== 'object' || Array.isArray(value))
            throw new Error('Ungültige gespeicherte Servereinstellungen.');
        return validate(value);
    }
    const get = () => ({ ...base, ...saved() });
    function network() {
        const value = saved(), config = get();
        return { port: config.port, publicOrigin: config.publicOrigin, secureCookies: value.publicOrigin === undefined ? defaults.secureCookies : config.publicOrigin.startsWith('https://') };
    }
    function ensureProduction(config) { if (production && (!config.publicOrigin.startsWith('https://') || !config.secureCookies))
        throw new InputError('Produktionsbetrieb benötigt eine öffentliche HTTPS-Adresse und sichere Cookies.'); }
    function write(value) { db.prepare('INSERT INTO server_settings(id,value) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(JSON.stringify(value)); }
    return { get, network, ensureProduction, validate,
        update(input) {
            const patch = validate(input), value = { ...saved(), ...patch };
            const origin = value.publicOrigin ?? base.publicOrigin;
            ensureProduction({ port: value.port ?? base.port, publicOrigin: origin, secureCookies: value.publicOrigin === undefined ? defaults.secureCookies : origin.startsWith('https://') });
            write(value);
            return get();
        },
        resetNetwork() { const value = saved(); delete value.port; delete value.publicOrigin; write(value); } };
}
