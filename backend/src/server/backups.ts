import {exportData} from './database/data-transfer.js';
import { mkdirSync, lstatSync, mkdtempSync, copyFileSync, renameSync, rmSync, statSync, unlinkSync, constants, type ReadStream } from 'node:fs';
import { lstat, realpath, open } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { create as archive } from '../vendor/archive.js';
import { InputError } from '../shared/model.js';
import type { Actor, Clock } from '../shared/types.js';
import { BACKUP_LIMITS, checkBackupSizes, sha256File, type BackupLimits } from '../shared/backup-contract.js';
import { storedFilePath } from './stored-files.js';
export async function createBackups({ store, dataDir, coordinator, clock, preferences, version, limits = BACKUP_LIMITS }: {
    store: any;
    dataDir: string;
    coordinator: any;
    clock: Clock;
    preferences: any;
    version: string;
    limits?: BackupLimits;
}) {
    const folder = join(dataDir, 'backups');
    let active: Promise<any> | null = null, closed = false;
    const downloads = new Set<ReadStream>();
    let openingDownloads = 0;
    const openingWaiters: (() => void)[] = [];
    let cleanupError: { id: string; time: string; message: string } | null = null;
    let statusError: { id: string; time: string; message: string } | null = null;
    await store.db.query("UPDATE backup_jobs SET state='failed',error='Vorheriger Lauf wurde unterbrochen.' WHERE state='running'", []);
    function directory() {
        mkdirSync(folder, { recursive: true, mode: 0o700 });
        const s = lstatSync(folder);
        if (!s.isDirectory() || s.isSymbolicLink())
            throw new InputError('Sicherungsordner ist ungültig.', 503);
    }
    function path(name: string) {
        if (!/^retourenboard-backup-[\da-f-]+\.tar\.gz$/.test(name))
            throw new InputError('Ungültiges Sicherungsarchiv.', 400);
        const p = resolve(folder, name), r = relative(folder, p);
        if (isAbsolute(r) || r.startsWith('..'))
            throw new InputError('Ungültiger Sicherungspfad.');
        return p;
    }
    async function get(id: string) {
        const r = (await store.db.query("SELECT * FROM backup_jobs WHERE id=$1", [id])).rows[0];
        if (!r)
            throw new InputError('Sicherung nicht gefunden.', 404);
        return { ...r, metadata: r.metadata ? JSON.parse(r.metadata) : null };
    }
    async function list() { return (await store.db.query("SELECT * FROM backup_jobs ORDER BY createdAt DESC,id DESC LIMIT 100", [])).rows.map((r: any) => ({ ...r, metadata: r.metadata ? JSON.parse(r.metadata) : null })); }
    async function report(kind: 'cleanup' | 'status', id: string, error: unknown) {
        const warning = { id, time: new Date(clock.now()).toISOString(), message: kind === 'cleanup' ? 'Sicherungsbereinigung fehlgeschlagen. Aufbewahrung und Dateizugriff prüfen.' : 'Sicherungsstatus konnte nicht gespeichert werden. Datenbank prüfen.' };
        if (kind === 'cleanup') cleanupError = warning;
        else statusError = warning;
        console.error(warning.message, error);
        try {
            await store.db.query("INSERT INTO events(id,type,payload,createdAt) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING", [`backup${kind}:${id}`, kind === 'cleanup' ? 'backupCleanupError' : 'backupStatusError', JSON.stringify(warning), warning.time]);
        } catch (reportError) { console.error('Sicherungswarnung konnte nicht protokolliert werden.', reportError); }
    }
    async function inspectFile(id: string) {
        const meta = await get(id);
        if (meta.state !== 'complete' || !meta.filename)
            throw new InputError('Sicherung ist nicht verfügbar.', 404);
        const p = path(meta.filename);
        try {
            const root = await lstat(folder);
            if (!root.isDirectory() || root.isSymbolicLink() || relative(await realpath(folder), resolve(folder)) !== '')
                throw new InputError('Ungültiges Archiv.', 503);
            const s = await lstat(p);
            if (!s.isFile() || s.isSymbolicLink() || s.size <= 0 || s.size > limits.maxArchiveBytes || s.size !== Number(meta.size))
                throw new InputError('Ungültiges Archiv.', 503);
            return { meta, path: p, stat: s };
        } catch (error: any) {
            if (error instanceof InputError) throw error;
            throw new InputError(error.code === 'ENOENT' ? 'Sicherung nicht gefunden.' : 'Sicherung ist nicht lesbar.', error.code === 'ENOENT' ? 404 : 503);
        }
    }
    async function download(id: string) {
        if (closed) throw new InputError('Server wird beendet.', 503);
        if (openingDownloads + downloads.size >= 4) throw new InputError('Zu viele gleichzeitige Sicherungsdownloads. Bitte kurz warten.', 503);
        openingDownloads++;
        let handle: Awaited<ReturnType<typeof open>> | undefined;
        try {
            const file = await inspectFile(id);
            handle = await open(file.path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
            const s = await handle.stat();
            if (!s.isFile() || s.dev !== file.stat.dev || s.ino !== file.stat.ino || s.size !== file.stat.size)
                throw new InputError('Ungültiges Archiv.', 503);
            const header = Buffer.alloc(3);
            await handle.read(header, 0, 3, 0);
            if (header[0] !== 0x1f || header[1] !== 0x8b || header[2] !== 8)
                throw new InputError('Ungültiges Archiv.', 503);
            if (closed) throw new InputError('Server wird beendet.', 503);
            const stream = handle.createReadStream({ start: 0, end: s.size - 1, highWaterMark: 64 * 1024, autoClose: true });
            downloads.add(stream);
            stream.once('close', () => downloads.delete(stream));
            return { meta: file.meta, stream, size: s.size };
        } catch (error: any) {
            await handle?.close().catch(() => { });
            if (error instanceof InputError) throw error;
            throw new InputError(error.code === 'ENOENT' ? 'Sicherung nicht gefunden.' : 'Sicherung ist nicht lesbar.', error.code === 'ENOENT' ? 404 : 503);
        } finally {
            openingDownloads--;
            if (!openingDownloads) for (const resolve of openingWaiters.splice(0)) resolve();
        }
    }
    async function run(actor: Actor, mode: 'manual' | 'auto', beforeCommit: () => void, slot?: string) {
        const id = randomUUID(), filename = `retourenboard-backup-${id}.tar.gz`, target = path(filename), temporary = target + '.part', createdAt = new Date(clock.now()).toISOString();
        let work = '';
        try {
            directory();
            work = mkdtempSync(join(folder, '.snapshot-'));
            await coordinator.run(async () => {
                await beforeCommit();
                await store.transaction(async () => {
                    await store.db.query("INSERT INTO backup_jobs(id,mode,state,createdAt) VALUES($1,$2,$3,$4)", [id, mode, 'running', createdAt]);
                    if (slot)
                        await store.db.query("INSERT INTO app_preferences(section,value) VALUES('backupSlot',$1) ON CONFLICT(section) DO UPDATE SET value=excluded.value", [slot]);
                });
                const tables=await exportData(store.db, join(work, 'data.jsonl'));
                const files: string[] = ['data.jsonl'], sizes = [statSync(join(work, 'data.jsonl')).size];
                checkBackupSizes(sizes, limits);
                const references = (await store.db.query("SELECT storedName FROM attachments", [])).rows.map((r: any) => ({ folder: 'attachments', name: r.storedName }));
                if ((await store.db.query("SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_name='chat_attachments'", [])).rows[0])
                    for (const r of (await store.db.query("SELECT a.storedName FROM chat_attachments a JOIN chat_messages m ON m.id=a.messageId WHERE m.deleted=0", [])).rows)
                        references.push({ folder: 'chat-attachments', name: r.storedName });
                if ((await store.db.query("SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_name='app_logo'", [])).rows[0])
                    for (const r of (await store.db.query("SELECT storedName FROM app_logo", [])).rows)
                        references.push({ folder: 'branding', name: r.storedName });
                for (const ref of references) {
                    if (!/^[\w.-]+$/.test(ref.name) || ref.name.includes('..'))
                        throw new Error('Dateireferenz ist ungültig.');
                    const source = storedFilePath(join(dataDir, ref.folder), ref.name, { mustExist: true }), s = lstatSync(source);
                    if (!s.isFile() || s.isSymbolicLink())
                        throw new Error('Dateireferenz ist ungültig.');
                    sizes.push(s.size);
                    checkBackupSizes(sizes, limits);
                    mkdirSync(join(work, ref.folder), { recursive: true });
                    copyFileSync(source, join(work, ref.folder, ref.name));
                    files.push(ref.folder + '/' + ref.name);
                }
                const fileMetadata = [];
                for (const p of files)
                    fileMetadata.push({ path: p, size: statSync(join(work, p)).size, sha256: await sha256File(join(work, p)) });
                const manifest = { format: 2, engine:'postgresql',payload:'tables-v1',schema:4,tables, version, createdAt: new Date(clock.now()).toISOString(), database: 'data.jsonl', mfaKeyRequired: Number((await store.db.query("SELECT COUNT(*) AS n FROM user_mfa WHERE secretEnc IS NOT NULL", [])).rows[0].n) > 0, files: fileMetadata };
                const { writeFileSync } = await import('node:fs');
                writeFileSync(join(work, 'manifest.json'), JSON.stringify(manifest, null, 2));
                checkBackupSizes([...sizes, statSync(join(work, 'manifest.json')).size], { ...limits, maxFiles: limits.maxFiles + 1 });
            });
            await archive({ cwd: work, file: temporary, gzip: true, portable: true }, ['manifest.json', 'data.jsonl', ...['attachments', 'branding', 'chat-attachments'].filter(f => {
                    try {
                        return lstatSync(join(work, f)).isDirectory();
                    }
                    catch {
                        return false;
                    }
                })]);
            const size = statSync(temporary).size;
            if (size > limits.maxArchiveBytes)
                throw new InputError('Sicherung überschreitet die unterstützte Archivgröße von 1 GiB. Datenverzeichnis offline sichern.', 503);
            renameSync(temporary, target);
            const finishedAt = new Date(clock.now()).toISOString(), metadata = { version, mfaKeySeparate: true };
            await coordinator.run(async () => store.withActor(actor, async () => store.transaction(async () => { await store.db.query("UPDATE backup_jobs SET state='complete',finishedAt=$1,filename=$2,size=$3,metadata=$4 WHERE id=$5", [finishedAt, filename, size, JSON.stringify(metadata), id]); await store.recordChange?.({ entity: 'backups', id, action: 'create', after: { size } }); })));
            if (mode === 'auto') try {
                await coordinator.run(async () => {
                    const retain = (await preferences.get('backups')).retain;
                    if (!Number.isInteger(retain) || retain < 1 || retain > 90) throw new Error('Ungültige Sicherungsaufbewahrung.');
                    const errors: unknown[] = [];
                    // Reserve one retention slot for the successful current job.
                    // UUID ordering is not chronological when timestamps tie.
                    for (const old of (await store.db.query("SELECT id,filename FROM backup_jobs WHERE mode='auto' AND state='complete' AND id<>$2 ORDER BY createdAt DESC,id DESC OFFSET $1", [retain - 1, id])).rows) {
                        try {
                            directory();
                            const p = path(old.filename);
                            try {
                                const s = lstatSync(p);
                                if (!s.isFile() || s.isSymbolicLink()) throw new Error('Ungültiges altes Sicherungsarchiv.');
                                unlinkSync(p);
                            } catch (error: any) { if (error.code !== 'ENOENT') throw error; }
                            await store.db.query("UPDATE backup_jobs SET state='rotated',filename=NULL WHERE id=$1", [old.id]);
                        }
                        catch (error) { errors.push(error); }
                    }
                    if (errors.length) throw new AggregateError(errors, 'Alte Sicherungen konnten nicht vollständig bereinigt werden.');
                });
            } catch (error) { await report('cleanup', id, error); }
            return { id, mode, state: 'complete', createdAt, finishedAt, filename, size, error: null, metadata };
        }
        catch (error) {
            if (error instanceof InputError && [401, 403].includes(error.status))
                throw error;
            const message = error instanceof InputError && error.status === 503 ? error.message : 'Sicherung fehlgeschlagen. Speicherplatz und Dateizugriff prüfen.';
            try {
                await coordinator.run(async () => store.transaction(async () => { await store.db.query("UPDATE backup_jobs SET state='failed',finishedAt=$1,error=$2 WHERE id=$3", [new Date(clock.now()).toISOString(), message, id]); await store.db.query("INSERT INTO events(id,type,payload,createdAt) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING", ['backupError:' + id, 'backupError', JSON.stringify({ id }), new Date(clock.now()).toISOString()]); }));
            } catch (statusFailure) { await report('status', id, statusFailure); }
            const failure=new InputError(message,503);failure.cause=error;throw failure;
        }
        finally {
            try {
                unlinkSync(temporary);
            }
            catch (error: any) { if (error.code !== 'ENOENT') await report('cleanup', id, error); }
            const r = relative(folder, work);
            if (!isAbsolute(r) && !r.startsWith('..') && r.startsWith('.snapshot-')) try {
                rmSync(work, { recursive: true, force: true });
            } catch (error) { await report('cleanup', id, error); }
        }
    }
    return {
        list, get,
        async file(id: string) {
            const { meta, path } = await inspectFile(id);
            return { meta, path };
        },
        download,
        create(actor: Actor, mode: 'manual' | 'auto' = 'manual', beforeCommit = () => { }, slot?: string) {
            if (closed)
                throw new InputError('Server wird beendet.', 503);
            if (active)
                throw new InputError('Eine Sicherung läuft bereits.', 409);
            active = run(actor, mode, beforeCommit, slot).finally(() => active = null);
            return active;
        },
        async read(id: string) {
            // Compatibility for in-process callers; HTTP downloads use download().
            const { meta, stream } = await download(id), chunks: Buffer[] = [];
            for await (const chunk of stream) chunks.push(chunk as Buffer);
            return { meta, bytes: Buffer.concat(chunks) };
        },
        status: () => ({ running: !!active, downloads: downloads.size + openingDownloads, cleanupError, statusError }),
        async close() {
            closed = true;
            const opened = [...downloads].map(stream => new Promise<void>(resolve => {
                if (stream.closed) resolve();
                else stream.once('close', resolve);
                stream.destroy();
            }));
            const opening = openingDownloads ? new Promise<void>(resolve => openingWaiters.push(resolve)) : Promise.resolve();
            await Promise.all([...opened, opening, active?.catch(() => { })]);
        }
    };
}
