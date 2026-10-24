import { constants, mkdirSync, mkdtempSync, renameSync, unlinkSync, rmSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { InputError } from '../shared/model.js';
import { fileName, detect, uploadFormats } from './attachments.js';
import { storedFilePath } from './stored-files.js';
export type ChatAttachment = {
    id: number;
    messageId: number;
    originalName: string;
    storedName: string;
    mediaType: string;
    size: number;
    createdAt: string;
};
type UploadedFile = Omit<ChatAttachment, 'id' | 'messageId'>;
const maxChannelFiles = 200, maxChannelBytes = 250 * 1024 * 1024;
export function createChatAttachments({ store, dataDir, limits = () => ({ uploadMaxMb: 10 }) }: {
    store: any;
    dataDir?: string;
    limits?: () => {
        uploadMaxMb: number;
    };
}) {
    const db = store.db, temporary = !dataDir, folder = dataDir ? join(dataDir, 'chat-attachments') : mkdtempSync(join(tmpdir(), 'retourenboard-chat-attachments-'));
    function publicItem(item: ChatAttachment) { return { id: item.id, originalName: item.originalName, mediaType: item.mediaType, size: item.size, createdAt: item.createdAt }; }
    function deleteFile(name: string) {
        try {
            unlinkSync(storedFilePath(folder, name));
        }
        catch (error: any) {
            if (error.code !== 'ENOENT')
                throw error;
        }
    }
    async function checkSize(size: number) {
        const max = (await limits()).uploadMaxMb;
        if (size > max * 1024 * 1024)
            throw new InputError(`Datei ist zu groß. Maximal ${max} MB sind erlaubt.`, 413);
    }
    async function checkQuota(channelId: number, size = 0) {
        const usage = (await db.query("SELECT COUNT(*) AS count,COALESCE(SUM(a.size),0) AS bytes FROM chat_attachments a JOIN chat_messages m ON m.id=a.messageId WHERE m.channelId=$1 AND m.deleted=0", [channelId])).rows[0];
        if (Number(usage.count) >= maxChannelFiles || Number(usage.bytes) + size > maxChannelBytes)
            throw new InputError('Pro Unterhaltung sind maximal 200 Dateien und insgesamt 250 MB erlaubt. Alte Dateien können über ihre Nachricht gelöscht werden.');
    }
    return {
        async list(messageId: number) { return (await db.query("SELECT * FROM chat_attachments WHERE messageId=$1 ORDER BY id", [messageId])).rows.map(publicItem); },
        async get(attachmentId: number): Promise<ChatAttachment> {
            const item = (await db.query("SELECT * FROM chat_attachments WHERE id=$1", [attachmentId])).rows[0];
            if (!item)
                throw new InputError('Datei nicht gefunden.', 404);
            return item;
        },
        async insert(messageId: number, item: UploadedFile) { const n = await db.query("INSERT INTO chat_attachments(messageId,originalName,storedName,mediaType,size,createdAt) VALUES($1,$2,$3,$4,$5,$6) RETURNING id", [messageId, item.originalName, item.storedName, item.mediaType, item.size, item.createdAt]); return Number(n.rows[0].id); },
        async removeMessage(messageId: number) {
            for (const item of (await db.query("SELECT * FROM chat_attachments WHERE messageId=$1", [messageId])).rows) {
                storedFilePath(folder, item.storedName);
                store.onCommit(() => deleteFile(item.storedName));
            }
            await db.query("DELETE FROM chat_attachments WHERE messageId=$1", [messageId]);
        },
        async upload(channelId: number, req: IncomingMessage, beforeCommit: () => void, createMessage: (item: UploadedFile) => any, coordinate: (job: () => any) => Promise<any> | any) {
            await beforeCommit();
            await checkQuota(channelId);
            const originalName = fileName(req.headers['x-file-name']);
            const declared = req.headers['content-length'];
            if (declared !== undefined) {
                if (typeof declared !== 'string' || !/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared)))
                    throw new InputError('Ungültige Dateigröße.');
                await checkSize(Number(declared));
            }
            const storedName = randomUUID() + extname(originalName).toLowerCase(), tempName = storedName + '.part';
            storedFilePath(folder, tempName);
            mkdirSync(folder, { recursive: true, mode: 0o700 });
            let handle, size = 0, head = Buffer.alloc(0), moved = false;
            try {
                handle = await open(storedFilePath(folder, tempName), 'wx', 0o600);
                for await (const input of req) {
                    const chunk = Buffer.isBuffer(input) ? input : Buffer.from(input);
                    size += chunk.length;
                    await checkSize(size);
                    if (head.length < 16)
                        head = Buffer.concat([head, chunk.subarray(0, 16 - head.length)]);
                    await handle.writeFile(chunk);
                }
                await handle.close();
                handle = undefined;
                const mediaType = detect(head);
                if (mediaType !== uploadFormats[extname(originalName).toLowerCase() as keyof typeof uploadFormats])
                    throw new InputError('Dateiendung und Dateiinhalt stimmen nicht überein.');
                return await coordinate(async () => store.transaction(async () => {
                    await beforeCommit();
                    await checkSize(size);
                    await checkQuota(channelId, size);
                    renameSync(storedFilePath(folder, tempName, { mustExist: true }), storedFilePath(folder, storedName));
                    moved = true;
                    store.onRollback(() => deleteFile(storedName));
                    return createMessage({ originalName, storedName, mediaType, size, createdAt: new Date().toISOString() });
                }));
            }
            catch (error) {
                if (handle)
                    await handle.close().catch(() => { });
                deleteFile(tempName);
                if (moved)
                    deleteFile(storedName);
                throw error;
            }
        },
        async read(item: ChatAttachment) {
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
            catch (error: any) {
                if (error.code === 'ENOENT')
                    throw new InputError('Datei fehlt im Datenspeicher.', 404);
                throw error;
            }
        },
        dispose() {
            if (temporary)
                rmSync(folder, { recursive: true, force: true });
        }
    };
}
