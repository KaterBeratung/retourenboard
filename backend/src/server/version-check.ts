export const VERSION_RELEASE_URL = 'https://api.github.com/repos/KaterBeratung/retourenboard/releases/latest';
export const VERSION_RELEASES_PAGE = 'https://github.com/KaterBeratung/retourenboard/releases';
const cooldownMs = 60_000;
const maxResponseBytes = 128 * 1024;
export const AUTO_VERSION_CHECK_INTERVAL_MS=6*60*60*1000;
type CheckStatus = 'unchecked' | 'current' | 'updateAvailable' | 'ahead' | 'unavailable';
type Snapshot = { installedVersion: string; latestVersion: string | null; status: CheckStatus; checkedAt: string | null; publishedAt: string | null; message: string; releasesUrl: string };
class CheckError extends Error {}

function parts(version: string): number[] {
    if (typeof version !== 'string' || version.length > 50 || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version))
        throw new CheckError('Das GitHub-Release enthält keine gültige stabile Versionsnummer.');
    const result = version.split('.').map(Number);
    if (result.some(n => !Number.isSafeInteger(n))) throw new CheckError('Die Versionsnummer ist ungültig.');
    return result;
}

export function compareVersions(installed: string, latest: string): number {
    const a = parts(installed), b = parts(latest);
    for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
    return 0;
}

async function readRelease(response: Response): Promise<unknown> {
    if (!response.body) throw new CheckError('GitHub hat keine Release-Daten geliefert.');
    const reader = response.body.getReader(), chunks: Uint8Array[] = [];
    let size = 0;
    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > maxResponseBytes) {
                await reader.cancel();
                throw new CheckError('Die Release-Antwort von GitHub ist zu groß.');
            }
            chunks.push(value);
        }
    } finally { reader.releaseLock(); }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new CheckError('Die Release-Daten von GitHub konnten nicht gelesen werden.'); }
}

export function createVersionCheck({ version, fetcher = fetch, now = Date.now, timeoutMs = 8000,schedule=setTimeout,cancel=clearTimeout }: { version: string; fetcher?: typeof fetch; now?: () => number; timeoutMs?: number;schedule?:(callback:()=>void,delay:number)=>any;cancel?:(timer:any)=>void }) {
    parts(version);
    let snapshot: Snapshot = { installedVersion: version, latestVersion: null, status: 'unchecked', checkedAt: null, publishedAt: null, message: '', releasesUrl: VERSION_RELEASES_PAGE };
    let lastAttempt = -Infinity, pending: Promise<ReturnType<typeof read>> | null = null;
    let automatic=false,closed=false,timer:any=null,nextCheckAt:string|null=null,controller:AbortController|null=null;
    function read() { return { ...snapshot,automatic,nextCheckAt, retryAt: lastAttempt + cooldownMs > now() ? new Date(lastAttempt + cooldownMs).toISOString() : null }; }
    async function perform() {
        const abort=new AbortController();controller=abort;
        try {
            const response = await fetcher(VERSION_RELEASE_URL, {
                redirect: 'error', signal: AbortSignal.any([AbortSignal.timeout(timeoutMs),abort.signal]),
                headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'retourenboard-versioncheck', 'X-GitHub-Api-Version': '2026-03-10' }
            });
            if (!response.ok) {
                await response.body?.cancel();
                if (response.status === 404) throw new CheckError('Kein öffentliches Release gefunden. Prüfe die Veröffentlichung auf GitHub.');
                if (response.status === 403 || response.status === 429) throw new CheckError('GitHub begrenzt die Anfragen. Bitte später erneut prüfen.');
                throw new CheckError('GitHub ist zurzeit nicht verfügbar. Bitte später erneut prüfen.');
            }
            const data = await readRelease(response) as Record<string, unknown> | null;
            if (!data || Array.isArray(data) || typeof data.tag_name !== 'string' || data.draft || data.prerelease)
                throw new CheckError('GitHub hat kein gültiges stabiles Release geliefert.');
            const latestVersion = data.tag_name.replace(/^v/, ''), comparison = compareVersions(version, latestVersion);
            const published = typeof data.published_at === 'string' ? Date.parse(data.published_at) : NaN;
            if(closed)return read();
            snapshot = { ...snapshot, latestVersion, status: comparison < 0 ? 'updateAvailable' : comparison > 0 ? 'ahead' : 'current', checkedAt: new Date(now()).toISOString(), publishedAt: Number.isFinite(published) ? new Date(published).toISOString() : null, message: '' };
        } catch (error) {
            if(closed)return read();
            snapshot = { ...snapshot, status: 'unavailable', latestVersion: null, publishedAt: null, checkedAt: new Date(now()).toISOString(), message: error instanceof CheckError ? error.message : 'GitHub konnte innerhalb von acht Sekunden nicht erreicht werden. Prüfe die Internetverbindung und versuche es später erneut.' };
        }finally{if(controller===abort)controller=null;}
        return read();
    }
    function check() {
        if(closed)return Promise.resolve(read());
        if (pending) return pending;
        if (now() < lastAttempt + cooldownMs) return Promise.resolve(read());
        lastAttempt = now();
        pending = perform().finally(() => { pending = null; });
        return pending;
    }
    function runAutomatic(){
        nextCheckAt=null;
        return check().then(()=>{
            if(closed||!automatic)return read();
            nextCheckAt=new Date(now()+AUTO_VERSION_CHECK_INTERVAL_MS).toISOString();
            timer=schedule(()=>runAutomatic(),AUTO_VERSION_CHECK_INTERVAL_MS);timer?.unref?.();
            return read();
        });
    }
    function startAutomatic(){if(closed||automatic)return Promise.resolve(read());automatic=true;return runAutomatic();}
    function close(){closed=true;automatic=false;nextCheckAt=null;if(timer!==null)cancel(timer);timer=null;controller?.abort();}
    return { read, check,startAutomatic,close };
}
