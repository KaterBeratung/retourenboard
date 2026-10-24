import { lstatSync, statfsSync, readdirSync, readFileSync, readlinkSync, mkdirSync, writeFileSync, openSync, fsyncSync, closeSync, renameSync, unlinkSync, rmSync, copyFileSync, chmodSync, chownSync, symlinkSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative, isAbsolute } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { validateUpdatePackage } from './update-package.js';
export const UPDATE_SOCKET = '/run/retourenboard-updater/control.sock';
export const UPDATE_MARKER = '.update-maintenance';
const execute = promisify(execFile);
function syncDirectory(path) { if (process.platform === 'win32')
    return; const fd = openSync(path, 'r'); try {
    fsyncSync(fd);
}
finally {
    closeSync(fd);
} }
export function writeUpdateState(path, value) {
    const temporary = path + '.' + randomUUID() + '.tmp', fd = openSync(temporary, 'wx', 0o600);
    try {
        writeFileSync(fd, JSON.stringify(value));
        fsyncSync(fd);
    }
    finally {
        closeSync(fd);
    }
    renameSync(temporary, path);
    syncDirectory(dirname(path));
}
function directory(path) { const s = lstatSync(path); if (!s.isDirectory() || s.isSymbolicLink())
    throw Error('Ungültiger Installationsordner.'); }
function within(base, path) { const r = relative(base, path); if (!r || isAbsolute(r) || r.startsWith('..'))
    throw Error('Ungültiger Installationspfad.'); return path; }
function tree(path, visit, exclude = new Set()) {
    const s = lstatSync(path);
    if (s.isSymbolicLink() || !s.isDirectory() && !s.isFile() || s.isFile() && s.nlink !== 1)
        throw Error('Links oder spezielle Dateien im Datenverzeichnis sind nicht unterstützt.');
    visit(path, s.isDirectory());
    if (s.isDirectory())
        for (const name of readdirSync(path))
            if (!exclude.has(name))
                tree(join(path, name), visit, exclude);
}
function copyTree(source, target) {
    tree(source, (file, dir) => { const destination = join(target, relative(source, file)); if (dir)
        mkdirSync(destination, { recursive: true, mode: 0o700 });
    else {
        copyFileSync(file, destination);
        chmodSync(destination, 0o600);
    } }, new Set([UPDATE_MARKER]));
}
function syncTree(path) { const directories = []; tree(path, (file, dir) => { if (dir)
    directories.push(file);
else {
    const fd = openSync(file, 'r+');
    try {
        fsyncSync(fd);
    }
    finally {
        closeSync(fd);
    }
} }); for (const dir of directories.reverse())
    syncDirectory(dir); syncDirectory(dirname(path)); }
