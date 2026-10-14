import { constants, mkdirSync, mkdtempSync, renameSync, unlinkSync, rmSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { dirname, join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { InputError } from '../shared/model.js';
import {storedFilePath} from './stored-files.js';
export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export const uploadFormats = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const formats=uploadFormats;
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
export function createAttachments(store, dbPath, limits = () => ({ uploadMaxMb: 10, maxFilesPerReturn: 10 }),dataDir) {
    const db = store.db, memory = dbPath === ':memory:';
    const folder = dataDir?join(dataDir,'attachments'):memory ? mkdtempSync(join(tmpdir(), 'retouren-attachments-')) : join(dirname(dbPath), 'attachments');
    db.exec(`CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,returnId INTEGER NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
    originalName TEXT NOT NULL,storedName TEXT NOT NULL UNIQUE,mediaType TEXT NOT NULL,size INTEGER NOT NULL,createdAt TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS attachments_return ON attachments(returnId);`);
    const publicItem = ({ storedName, ...item }) => item;
    function ensureReturn(id) { if (!store.getReturn(id))
        throw new InputError('Retoure nicht gefunden.', 404); }
    const list = (returnId) => { ensureReturn(returnId); return db.prepare('SELECT * FROM attachments WHERE returnId=? ORDER BY id').all(returnId).map(row => publicItem(row)); };
    function get(id) { const item = db.prepare('SELECT * FROM attachments WHERE id=?').get(id); if (!item)
        throw new InputError('Datei nicht gefunden.', 404); return item; }
    function deleteFile(name) { try {
        unlinkSync(storedFilePath(folder, name));
    }
    catch (error) {
        if (error.code !== 'ENOENT')
            throw error;
    } }
    function checkSize(size) { const max = limits().uploadMaxMb; if (size > max * 1024 * 1024)
        throw new InputError(`Datei ist zu groß. Maximal ${max} MB sind erlaubt.`, 413); }
    function checkCount(returnId) { const max = limits().maxFilesPerReturn; if (list(returnId).length >= max)
        throw new InputError(`Pro Retoure sind maximal ${max} Dateien erlaubt.`); }
    function stageDelete(name){storedFilePath(folder,name);store.onCommit(()=>deleteFile(name));}
    return {
        list,
        async upload(returnId, req, beforeCommit = () => { }, coordinate = job => job()) {
            ensureReturn(returnId);
            checkCount(returnId);
            const originalName = fileName(req.headers['x-file-name']);
            checkSize(Number(req.headers['content-length']));
            const storedName = randomUUID() + extname(originalName).toLowerCase(), tempName = storedName + '.part';
            storedFilePath(folder,tempName);
            mkdirSync(folder, { recursive: true });
            let handle, size = 0, head = Buffer.alloc(0), moved = false;
            try {
                handle = await open(storedFilePath(folder,tempName), 'wx');
                for await (const chunk of req) {
                    size += chunk.length;
                    checkSize(size);
                    if (head.length < 16)
                        head = Buffer.concat([head, chunk.subarray(0, 16 - head.length)]);
                    await handle.write(chunk);
                }
                await handle.close();
                handle = null;
                const mediaType = detect(head);
                if (mediaType !== formats[extname(originalName).toLowerCase()])
                    throw new InputError('Dateiendung und Dateiinhalt stimmen nicht überein.');
                return await coordinate(() => store.transaction(() => {
                    beforeCommit();
                    ensureReturn(returnId);
                    checkSize(size);
                    checkCount(returnId);
                    renameSync(storedFilePath(folder,tempName,{mustExist:true}), storedFilePath(folder, storedName));
                    moved = true;
                    const result = db.prepare('INSERT INTO attachments(returnId,originalName,storedName,mediaType,size,createdAt) VALUES(?,?,?,?,?,?)').run(returnId, originalName, storedName, mediaType, size, new Date().toISOString());
                    const after=publicItem(get(Number(result.lastInsertRowid)));store.recordChange?.({entity:'attachments',id:after.id,action:'create',after});return after;
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
        async read(id) { const item = get(id); try {
            const handle=await open(storedFilePath(folder,item.storedName,{mustExist:true}),constants.O_RDONLY|(constants.O_NOFOLLOW??0));
            try{if(!(await handle.stat()).isFile())throw new InputError('Ungültiger Dateipfad im Datenspeicher.');return {item:publicItem(item),bytes:await handle.readFile()};}finally{await handle.close();}
        }
        catch (error) {
            if (error.code === 'ENOENT')
                throw new InputError('Datei fehlt im Datenspeicher.', 404);
            throw error;
        } },
        remove(id) { return store.transaction(()=>{const item = get(id);stageDelete(item.storedName); db.prepare('DELETE FROM attachments WHERE id=?').run(id);store.recordChange?.({entity:'attachments',id,action:'delete',before:publicItem(item),after:{}});return { deleted: true };}); },
        removeReturn(id) { return store.transaction(()=>{ensureReturn(id);for(const item of db.prepare('SELECT * FROM attachments WHERE returnId=?').all(id)){stageDelete(item.storedName);store.recordChange?.({entity:'attachments',id:item.id,action:'delete',before:publicItem(item),after:{}});}return store.deleteReturn(id);}); },
        dispose() { if (memory)
            rmSync(folder, { recursive: true, force: true }); }
    };
}
