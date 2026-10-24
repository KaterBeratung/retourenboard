import { constants, mkdirSync, mkdtempSync, renameSync, unlinkSync, rmSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { dirname, join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { InputError } from '../shared/model.js';
import { storedFilePath } from './stored-files.js';
export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export const uploadFormats = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const formats = uploadFormats;
// Validate the original display name, never a storage path. Uploads use UUID
// basenames on disk, so Unicode and punctuation remain intact in metadata.
export function fileName(header) {
    let name;
    try {
        name = decodeURIComponent((header ?? ''));
    }
    catch {
        throw new InputError('Ungültiger Dateiname.');
    }
    if (!name || name.length > 250 || /[\x00-\x1f\x7f/\\]/.test(name) || name === '.' || name === '..')
        throw new InputError('Ungültiger Dateiname.');
    if (!Object.hasOwn(formats, extname(name).toLowerCase()))
        throw new InputError('Erlaubt sind PDF, PNG, JPG/JPEG und WebP.');
    return name;
}
export function detect(bytes) {
    if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
        return 'image/png';
    if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
        return 'image/jpeg';
    if (bytes.subarray(0, 5).toString('ascii') === '%PDF-')
        return 'application/pdf';
    if (bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP')
        return 'image/webp';
    throw new InputError('Dateiinhalt wird nicht unterstützt. Bitte PDF, PNG, JPG/JPEG oder WebP auswählen.');
}
export function createAttachments(store, dataDir, limits = () => ({ uploadMaxMb: 10, maxFilesPerReturn: 10 })) {
    const db = store.db;
    const folder = join(dataDir, 'attachments');
    const publicItem = ({ storedName, ...item }) => item;
    async function ensureReturn(id) {
        if (!await store.getReturn(id))
            throw new InputError('Retoure nicht gefunden.', 404);
    }
    const list = async (returnId) => { await ensureReturn(returnId); return (await db.query("SELECT * FROM attachments WHERE returnId=$1 ORDER BY id", [returnId])).rows.map(row => publicItem(row)); };
    async function get(id) {
        const item = (await db.query("SELECT * FROM attachments WHERE id=$1", [id])).rows[0];
        if (!item)
            throw new InputError('Datei nicht gefunden.', 404);
        return item;
    }
    function deleteFile(name) {
        try {
            unlinkSync(storedFilePath(folder, name));
        }
        catch (error) {
            if (error.code !== 'ENOENT')
                throw error;
        }
    }
    async function checkSize(size) {
        const max = (await limits()).uploadMaxMb;
        if (size > max * 1024 * 1024)
            throw new InputError(`Datei ist zu groß. Maximal ${max} MB sind erlaubt.`, 413);
    }
    async function checkCount(returnId) {
        const max = (await limits()).maxFilesPerReturn;
        if ((await list(returnId)).length >= max)
            throw new InputError(`Pro Retoure sind maximal ${max} Dateien erlaubt.`);
    }
    function stageDelete(name) { storedFilePath(folder, name); store.onCommit(() => deleteFile(name)); }
    return {
        list,
        async upload(returnId, req, beforeCommit = () => { }, coordinate = job => job()) {
            await ensureReturn(returnId);
            await checkCount(returnId);
            const originalName = fileName(req.headers['x-file-name']);
            await checkSize(Number(req.headers['content-length']));
            const storedName = randomUUID() + extname(originalName).toLowerCase(), tempName = storedName + '.part';
            storedFilePath(folder, tempName);
            mkdirSync(folder, { recursive: true });
            let handle, size = 0, head = Buffer.alloc(0), moved = false;
            try {
                handle = await open(storedFilePath(folder, tempName), 'wx');
                for await (const chunk of req) {
                    size += chunk.length;
                    await checkSize(size);
                    if (head.length < 16)
                        head = Buffer.concat([head, chunk.subarray(0, 16 - head.length)]);
                    await handle.writeFile(chunk);
                }
                await handle.close();
                handle = null;
                const mediaType = detect(head);
                if (mediaType !== formats[extname(originalName).toLowerCase()])
                    throw new InputError('Dateiendung und Dateiinhalt stimmen nicht überein.');
                return await coordinate(async () => store.transaction(async () => {
                    await beforeCommit();
                    await ensureReturn(returnId);
                    await checkSize(size);
                    await checkCount(returnId);
                    renameSync(storedFilePath(folder, tempName, { mustExist: true }), storedFilePath(folder, storedName));
                    moved = true;
                    store.onRollback(() => deleteFile(storedName));
                    const result = await db.query("INSERT INTO attachments(returnId,originalName,storedName,mediaType,size,createdAt) VALUES($1,$2,$3,$4,$5,$6) RETURNING id", [returnId, originalName, storedName, mediaType, size, new Date().toISOString()]);
                    const after = publicItem(await get(Number(result.rows[0].id)));
                    await store.recordChange?.({ entity: 'attachments', id: after.id, action: 'create', after });
                    return after;
                }));
            }
            catch (error) {
                if (handle)
                    await handle.close();
                deleteFile(tempName);
                if (moved)
                    deleteFile(storedName);
                throw error;
            }
        },
        async read(id) {
            const item = await get(id);
            try {
                const handle = await open(storedFilePath(folder, item.storedName, { mustExist: true }), constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
                try {
                    const stat = await handle.stat();
                    if (!stat.isFile() || stat.size !== item.size)
                        throw new InputError('Ungültige Datei im Datenspeicher.');
                    return { item: publicItem(item), bytes: await handle.readFile() };
                }
                finally {
                    await handle.close();
                }
            }
            catch (error) {
                if (error.code === 'ENOENT')
                    throw new InputError('Datei fehlt im Datenspeicher.', 404);
                throw error;
            }
        },
        async remove(id) { return store.transaction(async () => { const item = await get(id); stageDelete(item.storedName); await db.query("DELETE FROM attachments WHERE id=$1", [id]); await store.recordChange?.({ entity: 'attachments', id, action: 'delete', before: publicItem(item), after: {} }); return { deleted: true }; }); },
        async removeReturn(id,options={}) {
            return store.transaction(async () => {
                await ensureReturn(id);
                for (const item of (await db.query("SELECT * FROM attachments WHERE returnId=$1", [id])).rows) {
                    stageDelete(item.storedName);
                    await store.recordChange?.({ entity: 'attachments', id: item.id, action: 'delete', before: publicItem(item), after: {} });
                }
                return store.deleteReturn(id,options);
            });
        },
        dispose() {}
    };
}
