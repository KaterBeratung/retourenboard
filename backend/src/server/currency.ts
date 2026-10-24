import type { SqlDatabase } from './database/types.js';
export const CURRENCY_RATE_URL = 'https://api.frankfurter.dev/v2/providers/ecb/rate/eur/usd';
const hourMs = 60 * 60 * 1000, retryMs = 5 * 60 * 1000, dayMs = 24 * hourMs, maxBytes = 32 * 1024;
type DisplayCurrency = 'EUR' | 'USD';
type Rate = {
    rate: number;
    date: string;
    checkedAt: number;
};
type Cache = Rate & {
    lastAttempt: number;
    failed: boolean;
};
type CurrencySnapshot = {
    base: 'EUR';
    display: DisplayCurrency;
    rate: number | null;
    date: string | null;
    checkedAt: number | null;
    stale: boolean;
    status: 'current' | 'cached' | 'unavailable' | 'disabled';
    source: 'ECB · Frankfurter';
};
type Coordinator = {
    run: <T>(job: () => T | Promise<T>) => Promise<T>;
};
function validDate(value: unknown, now: number): value is string {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
        return false;
    const date = Date.parse(`${value}T00:00:00.000Z`);
    return Number.isFinite(date) && new Date(date).toISOString().slice(0, 10) === value && date <= Math.floor(now / dayMs) * dayMs;
}
function validRate(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0.1 && value <= 10; }
async function readQuote(response: Response): Promise<unknown> {
    if (!response.ok || !response.body) {
        await response.body?.cancel();
        throw new Error('Kursquelle nicht verfügbar.');
    }
    const reader = response.body.getReader(), chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done)
                break;
            bytes += value.byteLength;
            if (bytes > maxBytes) {
                await reader.cancel();
                throw new Error('Kursantwort ist zu groß.');
            }
            chunks.push(value);
        }
    }
    finally {
        reader.releaseLock();
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export async function createCurrency({ db, fetcher = fetch, now = Date.now, coordinator, timeoutMs = 4000, displayCurrency = () => 'EUR', schedule = setTimeout, cancel = clearTimeout }: {
    db: SqlDatabase;
    fetcher?: typeof fetch;
    now?: () => number;
    coordinator: Coordinator;
    timeoutMs?: number;
    displayCurrency?: () => DisplayCurrency | Promise<DisplayCurrency>;
    schedule?: (callback: () => any, delay: number) => any;
    cancel?: (timer: any) => void;
}) {
    let cache: Cache | null = null, lastAttempt = -Infinity, failed = false, pending: Promise<void> | null = null, closed = false, controller: AbortController | null = null;
    let automatic = false, automaticRunning = false, usedUSD = false, automaticTimer: any = null;
    const row = (await db.query("SELECT value FROM currency_rates WHERE id=1", [])).rows[0] as {
        value: string;
    } | undefined;
    if (row) {
        try {
            const value = JSON.parse(row.value) as Cache;
            if (value && validRate(value.rate) && validDate(value.date, now()) && Number.isSafeInteger(value.checkedAt) && value.checkedAt >= 0 && value.checkedAt <= now() && Number.isSafeInteger(value.lastAttempt) && value.lastAttempt >= 0 && value.lastAttempt <= now() && typeof value.failed === 'boolean') {
                cache = value;
                lastAttempt = value.lastAttempt;
                failed = value.failed;
            }
        }
        catch { }
    }
    function read(display: DisplayCurrency): CurrencySnapshot {
        const stale = cache ? failed || Math.floor(now() / dayMs) * dayMs - Date.parse(`${cache.date}T00:00:00Z`) > 4 * dayMs : display === 'USD';
        return { base: 'EUR', display, rate: cache?.rate ?? null, date: cache?.date ?? null, checkedAt: cache?.checkedAt ?? null, stale, status: display === 'EUR' ? 'disabled' : !cache ? 'unavailable' : stale ? 'cached' : 'current', source: 'ECB · Frankfurter' };
    }
    async function perform() {
        const abort = new AbortController();
        controller = abort;
        const timer = setTimeout(() => abort.abort(), timeoutMs);
        timer.unref();
        let received: Rate | null = null;
        try {
            const response = await fetcher(CURRENCY_RATE_URL, { redirect: 'error', signal: abort.signal, headers: { Accept: 'application/json' } });
            const value = await readQuote(response) as Record<string, unknown> | null;
            if (!value || Array.isArray(value) || value.base !== 'EUR' || value.quote !== 'USD' || !validRate(value.rate) || !validDate(value.date, now()))
                throw new Error('Ungültiger Wechselkurs.');
            received = { rate: value.rate, date: value.date, checkedAt: now() };
        }
        catch { }
        finally {
            clearTimeout(timer);
            if (controller === abort)
                controller = null;
        }
        if (closed)
            return;
        await coordinator.run(async () => {
            if (closed)
                return;
            failed = received === null;
            if (received)
                cache = { ...received, lastAttempt, failed: false };
            else if (cache)
                cache = { ...cache, lastAttempt, failed: true };
            if (cache)
                await db.query("INSERT INTO currency_rates(id,value) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET value=excluded.value", [JSON.stringify(cache)]);
        });
    }
    async function update(force = false) {
        if (closed)
            return;
        if (pending)
            return pending;
        const cooldown = failed || force ? retryMs : hourMs;
        if (now() < lastAttempt + cooldown)
            return;
        lastAttempt = now();
        pending = perform().finally(() => { pending = null; if (automatic && !automaticRunning) scheduleAutomatic(); });
        return pending;
    }
    function scheduleAutomatic() {
        if (closed || !automatic) return;
        if (automaticTimer !== null) cancel(automaticTimer);
        const cooldown = failed ? retryMs : hourMs;
        const delay = Number.isFinite(lastAttempt) ? Math.max(1000, lastAttempt + cooldown - now()) : cooldown;
        automaticTimer = schedule(() => runAutomatic(), delay);
        automaticTimer?.unref?.();
    }
    async function runAutomatic() {
        if (closed || !automatic || automaticRunning) return;
        automaticTimer = null; automaticRunning = true;
        try {
            const display = await displayCurrency();
            if (!closed && (display === 'USD' || cache || usedUSD)) await update();
        } catch { failed = true; }
        finally { automaticRunning = false; scheduleAutomatic(); }
    }
    return { read, async current(display: DisplayCurrency) {
            if (display === 'USD') {
                usedUSD = true;
                await update();
            }
            return read(display);
        }, async refresh(display: DisplayCurrency) { usedUSD = true; await update(true); return read(display); },
        startAutomatic() { if (closed || automatic) return Promise.resolve(); automatic = true; return runAutomatic(); },
        close() { closed = true; automatic = false; if (automaticTimer !== null) cancel(automaticTimer); automaticTimer = null; controller?.abort(); } };
}
