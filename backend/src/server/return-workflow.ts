import {createReturnTransitions} from './return-transitions.js';
import {checkRecordRevision,advanceRecordRevision} from './database/record-metadata.js';
import { readReturnTimeline } from './return-timeline.js';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { InputError } from '../shared/model.js';
import { hasPermission, type PermissionUser } from '../shared/permissions.js';
export type TimelineItem = {
    id: string;
    type: 'created' | 'status' | 'assignment' | 'nextStep' | 'comment' | 'attachment';
    at: string;
    actorName: string;
    text: string;
    returnId: number;
    commentId?: number;
    attachmentId?: number;
    reopenReason?: string;
    fromStatus?: string;
    toStatus?: string;
    fromStatusId?: number | null;
    toStatusId?: number | null;
};
type Cursor = {
    v: 1;
    r: number;
    at: string;
    id: string;
};
const selectionError = () => new InputError('Bitte 1 bis 200 unterschiedliche Retouren mit gültigen IDs auswählen.');
function positiveId(value: unknown): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
        throw new InputError('Ungültige ID.');
    return value;
}
export function returnSelection(value: unknown): number[] {
    if (!Array.isArray(value) || value.length < 1 || value.length > 200 || value.some(n => typeof n !== 'number' || !Number.isSafeInteger(n) || n < 1) || new Set(value).size !== value.length)
        throw selectionError();
    return value;
}
export function createReturnWorkflow({ store, users, now = Date.now }: any) {
    const db = store.db, cursorKey = randomBytes(32),transition=createReturnTransitions(store);
    type UndoRow = {
        id: number;
        statusId: number;
        fingerprint: string;
        auditId: number;
    };
    const undoTokens = new Map<string, {
        actorId: number;
        expires: number;
        rows: UndoRow[];
    }>();
    const lockReturns = async (ids: number[]) => { await db.query(`SELECT id FROM returns WHERE id IN (${ids.map((_, i) => '$' + (i + 1)).join(',')}) ORDER BY id FOR UPDATE`, [...ids].sort((a, b) => a - b)); };
    const statusRight = (user: PermissionUser) => {
        if (!hasPermission(user, 'returnsStatus'))
            throw new InputError('Du darfst den Retourenstatus nicht ändern.', 403);
    };
    async function revision(id: number) {
        const raw = (await db.query("SELECT * FROM returns WHERE id=$1", [id])).rows[0];
        const auditId = Number((await db.query("SELECT COALESCE(MAX(id),0) AS id FROM audit WHERE entity='returns' AND entityId=$1", [String(id)])).rows[0].id);
        return { fingerprint: JSON.stringify(raw ?? null), auditId };
    }
    async function offerUndo(user: any, before: any[]) {
        if (!before.length)
            return null;
        const token = randomBytes(32).toString('base64url'), expires = now() + 12000;
        const rows: UndoRow[] = await Promise.all(before.map(async (row) => ({ id: row.id, statusId: row.statusId, ...await revision(row.id) })));
        // Publish/consume tokens only with the outer database commit. A failed batch
        // never creates a usable token or consumes a token whose writes rolled back.
        store.onCommit(() => {
            for (const [key, value] of undoTokens)
                if (value.expires <= now())
                    undoTokens.delete(key);
            if (undoTokens.size >= 2000)
                undoTokens.delete(undoTokens.keys().next().value!);
            undoTokens.set(token, { actorId: user.id, expires, rows });
        });
        return { token, expiresAt: new Date(expires).toISOString() };
    }
    function signature(payload: string) { return createHmac('sha256', cursorKey).update('return-timeline:' + payload).digest('base64url'); }
    function encodeCursor(cursor: Cursor) { const payload = Buffer.from(JSON.stringify(cursor)).toString('base64url'); return payload + '.' + signature(payload); }
    function decodeCursor(value: unknown, returnId: number): Cursor {
        try {
            if (typeof value !== 'string' || value.length > 500 || !/^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/.test(value))
                throw new Error();
            const [payload, mac] = value.split('.'), expected = signature(payload);
            if (!timingSafeEqual(Buffer.from(mac), Buffer.from(expected)))
                throw new Error();
            const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.keys(parsed).sort().join(',') !== 'at,id,r,v' || parsed.v !== 1 || parsed.r !== returnId || typeof parsed.at !== 'string' || parsed.at.length > 50 || !Number.isFinite(Date.parse(parsed.at)) || typeof parsed.id !== 'string' || !/^(?:audit:\d{16}:(?:created|status|assignment|nextStep)|comment:\d{16}|attachment:\d{16}|legacy:\d{16})$/.test(parsed.id))
                throw new Error();
            return parsed;
        }
        catch {
            throw new InputError('Ungültige Verlaufsmarkierung. Bitte den Verlauf erneut öffnen.');
        }
    }
    async function selected(ids: number[]) {
        return await Promise.all(ids.map(async (n) => {
            const ret = await store.getReturn(n);
            if (!ret)
                throw new InputError('Retoure nicht gefunden.', 404);
            return ret;
        }));
    }
    return {
        async completion(user:any,id:number){
            const state=await store.inspectReturnCompletion(positiveId(id)),disposals=state.disposals;delete state.disposals;
            return {completion:state,...(hasPermission(user,'disposalsRead')?{disposals}:{})};
        },
        transition,
        visibleRows(user:any,rows:any[]){return hasPermission(user,'disposalsRead')?rows:rows.map(({disposalSummary,...row})=>row);},
        async serialLookup(user:any,query:URLSearchParams){const serial=query.get('serialNumber');if(query.getAll('serialNumber').length!==1||typeof serial!=='string'||!serial.trim()||serial.length>250||/[\u0000-\u001f\u007f]/.test(serial))throw new InputError('Bitte eine gültige Seriennummer angeben.');const exclude=query.get('excludeId');if(query.getAll('excludeId').length>1||exclude!==null&&(!/^[1-9]\d*$/.test(exclude)||!Number.isSafeInteger(Number(exclude))))throw new InputError('Ungültige ID.');const found=await store.lookupReturnSerial(serial,exclude?Number(exclude):undefined);return {items:await this.enrichReturns(found.items,user),total:found.total};},
        async enrichReturns(rows: any[],user?:any) {
            if(!rows.length)return [];
            // Seek only the latest closed-state event for the selected closed
            // records, using the partial history index. No unrelated audit scan.
            const closedIds=rows.filter(row=>row.isClosed).map(row=>String(row.id));
            const completions = closedIds.length?(await db.query(`SELECT selected.entityId,last.createdAt FROM jsonb_array_elements_text($1::jsonb) AS selected(entityId)
 CROSS JOIN LATERAL(SELECT createdAt,(changes::jsonb#>>'{isClosed,after}')::boolean AS closed FROM audit
 WHERE entity='returns' AND action='update' AND entityId=selected.entityId AND jsonb_typeof(changes::jsonb#>'{isClosed,after}')='boolean' ORDER BY id DESC LIMIT 1) last WHERE last.closed`,[JSON.stringify(closedIds)])).rows:[];
            const dates = new Map(completions.map((row: any) => [Number(row.entityId), row.createdAt]));
            const linked:any[]=hasPermission(user,'disposalsRead')&&rows.length?(await db.query('SELECT id,disposalNumber,returnId,serialNumber,mode,status FROM disposals WHERE returnId=ANY($1::bigint[]) ORDER BY id DESC',[rows.map(row=>row.id)])).rows:[];
            const byReturn=new Map<number,any[]>();for(const item of linked){const items=byReturn.get(item.returnId)??[];items.push(item);byReturn.set(item.returnId,items);}
            return rows.map(row => {const items=byReturn.get(row.id)??[];return {...row,completedAt:row.isClosed?dates.get(row.id)??null:null,...(hasPermission(user,'disposalsRead')?{disposalSummary:{items,total:items.length,open:items.filter(item=>['planned','approved'].includes(item.status)).length,completed:items.filter(item=>item.status==='completed').length}}:{})};});
        },
        async assignees() { return (await users.list()).filter((user: any) => user.active).map(({ id, username, displayName }: any) => ({ id, username, displayName })); },
        async selectedExport(query: URLSearchParams) {
            const values = query.getAll('ids');
            if (!values.length)
                return store.listReturns();
            if (values.length !== 1 || values[0].length > 4000 || !/^\d+(,\d+)*$/.test(values[0]))
                throw selectionError();
            const ids = returnSelection(values[0].split(',').map(Number));
            return selected(ids);
        },
        async bulkStatus(user: PermissionUser, input: any) {
            statusRight(user);
            if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['ids', 'statusId','revisions'].includes(key)))
                throw selectionError();
            const ids = returnSelection(input.ids), statusId = positiveId(input.statusId);
            return store.transaction(async () => {
                await lockReturns(ids);
                if(input.revisions!==undefined)for(const id of ids)await checkRecordRevision(db,'returns',id,input.revisions[id]);
                await store.masters.resolve('statuses', statusId, null, true);
                const returns = await selected(ids);
                // Validate every row before the first audited write. The outer transaction
                // keeps later SQLite failures from leaving partial data or audit entries.
                const changed = returns.filter(ret => ret.statusId !== statusId);
                for (const ret of changed)
                    await store.prepareReturn({ ...ret, statusId }, ret.id);
                for (const ret of changed)
                    await store.updateReturn(ret.id, { ...ret, statusId });
                return { items: await selected(ids), updated: changed.length, undo: await offerUndo(user, changed) };
            });
        },
        async quickStatus(user: PermissionUser, returnId: number, input: any) {
            statusRight(user);
            positiveId(returnId);
            if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).filter(key=>key!=='revision').length !== 1 || Object.keys(input).some(key => !['status', 'statusId','revision'].includes(key)))
                throw new InputError('Bitte ausschließlich den neuen Status angeben.');
            return store.transaction(async () => {
                await lockReturns([returnId]);
                if(input.revision!==undefined)await checkRecordRevision(db,'returns',returnId,input.revision);
                const old = (await selected([returnId]))[0], value = { ...old, ...input };
                if (Object.hasOwn(input, 'status'))
                    delete value.statusId;
                const prepared = await store.prepareReturn(value, returnId);
                if (prepared.statusId === old.statusId)
                    return { ...old, undo: null };
                const result = await store.updateReturn(returnId, value);
                return { ...result, undo: await offerUndo(user, [old]) };
            });
        },
        async undoStatus(user: PermissionUser & {
            id?: number;
        }, input: any) {
            statusRight(user);
            if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 1 || typeof input.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(input.token))
                throw new InputError('Ungültige Rückgängig-Aktion.');
            const pending = undoTokens.get(input.token);
            if (!pending || pending.expires <= now())
                throw new InputError('Rückgängig ist nicht mehr verfügbar. Bitte den aktuellen Status prüfen.', 409);
            if (user.id !== pending.actorId)
                throw new InputError('Nur dein eigener Statuswechsel kann rückgängig gemacht werden.', 403);
            return store.transaction(async () => {
                await lockReturns(pending.rows.map(row => row.id));
                const rows = await Promise.all(pending.rows.map(async (expected) => {
                    const current = await store.getReturn(expected.id), actual = await revision(expected.id);
                    if (!current || actual.fingerprint !== expected.fingerprint || actual.auditId !== expected.auditId)
                        throw new InputError('Die Retoure wurde inzwischen geändert. Bitte den aktuellen Status prüfen.', 409);
                    const prepared = await store.prepareReturn({ ...current, statusId: expected.statusId }, current.id, { allowArchivedReferences: true,allowReopen:true,allowClosedEdit:true });
                    return { current, expected, prepared };
                }));
                for (const { current, expected, prepared } of rows) {
                    // BEGIN IMMEDIATE plus the checked revision makes this compare-and-swap
                    // atomic. Restore only status fields, and append the normal audit diff.
                    const result = await db.query("UPDATE returns SET statusId=$1,status=$2,updatedAt=$3 WHERE id=$4 AND statusId=$5 AND updatedAt=$6", [expected.statusId, prepared.status, new Date(now()).toISOString(), current.id, current.statusId, current.updatedAt]);
                    if (result.rowCount !== 1)
                        throw new InputError('Die Retoure wurde inzwischen geändert. Bitte den aktuellen Status prüfen.', 409);
                    await advanceRecordRevision(db,'returns',current.id);
                    await store.recordChange({ entity: 'returns', id: current.id, action: 'update', before: current, after: {...await store.getReturn(current.id),...(current.isClosed?{reopenReason:'Statuswechsel rückgängig gemacht.'}:{})} });
                }
                store.onCommit(() => undoTokens.delete(input.token));
                return { items: await selected(pending.rows.map(row => row.id)), updated: rows.length };
            });
        },
        async timeline(user: PermissionUser, returnId: number, query: URLSearchParams) { return readReturnTimeline({ store, encodeCursor, decodeCursor }, user, returnId, query); }
    };
}
