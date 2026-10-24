import { lstat, readdir, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import { platform, release } from 'node:os';
async function size(path: string): Promise<number | null> {
    try {
        const s = await lstat(path);
        if (s.isSymbolicLink())
            return null;
        if (s.isFile())
            return s.size;
        if (!s.isDirectory())
            return null;
        let total = 0;
        for (const name of await readdir(path)) {
            const n = await size(join(path, name));
            if (n !== null)
                total += n;
        }
        return total;
    }
    catch (error: any) {
        return error.code === 'ENOENT' ? 0 : null;
    }
}
export function createDiagnostics({ dataDir, version, network, backups, jobs, store, settings, mail, now = Date.now }: {
    dbPath?: string;
    dataDir: string;
    version: string;
    network: any;
    backups: any;
    jobs: any;
    store: any;
    settings: any;
    mail: any;
    now?: () => number;
}) {
    const startedAt = now();
    let cached: any = null, cachedAt = 0;
    return { async read({ refresh = false } = {}) {
            if (cached && !refresh && now() - cachedAt < 10000)
                return cached;
            const [databaseBytes, attachmentsBytes, logoBytes, backupsBytes, free] = await Promise.all([store.db.query('SELECT COALESCE(SUM(pg_total_relation_size(c.oid)),0)::bigint AS bytes FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind IN (\'r\',\'m\')',[store.db.schema]).then((r:any)=>r.rows[0].bytes),size(join(dataDir, 'attachments')), size(join(dataDir, 'branding')), size(join(dataDir, 'backups')), statfs(dataDir).then(s => s.bavail * s.bsize).catch(() => null)]);
            const walBytes=null,desired = await settings.network(), lastSuccess = (await store.db.query("SELECT finishedAt,size FROM backup_jobs WHERE state='complete' ORDER BY finishedAt DESC,id DESC LIMIT 1", [])).rows[0] ?? null, mailStates = { pending: 0, sending: 0, sent: 0, failed: 0, cancelled: 0 };
            for (const row of await mail.status())
                if (Object.hasOwn(mailStates, row.state))
                    mailStates[row.state as keyof typeof mailStates] = Number(row.count);
            cached = { version,database:{engine:'postgresql',serverVersion:store.db.serverVersion}, nodeVersion: process.version, os: `${platform()} ${release()}`, uptimeSeconds: Math.max(0, Math.floor((now() - startedAt) / 1000)), network: { port: network.port, publicOrigin: network.publicOrigin, configured: { port: desired.port, publicOrigin: desired.publicOrigin }, pendingRestart: desired.port !== network.port || desired.publicOrigin !== network.publicOrigin }, storage: { databaseBytes, walBytes, attachmentsBytes, logoBytes, backupsBytes, freeBytes: free }, attachments: { count: Number((await store.db.query("SELECT COUNT(*) AS count FROM attachments", [])).rows[0].count) }, backups: { ...backups.status(), lastSuccess }, mail: mailStates, jobs: await jobs.status(), checkedAt: new Date(now()).toISOString() };
            cachedAt = now();
            return cached;
        } };
}