export function createLinuxUpdate({ appDir = '/opt/retourenverwaltung', dataDir = '/var/lib/retourenverwaltung', stateDir = '/var/lib/retourenboard-updater', uid, gid, run = async (command, args) => { await execute(command, args, { timeout: 45000, maxBuffer: 128 * 1024 }); }, healthCheck, changeOwner = chownSync }) {
    appDir = resolve(appDir);
    dataDir = resolve(dataDir);
    stateDir = resolve(stateDir);
    const releases = join(appDir, 'releases'), journalFile = join(stateDir, 'transaction.json'), marker = join(dataDir, UPDATE_MARKER);
    directory(appDir);
    directory(releases);
    directory(stateDir);
    if (existsSync(dataDir))
        directory(dataDir);
    else if (!existsSync(journalFile))
        throw Error('Datenverzeichnis fehlt ohne Updatejournal.');
    const service = 'retourenboard.service';
    const newRelease = (id) => within(releases, join(releases, 'inapp-' + id));
    const backupRoot = (id) => within(stateDir, join(stateDir, 'snapshots', id));
    function installed() { return JSON.parse(readFileSync(join(appDir, 'current', 'dist', 'package.json'), 'utf8')).version; }
    function readJournal() { if (!existsSync(journalFile))
        return null; const j = JSON.parse(readFileSync(journalFile, 'utf8')); if (!/^[a-f0-9-]{36}$/.test(j.id) || typeof j.oldRelease !== 'string' || !['stopping', 'ready', 'activating', 'rollingBack', 'committed'].includes(j.phase))
        throw Error('Ungültiges Updatejournal.'); within(releases, resolve(j.oldRelease)); directory(j.oldRelease); return j; }
    function writeJournal(j) { writeUpdateState(journalFile, j); }
    function lock(id) { directory(dataDir); const fd = openSync(marker, 'wx', 0o600); try {
        writeFileSync(fd, id);
        fsyncSync(fd);
    }
    finally {
        closeSync(fd);
    } syncDirectory(dataDir); }
    function unlock() { try {
        unlinkSync(journalFile);
        syncDirectory(stateDir);
    }
    catch (error) {
        if (error.code !== 'ENOENT')
            throw error;
    } try {
        unlinkSync(marker);
        syncDirectory(dataDir);
    }
    catch (error) {
        if (error.code !== 'ENOENT')
            throw error;
    } }
    function currentRelease() { const current = resolve(appDir, readlinkSync(join(appDir, 'current'))); within(releases, current); directory(current); return current; }
    function switchCurrent(target) { within(releases, target); directory(target); const temporary = join(appDir, '.current-' + randomUUID()); symlinkSync(target, temporary, process.platform === 'win32' ? 'junction' : 'dir'); if (process.platform === 'win32')
        unlinkSync(join(appDir, 'current')); renameSync(temporary, join(appDir, 'current')); syncDirectory(appDir); }
    async function healthy(version) {
        if (healthCheck)
            return healthCheck(version);
        const config = readFileSync('/etc/retourenverwaltung.env', 'utf8'), envPort = config.match(/^PORT=(\d+)\s*$/m)?.[1];
        let port = Number(envPort || 3000);
        const db = new DatabaseSync(join(dataDir, 'retouren.sqlite'), { readOnly: true });
        try {
            const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='server_settings'").get();
            if (row) {
                const settings = db.prepare('SELECT value FROM server_settings WHERE id=1').get();
                if (settings)
                    port = Number(JSON.parse(String(settings.value)).port || port);
            }
        }
        finally {
            db.close();
        }
        if (!Number.isInteger(port) || port < 1 || port > 65535)
            throw Error('Ungültiger Dienstport.');
        const configuredHost = config.match(/^HOST=([^\r\n]+)$/m)?.[1].trim().replace(/^['"]|['"]$/g, '') || '127.0.0.1', healthHost = (isIP(configuredHost) || configuredHost === 'localhost') && !['0.0.0.0', '::'].includes(configuredHost) ? configuredHost : '127.0.0.1', address = healthHost.includes(':') ? `[${healthHost}]` : healthHost;
        const end = Date.now() + 30000;
        while (Date.now() < end) {
            try {
                const response = await fetch(`http://${address}:${port}/api/session`, { signal: AbortSignal.timeout(2000) });
                if (response.ok && (await response.json()).version === version)
                    return;
            }
            catch { }
            await new Promise(resolve => setTimeout(resolve, 700));
        }
        throw Error('Die neue Version ist nicht erreichbar.');
    }
    async function rollback() {
        const j = readJournal();
        if (!j)
            return false;
        if (j.phase === 'committed') {
            await healthy(installed());
            return false;
        }
        await run('systemctl', ['stop', service]);
        const changed = j.snapshotComplete && ['activating', 'rollingBack'].includes(j.phase);
        j.phase = 'rollingBack';
        writeJournal(j);
        if (changed) {
            const snapshot = join(backupRoot(j.id), 'data');
            directory(snapshot);
            const restored = join(dirname(dataDir), '.retourenboard-restore-' + j.id), failed = join(dirname(dataDir), '.retourenboard-failed-' + j.id);
            within(dirname(dataDir), restored);
            within(dirname(dataDir), failed);
            if (existsSync(restored)) {
                directory(restored);
                rmSync(restored, { recursive: true });
            }
            copyTree(snapshot, restored);
            tree(restored, (file, dir) => { changeOwner(file, uid, gid); chmodSync(file, dir ? 0o700 : 0o600); });
            syncTree(restored);
            if (existsSync(dataDir)) {
                directory(dataDir);
                if (existsSync(failed)) {
                    directory(failed);
                    rmSync(dataDir, { recursive: true });
                }
                else
                    renameSync(dataDir, failed);
                syncDirectory(dirname(dataDir));
            }
            renameSync(restored, dataDir);
            syncDirectory(dirname(dataDir));
            lock(j.id);
        }
        switchCurrent(j.oldRelease);
        await run('systemctl', ['start', service]);
        await healthy(j.oldVersion);
        // Keep the journal until the worker persists its result and releases maintenance.
        return changed;
    }
    return { installed, lock, unlock,
        async prepare(file, version, id) {
            await validateUpdatePackage({ archive: file, target: newRelease(id), version });
            await run(join(appDir, 'node', 'bin', 'node'), ['--check', join(newRelease(id), 'dist/server/index.js')]);
            await run(join(appDir, 'node', 'bin', 'node'), ['--check', join(newRelease(id), 'dist/server/app.js')]);
            tree(newRelease(id), (file, dir) => chmodSync(file, dir ? 0o755 : 0o644));
            syncTree(newRelease(id));
        },
        async snapshot(id) {
            const j = { id, oldRelease: currentRelease(), oldVersion: installed(), phase: 'stopping', snapshotComplete: false };
            writeJournal(j);
            await run('systemctl', ['stop', service]);
            let size = 0;
            tree(dataDir, (file, dir) => { if (!dir)
                size += lstatSync(file).size; }, new Set([UPDATE_MARKER]));
            const space = statfsSync(stateDir);
            if (size > 64 * 1024 ** 3 || space.bavail * space.bsize < size * 2 + 128 * 1024 ** 2)
                throw Error('Für die Updatesicherung fehlt Speicherplatz.');
            mkdirSync(backupRoot(id), { recursive: true, mode: 0o700 });
            copyTree(dataDir, join(backupRoot(id), 'data'));
            syncTree(backupRoot(id));
            syncDirectory(stateDir);
            writeUpdateState(join(backupRoot(id), 'snapshot.json'), { id, version: j.oldVersion, createdAt: new Date().toISOString() });
            j.snapshotComplete = true;
            j.phase = 'ready';
            writeJournal(j);
        },
        async activate(id) { const j = readJournal(); if (!j || j.id !== id || !j.snapshotComplete)
            throw Error('Updatesicherung fehlt.'); j.phase = 'activating'; writeJournal(j); switchCurrent(newRelease(id)); },
        async restart(version) { await run('systemctl', ['start', service]); await healthy(version); }, checkHealthy: () => healthy(installed()),
        async commit(id) { const j = readJournal(); if (!j || j.id !== id)
            throw Error('Updatejournal fehlt.'); j.phase = 'committed'; writeJournal(j); }, rollback,
        async recover() { const j = readJournal(); if (j) {
            if (j.phase === 'committed')
                await healthy(installed());
            else
                await rollback();
        } unlock(); return j; } };
}
