import { InputError } from '../shared/model.js';
import { hasPermission, type PermissionKey } from '../shared/permissions.js';
import { createChatAttachments } from './chat-attachments.js';
import type { IncomingMessage } from 'node:http';
type User = {
    id: number;
    username: string;
    displayName: string;
    role: any;
    active: boolean;
    permissions: any;
};
type Channel = {
    id: number;
    kind: string;
    visibility: string;
    name: string;
    ownerId: number | null;
    directKey: string | null;
    createdAt: string;
};
const missing = () => new InputError('Unterhaltung nicht gefunden.', 404);
function id(value: any): number {
    if (!Number.isSafeInteger(value) || value < 1)
        throw new InputError('Ungültige Zuordnung.');
    return value;
}
function text(value: any, max = 4000): string {
    if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))
        throw new InputError(`Bitte einen Text mit 1–${max} Zeichen eingeben.`);
    return value.trim();
}
export async function createCollaboration({ store, users, preferences, now = Date.now, dataDir, limits }: {
    store: any;
    users: any;
    preferences: any;
    now?: () => number;
    dataDir?: string;
    limits?: () => {
        uploadMaxMb: number;
    };
}) {
    const db = store.db;
    await db.query("INSERT INTO chat_channels(kind,visibility,name,directKey,createdAt) VALUES('public','public','Teamchat','public:team',$1) ON CONFLICT(directKey) DO NOTHING", [new Date(now()).toISOString()]);
    const chatFiles = createChatAttachments({ store, dataDir, limits });
    // SQLite's built-in LIKE only folds ASCII. Normalize Unicode as well so
    // German and English searches use the same literal, case-insensitive match.
    const at = () => new Date(now()).toISOString();
    const rate = new Map<number, {
        n: number;
        until: number;
    }>();
    function right(user: User, key: PermissionKey) {
        if (!user?.active || !hasPermission(user, key))
            throw new InputError('Du hast keine Berechtigung für diese Aktion.', 403);
    }
    async function accessible(user: User, c: Channel) { return !!user?.active && hasPermission(user, 'chatRead') && (c.visibility === 'public' || !!(await db.query("SELECT 1 FROM chat_members WHERE channelId=$1 AND userId=$2", [c.id, user.id])).rows[0]); }
    async function channel(user: User, channelId: number): Promise<Channel> {
        right(user, 'chatRead');
        const c = (await db.query("SELECT * FROM chat_channels WHERE id=$1", [id(channelId)])).rows[0];
        if (!c || !await accessible(user, c))
            throw missing();
        return c;
    }
    async function memberIds(channelId: number): Promise<number[]> { return (await db.query("SELECT userId FROM chat_members WHERE channelId=$1 AND joined=1", [channelId])).rows.map((m: any) => m.userId); }
    async function existingReturn(returnId: number) {
        const ret = await store.getReturn(id(returnId));
        if (!ret)
            throw new InputError('Retoure nicht gefunden.', 404);
        return ret;
    }
    function basic(user: User) { return { id: user.id, username: user.username, displayName: user.displayName, chatAvailable: hasPermission(user, 'chatRead') }; }
    async function directory() { return (await users.list()).filter((u: User) => u.active).map(basic); }
    async function participants(c: Channel) { return (await Promise.all((await memberIds(c.id)).map(async (n: number) => users.get(n)))).filter(Boolean).map((u: User) => ({ ...basic(u), active: u.active })); }
    function canManage(user: User, c: Channel) { return c.kind === 'group' && (c.ownerId === user.id && hasPermission(user, 'chatGroupsCreate') || c.visibility === 'public' && hasPermission(user, 'chatModerate')); }
    function canPin(user: User, c: Channel, row: any) { return !row.deleted && (row.authorId === user.id && hasPermission(user, 'chatSend') || canManage(user, c) || c.visibility === 'public' && hasPermission(user, 'chatModerate')); }
    async function channelView(user: User, c: Channel) {
        const last = (await db.query("SELECT * FROM chat_messages WHERE channelId=$1 ORDER BY id DESC LIMIT 1", [c.id])).rows[0], seen = (await db.query("SELECT lastReadId FROM chat_members WHERE channelId=$1 AND userId=$2", [c.id, user.id])).rows[0]?.lastReadId ?? 0;
        const unread = Number((await db.query("SELECT COUNT(*) AS n FROM chat_messages WHERE channelId=$1 AND id>$2 AND authorId<>$3 AND deleted=0", [c.id, seen, user.id])).rows[0].n);
        const members = await participants(c), other = c.kind === 'direct' ? members.find((u: any) => u.id !== user.id) : null;
        return { id: c.id, kind: c.kind, visibility: c.visibility, name: other?.displayName ?? (c.kind === 'direct' ? 'Gelöschtes Konto' : c.name), ownerId: c.ownerId, members, joined: (await memberIds(c.id)).includes(user.id), canManage: canManage(user, c), unread, lastMessage: last ? { id: last.id, text: last.deleted ? 'Nachricht gelöscht' : last.text ? last.text.slice(0, 180) : (await chatFiles.list(last.id))[0]?.originalName ?? '', createdAt: last.createdAt } : null };
    }
    async function activeMembers(values: any, ownerId: number | null) {
        if (!Array.isArray(values) || values.length > 49)
            throw new InputError('Eine Gruppe darf höchstens 50 Personen enthalten.');
        const ids = [...new Set([...(ownerId === null ? [] : [ownerId]), ...values.map(id)])];
        for (const n of ids) {
            const u = await users.get(n);
            if (!u?.active || !hasPermission(u, 'chatRead'))
                throw new InputError('Alle Gruppenmitglieder benötigen ein aktives Konto mit Chat-Zugriff.');
        }
        return ids;
    }
    async function mentions(value: string, allowed: (u: User) => boolean | Promise<boolean>) {
        const found = new Map<number, any>(), all: User[] = [];
        for (const candidate of await users.list())
            if (candidate.active && await allowed(candidate))
                all.push(candidate);
        for (const match of value.matchAll(/(?<![\w@])@([A-Za-z0-9._-]{3,64})/g)) {
            const key = match[1].toLowerCase();
            const user = all.find((u: User) => u.username.toLowerCase() === key) || all.find((u: User) => u.username.toLowerCase() === key.replace(/[.-]+$/, ''));
            if (user)
                found.set(user.id, { id: user.id, username: user.username, displayName: user.displayName });
        }
        return [...found.values()];
    }
    async function notify(eventKey: string, userId: number, kind: string, href: string) {
        if (!(await preferences.get('notifications')).inApp)
            return;
        const title = ['returnMention','disposalMention'].includes(kind) ? 'In einem Kommentar erwähnt' : kind === 'chatMention' ? 'Im Chat erwähnt' : 'Neue Chatnachricht';
        await db.query("INSERT INTO notifications(eventKey,userId,kind,title,message,href,createdAt) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING id", [eventKey, userId, kind, title, kind==='disposalMention'?'Ein Kommentar zu einem Geräteauftrag wartet auf dich.':kind === 'returnMention' ? 'Ein Kommentar zu einer Retoure wartet auf dich.' : 'Öffne die Unterhaltung, um die Nachricht zu lesen.', href, at()]);
    }
    async function notifyDisposal(user:User,disposalId:number,commentId:number,refs:any[]){
        const row=(await db.query('SELECT disposalNumber FROM disposals WHERE id=$1',[disposalId])).rows[0];
        for(const target of refs)if(target.id!==user.id)await notify(`disposal-comment:${disposalId}:${commentId}:${target.id}`,target.id,'disposalMention','/#disposals?record='+encodeURIComponent(row.disposalNumber));
    }
    async function notifyChat(user: User, c: Channel, messageId: number, refs: any[], normal: boolean) {
        const targets = new Set<number>(normal && c.kind !== 'public' ? await memberIds(c.id) : []);
        for (const ref of refs)
            targets.add(ref.id);
        for (const target of targets) {
            const u = await users.get(target);
            if (target !== user.id && await accessible(u, c))
                await notify(`chat:${c.id}:${messageId}:${target}`, target, refs.some(r => r.id === target) ? 'chatMention' : 'chatMessage', `/chat#channel-${c.id}`);
        }
    }
    function limit(user: User) {
        let item = rate.get(user.id);
        if (!item || item.until < now()) {
            if (rate.size > 1000)
                for (const [n, v] of rate)
                    if (v.until < now())
                        rate.delete(n);
            item = { n: 0, until: now() + 60000 };
            rate.set(user.id, item);
        }
        if (++item.n > 120)
            throw new InputError('Zu viele Nachrichten. Bitte kurz warten.', 429);
    }
    async function messageView(user: User, row: any, moderate: boolean, write: PermissionKey) { const author = await users.get(row.authorId), chat = write === 'chatSend', c = chat ? (await db.query("SELECT * FROM chat_channels WHERE id=$1", [row.channelId])).rows[0] : null; return { id: row.id, author: { id: row.authorId, username: author?.username ?? '', displayName: author?.displayName ?? 'Gelöschtes Konto', active: !!author?.active }, text: row.deleted ? '' : row.text, mentions: row.deleted ? [] : JSON.parse(row.mentions), createdAt: row.createdAt, editedAt: row.editedAt, deleted: !!row.deleted, ...(chat ? { attachments: row.deleted ? [] : await chatFiles.list(row.id), pinned: !row.deleted && !!(await db.query("SELECT 1 FROM chat_message_pins WHERE messageId=$1", [row.id])).rows[0], canPin: !!c && canPin(user, c, row) } : {}), canEdit: !row.deleted && !!row.text && row.authorId === user.id && hasPermission(user, write), canDelete: !row.deleted && (row.authorId === user.id && hasPermission(user, write) || moderate) }; }
    async function history(user: User, table: string, field: string, value: number, query: any, moderate: boolean, write: PermissionKey) {
        const before = query.before === undefined ? null : Number(query.before), after = query.after === undefined ? null : Number(query.after);
        if (before !== null)
            id(before);
        if (after !== null && (!Number.isSafeInteger(after) || after < 0))
            throw new InputError('Ungültige Lesemarkierung.');
        if ([before !== null, after !== null, query.ids !== undefined].filter(Boolean).length > 1)
            throw new InputError('Bitte nur einen Verlaufsausschnitt anfragen.');
        const total = Number((await db.query(`SELECT COUNT(*) AS n FROM ${table} WHERE ${field}=$1`, [value])).rows[0].n);
        if (query.ids !== undefined) {
            if (typeof query.ids !== 'string' || query.ids.length > 4000 || !/^\d+(,\d+)*$/.test(query.ids))
                throw new InputError('Ungültige Nachrichtenauswahl.');
            const ids = [...new Set(query.ids.split(',').map((n: string) => id(Number(n))))];
            if (ids.length > 200)
                throw new InputError('Zu viele Nachrichten ausgewählt.');
            const rows = (await db.query(`SELECT * FROM ${table} WHERE ${field}=$1 AND id IN (${ids.map((_, i) => '$' + (i + 2)).join(',')}) ORDER BY id`, [value, ...ids])).rows;
            return { items: await Promise.all(rows.map(async (r: any) => messageView(user, r, moderate, write))), hasMore: false, total };
        }
        const rows = (await db.query(`SELECT * FROM ${table} WHERE ${field}=$1${before !== null ? ' AND id<$2' : after !== null ? ' AND id>$2' : ''} ORDER BY id ${after !== null ? 'ASC' : 'DESC'} LIMIT 51`, [value, ...(before !== null ? [before] : after !== null ? [after] : [])])).rows, page = rows.slice(0, 50);
        return { items: await Promise.all((after !== null ? page : page.reverse()).map(async (r: any) => messageView(user, r, moderate, write))), hasMore: rows.length > 50, total };
    }
    const api = {
        directory,
        dispose: () => chatFiles.dispose(),
        async assertAttachmentAccess(user: User, attachmentId: number) {
            const item = await chatFiles.get(id(attachmentId)), message = (await db.query("SELECT * FROM chat_messages WHERE id=$1 AND deleted=0", [item.messageId])).rows[0];
            if (!message)
                throw missing();
            await channel(user, message.channelId);
            return item;
        },
        async readAttachment(user: User, attachmentId: number) { return chatFiles.read(await api.assertAttachmentAccess(user, attachmentId)); },
        async uploadAttachment(channelId: number, req: IncomingMessage, getUser: () => User, coordinate: (job: () => any) => Promise<any> | any) { return chatFiles.upload(id(channelId), req, async () => { const user = await getUser(); await channel(user, channelId); right(user, 'chatSend'); }, async (item) => { const user = await getUser(), c = await channel(user, channelId); right(user, 'chatSend'); limit(user); const n = Number((await db.query("INSERT INTO chat_messages(channelId,authorId,text,mentions,createdAt) VALUES($1,$2,'','[]',$3) RETURNING id", [c.id, user.id, at()])).rows[0].id); await chatFiles.insert(n, item); await notifyChat(user, c, n, [], true); return messageView(user, (await db.query("SELECT * FROM chat_messages WHERE id=$1", [n])).rows[0], c.visibility === 'public' && hasPermission(user, 'chatModerate'), 'chatSend'); }, coordinate); },
        async channels(user: User) {
            right(user, 'chatRead');
            const visible = [];
            for (const candidate of (await db.query('SELECT * FROM chat_channels')).rows)
                if (await accessible(user, candidate))
                    visible.push(await channelView(user, candidate));
            return visible.sort((a: any, b: any) => (b.lastMessage?.id ?? 0) - (a.lastMessage?.id ?? 0) || a.id - b.id);
        },
        async getChannel(user: User, channelId: number) { const c = await channel(user, channelId); return { ...await channelView(user, c), pins: (await api.pins(user, c.id)).items }; },
        async createChannel(user: User, input: any) {
            return store.transaction(async () => {
                right(user, 'chatRead');
                let n: number;
                if (input.kind === 'direct') {
                    right(user, 'chatSend');
                    const target = await users.get(id(input.userId));
                    if (!target?.active || !hasPermission(target, 'chatRead') || target.id === user.id)
                        throw new InputError('Bitte eine andere Person mit aktivem Chat-Zugriff wählen.');
                    const key = [user.id, target.id].sort((a, b) => a - b).join(':');
                    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [db.schema + ':direct:' + key]);
                    const existing = (await db.query("SELECT id FROM chat_channels WHERE directKey=$1", [key])).rows[0];
                    if (existing)
                        return api.getChannel(user, existing.id);
                    n = Number((await db.query("INSERT INTO chat_channels(kind,visibility,name,directKey,createdAt) VALUES('direct','private','Privatnachricht',$1,$2) RETURNING id", [key, at()])).rows[0].id);
                    for (const person of [user.id, target.id])
                        await db.query("INSERT INTO chat_members(channelId,userId) VALUES($1,$2)", [n, person]);
                }
                else if (input.kind === 'group') {
                    right(user, 'chatGroupsCreate');
                    const name = text(input.name, 80), visibility = input.visibility ?? 'private';
                    if (!['public', 'private'].includes(visibility))
                        throw new InputError('Ungültige Sichtbarkeit.');
                    const ids = await activeMembers(input.memberIds ?? [], user.id);
                    n = Number((await db.query("INSERT INTO chat_channels(kind,visibility,name,ownerId,createdAt) VALUES('group',$1,$2,$3,$4) RETURNING id", [visibility, name, user.id, at()])).rows[0].id);
                    for (const person of ids)
                        await db.query("INSERT INTO chat_members(channelId,userId) VALUES($1,$2)", [n, person]);
                }
                else
                    throw new InputError('Bitte Privatnachricht oder Gruppe wählen.');
                return api.getChannel(user, n);
            });
        },
        async updateChannel(user: User, channelId: number, input: any) {
            return store.transaction(async () => {
                const c = await channel(user, channelId);
                if (!canManage(user, c))
                    throw new InputError('Nur die Gruppenleitung darf Mitglieder verwalten.', 403);
                if (Object.hasOwn(input, 'visibility') && input.visibility !== c.visibility)
                    throw new InputError('Die Sichtbarkeit einer bestehenden Gruppe bleibt unverändert.');
                if (Object.hasOwn(input, 'name'))
                    await db.query("UPDATE chat_channels SET name=$1 WHERE id=$2", [text(input.name, 80), c.id]);
                if (Object.hasOwn(input, 'memberIds')) {
                    const ids = await activeMembers(input.memberIds, c.ownerId);
                    for (const n of await memberIds(c.id))
                        if (!ids.includes(n)) {
                            await db.query("DELETE FROM chat_members WHERE channelId=$1 AND userId=$2", [c.id, n]);
                            await db.query("DELETE FROM notifications WHERE userId=$1 AND kind IN ('chatMessage','chatMention') AND href=$2", [n, `/chat#channel-${c.id}`]);
                        }
                    for (const n of ids)
                        await db.query("INSERT INTO chat_members(channelId,userId) VALUES($1,$2) ON CONFLICT(channelId,userId) DO UPDATE SET joined=1", [c.id, n]);
                }
                return api.getChannel(user, c.id);
            });
        },
        async join(user: User, channelId: number) {
            const c = await channel(user, channelId);
            if (c.kind !== 'group' || c.visibility !== 'public')
                throw missing();
            await db.query("INSERT INTO chat_members(channelId,userId) VALUES($1,$2) ON CONFLICT(channelId,userId) DO UPDATE SET joined=1", [c.id, user.id]);
            return api.getChannel(user, c.id);
        },
        async leave(user: User, channelId: number) {
            const c = await channel(user, channelId);
            if (c.kind !== 'group')
                throw new InputError('Nur Gruppen können verlassen werden.');
            if (c.ownerId === user.id)
                throw new InputError('Als Gruppenleitung kannst du die Gruppe nicht verlassen.');
            if (c.visibility === 'public')
                await db.query("UPDATE chat_members SET joined=0 WHERE channelId=$1 AND userId=$2", [c.id, user.id]);
            else
                await db.query("DELETE FROM chat_members WHERE channelId=$1 AND userId=$2", [c.id, user.id]);
            await db.query("DELETE FROM notifications WHERE userId=$1 AND kind IN ('chatMessage','chatMention') AND href=$2", [user.id, `/chat#channel-${c.id}`]);
            return { ok: true };
        },
        async messages(user: User, channelId: number, query: any = {}) { const c = await channel(user, channelId); return history(user, 'chat_messages', 'channelId', c.id, query, c.visibility === 'public' && hasPermission(user, 'chatModerate'), 'chatSend'); },
        async searchMessages(user: User, channelId: number, query: any = {}) {
            const c = await channel(user, channelId), value = text(query.q, 200), before = query.before === undefined ? null : id(Number(query.before));
            if (query.after !== undefined || query.ids !== undefined)
                throw new InputError('Bitte nur einen Verlaufsausschnitt anfragen.');
            const found = (await db.query(`SELECT * FROM chat_messages WHERE channelId=$1 AND deleted=0 AND strpos(lower(normalize(text,NFKC)),lower(normalize($2::text,NFKC)))>0${before !== null ? ' AND id<$3' : ''} ORDER BY id DESC LIMIT 51`, [c.id, value, ...(before !== null ? [before] : [])])).rows, page = found.slice(0, 50);
            return { items: await Promise.all(page.map(async (row: any) => messageView(user, row, c.visibility === 'public' && hasPermission(user, 'chatModerate'), 'chatSend'))), hasMore: found.length > 50, nextBefore: found.length > 50 ? page.at(-1).id : null };
        },
        async pins(user: User, channelId: number) { const c = await channel(user, channelId), rows = (await db.query("SELECT m.* FROM chat_messages m JOIN chat_message_pins p ON p.messageId=m.id WHERE m.channelId=$1 AND m.deleted=0 ORDER BY p.pinnedAt DESC,m.id DESC LIMIT 50", [c.id])).rows; return { items: await Promise.all(rows.map(async (row: any) => messageView(user, row, c.visibility === 'public' && hasPermission(user, 'chatModerate'), 'chatSend'))) }; },
        async pinMessage(user: User, messageId: number, input: any) {
            return store.transaction(async () => {
                const row = (await db.query("SELECT * FROM chat_messages WHERE id=$1", [id(messageId)])).rows[0];
                if (!row)
                    throw missing();
                const c = await channel(user, row.channelId);
                if (row.deleted)
                    throw new InputError('Nachricht wurde bereits gelöscht.', 409);
                if (!canPin(user, c, row))
                    throw new InputError('Du darfst diese Nachricht nicht anheften.', 403);
                if (!input || typeof input.pinned !== 'boolean')
                    throw new InputError('Ungültige Anheftung.');
                if (input.pinned) {
                    const existing = (await db.query("SELECT 1 FROM chat_message_pins WHERE messageId=$1", [row.id])).rows[0];
                    if (!existing && Number((await db.query("SELECT COUNT(*) AS n FROM chat_message_pins p JOIN chat_messages m ON m.id=p.messageId WHERE m.channelId=$1 AND m.deleted=0", [c.id])).rows[0].n) >= 50)
                        throw new InputError('Pro Unterhaltung können höchstens 50 Nachrichten angeheftet werden.');
                    await db.query("INSERT INTO chat_message_pins(messageId,pinnedById,pinnedAt) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [row.id, user.id, at()]);
                }
                else
                    await db.query("DELETE FROM chat_message_pins WHERE messageId=$1", [row.id]);
                return messageView(user, row, c.visibility === 'public' && hasPermission(user, 'chatModerate'), 'chatSend');
            });
        },
        async postMessage(user: User, channelId: number, input: any) { return store.transaction(async () => { const c = await channel(user, channelId); right(user, 'chatSend'); const value = text(input.text), refs = await mentions(value, async (u) => accessible(u, c)); limit(user); const n = Number((await db.query("INSERT INTO chat_messages(channelId,authorId,text,mentions,createdAt) VALUES($1,$2,$3,$4,$5) RETURNING id", [c.id, user.id, value, JSON.stringify(refs), at()])).rows[0].id); await notifyChat(user, c, n, refs, true); return messageView(user, (await db.query("SELECT * FROM chat_messages WHERE id=$1", [n])).rows[0], false, 'chatSend'); }); },
        async changeMessage(user: User, messageId: number, input: any, remove = false) {
            return store.transaction(async () => {
                const row = (await db.query("SELECT * FROM chat_messages WHERE id=$1", [id(messageId)])).rows[0];
                if (!row)
                    throw missing();
                const c = await channel(user, row.channelId), own = row.authorId === user.id && hasPermission(user, 'chatSend'), moderate = c.visibility === 'public' && hasPermission(user, 'chatModerate');
                if (!own && !(remove && moderate))
                    throw new InputError('Du darfst diese Nachricht nicht ändern.', 403);
                if (row.deleted)
                    throw new InputError('Nachricht wurde bereits gelöscht.', 409);
                if (remove) {
                    await chatFiles.removeMessage(row.id);
                    await db.query("DELETE FROM chat_message_pins WHERE messageId=$1", [row.id]);
                    await db.query("UPDATE chat_messages SET deleted=1,editedAt=$1 WHERE id=$2", [at(), row.id]);
                }
                else {
                    if (!row.text && (await chatFiles.list(row.id)).length)
                        throw new InputError('Dateinachrichten können nur gelöscht werden.');
                    const value = text(input.text), refs = await mentions(value, async (u) => accessible(u, c));
                    await db.query("UPDATE chat_messages SET text=$1,mentions=$2,editedAt=$3 WHERE id=$4", [value, JSON.stringify(refs), at(), row.id]);
                    await notifyChat(user, c, row.id, refs, false);
                }
                return messageView(user, (await db.query("SELECT * FROM chat_messages WHERE id=$1", [row.id])).rows[0], moderate, 'chatSend');
            });
        },
        async markRead(user: User, channelId: number, input: any) {
            const c = await channel(user, channelId), last = (await db.query("SELECT MAX(id) AS n FROM chat_messages WHERE channelId=$1", [c.id])).rows[0].n ?? 0, target = input.messageId === undefined ? last : id(input.messageId);
            if (target > last || target && !(await db.query("SELECT 1 FROM chat_messages WHERE channelId=$1 AND id=$2", [c.id, target])).rows[0])
                throw new InputError('Ungültige Lesemarkierung.');
            await db.query("INSERT INTO chat_members(channelId,userId,lastReadId,joined) VALUES($1,$2,$3,$4) ON CONFLICT(channelId,userId) DO UPDATE SET lastReadId=GREATEST(chat_members.lastReadId,excluded.lastReadId)", [c.id, user.id, target, c.kind === 'group' && c.visibility === 'public' ? 0 : 1]);
            return { ok: true };
        },
        async disposalComments(user:User,disposalId:number,query:any={}){
            right(user,'disposalsRead');if(!(await db.query('SELECT id FROM disposals WHERE id=$1',[id(disposalId)])).rowCount)throw new InputError('Geräteauftrag nicht gefunden.',404);
            return history(user,'disposal_comments','disposalId',disposalId,query,hasPermission(user,'disposalsCommentsModerate'),'disposalsCommentsCreate');
        },
        async postDisposalComment(user:User,disposalId:number,input:any){
            return store.transaction(async()=>{right(user,'disposalsRead');right(user,'disposalsCommentsCreate');
                if(!(await db.query('SELECT id FROM disposals WHERE id=$1',[id(disposalId)])).rowCount)throw new InputError('Geräteauftrag nicht gefunden.',404);
                const value=text(input.text),refs=await mentions(value,u=>hasPermission(u,'disposalsRead'));limit(user);
                const n=(await db.query('INSERT INTO disposal_comments(disposalId,authorId,text,mentions,createdAt) VALUES($1,$2,$3,$4,$5) RETURNING id',[disposalId,user.id,value,JSON.stringify(refs),at()])).rows[0].id;
                await notifyDisposal(user,disposalId,n,refs);
                return messageView(user,(await db.query('SELECT * FROM disposal_comments WHERE id=$1',[n])).rows[0],hasPermission(user,'disposalsCommentsModerate'),'disposalsCommentsCreate');
            });
        },
        async changeDisposalComment(user:User,disposalId:number,commentId:number,input:any,remove=false){
            return store.transaction(async()=>{right(user,'disposalsRead');
                if(!(await db.query('SELECT id FROM disposals WHERE id=$1',[id(disposalId)])).rowCount)throw new InputError('Geräteauftrag nicht gefunden.',404);
                const row=(await db.query('SELECT * FROM disposal_comments WHERE id=$1 AND disposalId=$2',[id(commentId),disposalId])).rows[0];if(!row)throw new InputError('Kommentar nicht gefunden.',404);
                const own=row.authorId===user.id&&hasPermission(user,'disposalsCommentsCreate'),moderate=hasPermission(user,'disposalsCommentsModerate');if(!own&&!(remove&&moderate))throw new InputError('Du darfst diesen Kommentar nicht ändern.',403);if(row.deleted)throw new InputError('Kommentar wurde bereits gelöscht.',409);
                if(remove)await db.query('UPDATE disposal_comments SET deleted=1,editedAt=$1 WHERE id=$2',[at(),row.id]);
                else{const value=text(input.text),refs=await mentions(value,u=>hasPermission(u,'disposalsRead'));await db.query('UPDATE disposal_comments SET text=$1,mentions=$2,editedAt=$3 WHERE id=$4',[value,JSON.stringify(refs),at(),row.id]);await notifyDisposal(user,disposalId,row.id,refs);}
                return messageView(user,(await db.query('SELECT * FROM disposal_comments WHERE id=$1',[row.id])).rows[0],moderate,'disposalsCommentsCreate');
            });
        },
        async comments(user: User, returnId: number, query: any = {}) { await existingReturn(returnId); return history(user, 'return_comments', 'returnId', returnId, query, hasPermission(user, 'commentsModerate'), 'commentsCreate'); },
        async postComment(user: User, returnId: number, input: any) {
            return store.transaction(async () => {
                right(user, 'commentsCreate');
                await existingReturn(returnId);
                const value = text(input.text), refs = await mentions(value, () => true);
                limit(user);
                const n = Number((await db.query("INSERT INTO return_comments(returnId,authorId,text,mentions,createdAt) VALUES($1,$2,$3,$4,$5) RETURNING id", [returnId, user.id, value, JSON.stringify(refs), at()])).rows[0].id);
                for (const target of refs)
                    if (target.id !== user.id)
                        await notify(`comment:${returnId}:${n}:${target.id}`, target.id, 'returnMention', `/#returns?detail=${returnId}`);
                return messageView(user, (await db.query("SELECT * FROM return_comments WHERE id=$1", [n])).rows[0], hasPermission(user, 'commentsModerate'), 'commentsCreate');
            });
        },
        async changeComment(user: User, returnId: number, commentId: number, input: any, remove = false) {
            return store.transaction(async () => {
                await existingReturn(returnId);
                const row = (await db.query("SELECT * FROM return_comments WHERE id=$1 AND returnId=$2", [id(commentId), returnId])).rows[0];
                if (!row)
                    throw new InputError('Kommentar nicht gefunden.', 404);
                const own = row.authorId === user.id && hasPermission(user, 'commentsCreate'), moderate = hasPermission(user, 'commentsModerate');
                if (!own && !(remove && moderate))
                    throw new InputError('Du darfst diesen Kommentar nicht ändern.', 403);
                if (row.deleted)
                    throw new InputError('Kommentar wurde bereits gelöscht.', 409);
                if (remove)
                    await db.query("UPDATE return_comments SET deleted=1,editedAt=$1 WHERE id=$2", [at(), row.id]);
                else {
                    const value = text(input.text), refs = await mentions(value, () => true);
                    await db.query("UPDATE return_comments SET text=$1,mentions=$2,editedAt=$3 WHERE id=$4", [value, JSON.stringify(refs), at(), row.id]);
                    for (const target of refs)
                        if (target.id !== user.id)
                            await notify(`comment:${returnId}:${row.id}:${target.id}`, target.id, 'returnMention', `/#returns?detail=${returnId}`);
                }
                return messageView(user, (await db.query("SELECT * FROM return_comments WHERE id=$1", [row.id])).rows[0], moderate, 'commentsCreate');
            });
        },
        async pruneNotifications(user: User) {
            // The caller holds the mutation coordinator. Reuse only this call's
            // access result; another request must observe revoked membership.
            const accessByHref=new Map<string,boolean>(),remove:number[]=[];
            for (const item of (await db.query("SELECT id,href FROM notifications WHERE userId=$1 AND kind IN ('chatMessage','chatMention','returnMention','disposalMention')", [user.id])).rows) {
                if(!accessByHref.has(item.href)){
                    let allowed = false;
                    const chat = item.href.match(/^\/chat#channel-(\d+)$/), ret = item.href.match(/^\/#returns\?detail=(\d+)$/),disposal=item.href.match(/^\/#disposals\?record=([^&]+)$/);
                    if (chat) {
                        const c = (await db.query("SELECT * FROM chat_channels WHERE id=$1", [Number(chat[1])])).rows[0];
                        allowed = !!c && await accessible(user, c);
                    }
                    else if (ret)
                        allowed = !!(await db.query("SELECT 1 FROM returns WHERE id=$1", [Number(ret[1])])).rows[0];
                    else if(disposal&&hasPermission(user,'disposalsRead')){let number='';try{number=decodeURIComponent(disposal[1]);}catch{}allowed=!!(await db.query('SELECT 1 FROM disposals WHERE disposalNumber=$1',[number])).rowCount;}
                    accessByHref.set(item.href,allowed);
                }
                if(!accessByHref.get(item.href))remove.push(item.id);
            }
            if(remove.length)await db.query('DELETE FROM notifications WHERE userId=$1 AND id=ANY($2::bigint[])',[user.id,remove]);
        }
    };
    return api;
}
