export const STATUSES = ['Eingegangen', 'In Prüfung', 'In Bearbeitung', 'Abgeschlossen'];
export const CONDITIONS = ['Ungeprüft', 'Neuwertig', 'Gebraucht', 'Beschädigt', 'Defekt'];
export const REASONS = ['Defekt', 'Falschlieferung', 'Nicht gefallen', 'Transportschaden', 'Unvollständig', 'Sonstiges'];
export const RESOLUTIONS = ['Noch offen', 'Erstattung', 'Austausch', 'Reparatur', 'Wiedereinlagerung'];
// Original admin-v2 seed identities. Keep these IDs and names stable for upgrades.
export const BUILTIN_MASTERDATA = [
    { id: 1, kind: 'reasons', name: 'Defekt', key: 'reasons.defective' },
    { id: 2, kind: 'reasons', name: 'Falschlieferung', key: 'reasons.wrongDelivery' },
    { id: 3, kind: 'reasons', name: 'Nicht gefallen', key: 'reasons.disliked' },
    { id: 4, kind: 'reasons', name: 'Transportschaden', key: 'reasons.transportDamage' },
    { id: 5, kind: 'reasons', name: 'Unvollständig', key: 'reasons.incomplete' },
    { id: 6, kind: 'reasons', name: 'Sonstiges', key: 'reasons.other' },
    { id: 7, kind: 'conditions', name: 'Ungeprüft', key: 'conditions.unchecked' },
    { id: 8, kind: 'conditions', name: 'Neuwertig', key: 'conditions.likeNew' },
    { id: 9, kind: 'conditions', name: 'Gebraucht', key: 'conditions.used' },
    { id: 10, kind: 'conditions', name: 'Beschädigt', key: 'conditions.damaged' },
    { id: 11, kind: 'conditions', name: 'Defekt', key: 'conditions.defective' },
    { id: 12, kind: 'statuses', name: 'Eingegangen', key: 'statuses.received' },
    { id: 13, kind: 'statuses', name: 'In Prüfung', key: 'statuses.checking' },
    { id: 14, kind: 'statuses', name: 'In Bearbeitung', key: 'statuses.working' },
    { id: 15, kind: 'statuses', name: 'Abgeschlossen', key: 'statuses.completed' },
    { id: 16, kind: 'resolutions', name: 'Noch offen', key: 'resolutions.pending' },
    { id: 17, kind: 'resolutions', name: 'Erstattung', key: 'resolutions.refund' },
    { id: 18, kind: 'resolutions', name: 'Austausch', key: 'resolutions.exchange' },
    { id: 19, kind: 'resolutions', name: 'Reparatur', key: 'resolutions.repair' },
    { id: 20, kind: 'resolutions', name: 'Wiedereinlagerung', key: 'resolutions.restock' }
];
export const MASTER_KINDS = { suppliers: 'Lieferanten', manufacturers: 'Hersteller', categories: 'Kategorien', reasons: 'Retourengründe', conditions: 'Zustände', statuses: 'Status', resolutions: 'Lösungen' };
export const PRODUCT_REFS = { supplier: 'suppliers', manufacturer: 'manufacturers', category: 'categories' };
export const RETURN_REFS = { supplier: 'suppliers', reason: 'reasons', condition: 'conditions', status: 'statuses', resolution: 'resolutions' };
export const PRODUCT_COLUMNS = { sku: 'Artikelnummer', name: 'Produktname', ean: 'EAN', manufacturer: 'Hersteller', supplier: 'Lieferant', category: 'Kategorie', price: 'Preis', description: 'Beschreibung', active: 'Aktiv' };
export const RETURN_COLUMNS = { returnNumber: 'Retourennummer', sku: 'Artikelnummer', productName: 'Produktname', supplier: 'Lieferant', serialNumber: 'Seriennummer', replacementSerialNumber: 'Austauschseriennummer', orderNumber: 'Bestellnummer', customerReference: 'Kundenreferenz', trackingNumber: 'Sendungsnummer', receiptDate: 'Eingangsdatum', quantity: 'Menge', reason: 'Retourengrund', condition: 'Zustand', status: 'Status', resolution: 'Lösung', notes: 'Notizen', assignedUserId: 'Zuständig (Konto-ID)', nextStep: 'Nächster Schritt' };
export const RETURN_IMPORT_COLUMNS = { ...RETURN_COLUMNS, ean: 'EAN', manufacturer: 'Hersteller', category: 'Kategorie', price: 'Produktpreis', description: 'Produktbeschreibung' };
export class InputError extends Error {
    status;
    constructor(message, status = 400) { super(message); this.status = status; }
}
function text(input, key, label, required = false, max = 250) {
    const value = input[key] ?? '';
    if (typeof value !== 'string' || value.length > max)
        throw new InputError(`${label}: maximal ${max} Zeichen erlaubt.`);
    const result = value.trim();
    if (required && !result)
        throw new InputError(`${label} ist erforderlich.`);
    return result;
}
function choice(input, key, values, fallback) {
    const value = input[key] || fallback;
    if (typeof value !== 'string' || !values.includes(value))
        throw new InputError(`Ungültiger Wert für ${key}.`);
    return value;
}
export function validateProduct(input) {
    const ean = text(input, 'ean', 'EAN');
    if (ean && !/^(\d{8}|\d{12,14})$/.test(ean))
        throw new InputError('EAN muss 8, 12, 13 oder 14 Ziffern enthalten.');
    let priceCents = input.priceCents ?? 0;
    if (input.price !== undefined && input.price !== '') {
        if (!['number', 'string'].includes(typeof input.price))
            throw new InputError('Ungültiger Preis.');
        const price = String(input.price).trim().replace(',', '.');
        if (!/^\d{1,7}(\.\d{1,2})?$/.test(price))
            throw new InputError('Preis muss ein positiver Betrag mit maximal zwei Nachkommastellen sein.');
        priceCents = Math.round(Number(price) * 100);
    }
    if (typeof priceCents !== 'number' || !Number.isSafeInteger(priceCents) || priceCents < 0 || priceCents > 999999999)
        throw new InputError('Ungültiger Preis.');
    let active = input.active ?? true;
    if (typeof active === 'string') {
        if (['true', '1', 'ja', 'aktiv'].includes(active.toLowerCase()))
            active = true;
        else if (['false', '0', 'nein', 'archiviert'].includes(active.toLowerCase()))
            active = false;
        else
            throw new InputError('Aktiv muss ja oder nein sein.');
    }
    if (typeof active !== 'boolean')
        throw new InputError('Ungültiger Aktivstatus.');
    return {
        name: text(input, 'name', 'Produktname', true), sku: text(input, 'sku', 'Artikelnummer', true, 100), ean,
        manufacturer: text(input, 'manufacturer', 'Hersteller'), supplier: text(input, 'supplier', 'Lieferant'),
        category: text(input, 'category', 'Kategorie'), priceCents, description: text(input, 'description', 'Beschreibung', false, 5000), active
    };
}
export function validateReturn(input, choices = {}, {requireSerialNumber=true} = {}) {
    const numeric = (value) => typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value.trim()));
    if (!numeric(input.productId) || !numeric(input.quantity === undefined ? 1 : input.quantity))
        throw new InputError('Produkt und Menge müssen gültige ganze Zahlen sein.');
    const productId = Number(input.productId), quantity = Number(input.quantity === undefined ? 1 : input.quantity);
    if (!Number.isSafeInteger(productId) || productId <= 0)
        throw new InputError('Bitte ein Produkt auswählen.');
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000)
        throw new InputError('Menge muss zwischen 1 und 10.000 liegen.');
    const assignment = input.assignedUserId ?? null;
    if (assignment !== null && (!numeric(assignment) || !Number.isSafeInteger(Number(assignment)) || Number(assignment) < 1))
        throw new InputError('Zuständigkeit muss eine gültige Konto-ID sein.');
    const assignedUserId = assignment === null ? null : Number(assignment);
    const serialNumber = text(input, 'serialNumber', 'Seriennummer', requireSerialNumber);
    const receiptDate = text(input, 'receiptDate', 'Eingangsdatum', false, 10);
    const date = new Date(`${receiptDate}T12:00:00Z`);
    if (receiptDate && (!/^\d{4}-\d{2}-\d{2}$/.test(receiptDate) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== receiptDate))
        throw new InputError('Bitte ein gültiges Eingangsdatum angeben.');
    return {
        productId, quantity, receiptDate, returnNumber: text(input, 'returnNumber', 'Retourennummer', false, 100),
        serialNumber, replacementSerialNumber: text(input, 'replacementSerialNumber', 'Austauschseriennummer'), orderNumber: text(input, 'orderNumber', 'Bestellnummer'),
        customerReference: text(input, 'customerReference', 'Kundenreferenz'),
        trackingNumber: text(input, 'trackingNumber', 'Sendungsnummer'),
        reason: choice(input, 'reason', choices.reasons || REASONS, 'Sonstiges'), condition: choice(input, 'condition', choices.conditions || CONDITIONS, 'Ungeprüft'),
        status: choice(input, 'status', choices.statuses || STATUSES, 'Eingegangen'), resolution: choice(input, 'resolution', choices.resolutions || RESOLUTIONS, 'Noch offen'),
        notes: text(input, 'notes', 'Notizen', false, 5000), assignedUserId,
        nextStep: text(input, 'nextStep', 'Nächster Schritt', false, 500)
    };
}
