import { randomUUID } from 'node:crypto';
import type { SqlDatabase } from './database/types.js';
import type { Actor } from '../shared/types.js';
type Store = {
    db: SqlDatabase;
    transaction<T>(job: () => T | Promise<T>): Promise<T>;
};
export type Change = {
    entity: string;
    id?: number | string;
    action: string;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
};
const safeKeys = new Set(['reopenReason','completionRequiredFields','requireReplacementSerialOnExchange','requireCompletedDisposal','protectClosedReturns','exchangeResolutionIds','disposalResolutionIds','disposalNumber','mode','method','performedBy','completedOn','approvedByName','documentedByName','cancellationReason','correctionReason','name', 'sku', 'ean', 'manufacturer', 'supplier', 'category', 'priceCents', 'description', 'imageName', 'imageVersion', 'active', 'returnNumber', 'productId', 'serialNumber', 'replacementSerialNumber', 'orderNumber', 'customerReference', 'trackingNumber', 'receiptDate', 'quantity', 'reason', 'condition', 'status', 'statusId', 'resolution', 'notes', 'assignedUserId', 'assignedDisplayName', 'nextStep', 'username', 'displayName', 'role', 'permissions', 'originalName', 'returnId', 'mediaType', 'size', 'code', 'tone', 'isDefault', 'isClosed', 'requiredFields', 'deadlineDays', 'numberPrefix', 'timezone', 'companyName', 'pageSize', 'compact', 'animations', 'enabled', 'frequency', 'time', 'weekday', 'retain', 'uploadMaxMb', 'maxFilesPerReturn', 'sessionHours', 'port', 'publicOrigin', 'theme', 'reduceMotion', 'motionMode', 'inApp', 'newReturn', 'overdue', 'backupError', 'emailEnabled', 'smtpHost', 'smtpPort', 'smtpMode', 'smtpUser', 'from', 'recipients', 'eventTypes', 'delimiter', 'mapping', 'duplicates', 'revision']);
export function createChanges(store: Store) {
    async function run<T>(actor: Actor, change: Change, job: () => T | Promise<T>): Promise<T> {
        return store.transaction(async () => {
            const result = await job(), after = change.after ?? (result && typeof result === 'object' ? result as Record<string, unknown> : {}), before = change.before ?? {};
            const diffs: Record<string, {
                before: unknown;
                after: unknown;
            }> = {};
            for (const key of safeKeys)
                if (JSON.stringify(before[key]) !== JSON.stringify(after[key]))
                    diffs[key] = { before: before[key] ?? null, after: after[key] ?? null };
            const at = new Date().toISOString(), id = change.id ?? after.id;
            await store.db.query("INSERT INTO audit(createdAt,actorId,actorName,source,entity,entityId,action,operationId,changes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id", [at, actor.id, actor.name, actor.source, change.entity, id == null ? null : String(id), change.action, actor.operationId ?? null, JSON.stringify(diffs)]);
            if (change.entity === 'returns' && change.action === 'create')
                await store.db.query("INSERT INTO events(id,type,payload,createdAt) VALUES($1,$2,$3,$4)", [randomUUID(), 'newReturn', JSON.stringify({ id, returnNumber: after.returnNumber, operationId: actor.operationId }), at]);
            return result;
        });
    }
    return { run };
}
