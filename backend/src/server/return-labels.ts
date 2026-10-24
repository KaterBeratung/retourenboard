import { InputError } from '../shared/model.js';
import { requirePermission } from './permissions.js';
import { qrDataUrl } from '../vendor/qr.js';
/** QR labels contain the return identifier only; no customer or device data. */
export function returnLabelPayload(row: {
    returnNumber?: unknown;
}): string {
    if (typeof row?.returnNumber !== 'string' || !row.returnNumber.trim() || row.returnNumber.length > 100)
        throw new InputError('Retourennummer fehlt oder ist ungültig.');
    return row.returnNumber;
}
/** The host owns authentication and JSON headers. This route is read only. */
export async function handleReturnLabelRoute({ path, method, json, user, store }: any): Promise<boolean> {
    const match = path.match(/^\/api\/returns\/([1-9]\d*)\/label$/);
    if (!match || method !== 'GET')
        return false;
    const owner = await user();
    requirePermission(owner, 'returnsExport');
    const id = Number(match[1]);
    if (!Number.isSafeInteger(id))
        throw new InputError('Ungültige ID.');
    const row = await store.getReturn(id);
    if (!row)
        throw new InputError('Retoure nicht gefunden.', 404);
    const image = await qrDataUrl(returnLabelPayload(row), { margin: 4 });
    const current = await user();
    requirePermission(current, 'returnsExport');
    if (current.id !== owner.id)
        throw new InputError('Deine Anmeldung hat sich geändert. Bitte erneut versuchen.', 401);
    const fields = ['returnNumber', 'serialNumber', 'replacementSerialNumber', 'productName', 'sku', 'customerReference', 'trackingNumber', 'orderNumber', 'createdAt', 'receiptDate', 'status', 'reason', 'condition', 'resolution', 'supplier', 'nextStep'];
    json({ id: row.id, ...Object.fromEntries(fields.map(key => [key, typeof row[key] === 'string' ? row[key] : ''])), qrDataUrl: image });
    return true;
}
