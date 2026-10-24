import {validateUpdateOptions,keepImportFields,importChanges,importRecordState,importStateToken,checkImportState} from './import-changes.js';
import { parseCsv } from '../shared/csv.js';
import { PRODUCT_COLUMNS, RETURN_IMPORT_COLUMNS, PRODUCT_REFS, RETURN_REFS, InputError } from '../shared/model.js';
import { planImportDependencies, stageImportDependencies, normalizeImportReferences } from './import-dependencies.js';
import { rollbackPreview } from './database/preview.js';
export async function previewImport(store, kind, text, mapping, updateExisting = false) {
    const plan = await planImportDependencies(store, kind, text, mapping, updateExisting);
    if (!plan.masters.length && !plan.products.length)
        return { ...await previewRows(store, kind, text, mapping, updateExisting), kind, newMasterdata: [], newProducts: [] };
    return rollbackPreview(store.db, async () => {
        const products = await stageImportDependencies(store, plan, true);
        return { ...await previewRows(store, kind, text, mapping, updateExisting, plan.errors), kind, newMasterdata: plan.masters, newProducts: products };
    });
}
async function previewRows(store, kind, text, mapping, updateExisting = false, productErrors = new Map()) {
    if (kind !== 'products' && kind !== 'returns')
        throw new InputError('Unbekannter Importtyp.');
    if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping))
        throw new InputError('Spaltenzuordnung fehlt.');
    if (typeof updateExisting !== 'boolean' && (!updateExisting || typeof updateExisting !== 'object'))
        throw new InputError('Ungültige Update-Option.');
    const options = typeof updateExisting === 'object' ? updateExisting : { duplicates: updateExisting ? 'update' : 'error' };
    validateUpdateOptions(options);const states=[];
    const duplicates = options.duplicates ?? 'error';
    if (!['error', 'skip', 'update'].includes(duplicates))
        throw new InputError('Ungültige Dublettenaktion.');
    const parsed = parseCsv(text, { delimiter: options.delimiter }), columns = kind === 'products' ? PRODUCT_COLUMNS : RETURN_IMPORT_COLUMNS;
    const candidates = Object.entries(mapping).filter(([, index]) => index !== '' && index !== null && index !== -1);
    for (const [key, index] of candidates) {
        if (!Object.hasOwn(columns, key) || typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= parsed.headers.length)
            throw new InputError('Ungültige Spaltenzuordnung.');
    }
    const selected = candidates;
    const required = duplicates === 'update' ? ['sku'] : kind === 'products' ? ['sku', 'name'] : ['sku', 'serialNumber'];
    if (required.some(key => !selected.some(([field]) => field === key)))
        throw new InputError('Bitte alle Pflichtspalten zuordnen.');
    if (!parsed.rows.length)
        throw new InputError('Die CSV-Datei enthält keine Datenzeilen.');
    const seen = new Set(), rows = [], errors = [], masters = await store.listMasterData();
    for (const record of parsed.rows) {
        try {
            const input = await normalizeImportReferences(store, kind, Object.fromEntries(selected.map(([key, index]) => [key, record.values[index]])), masters);
            // Blank optional template cells use the same defaults as omitted fields.
            for (const field of kind === 'products' ? ['active'] : ['quantity']) {
                if (input[field]?.trim() === '')
                    delete input[field];
            }
            if (kind === 'returns' && input.assignedUserId?.trim() === '')
                input.assignedUserId = null;
            let data, action = 'create', id,before=null;
            if (kind === 'products') {
                const existing = await store.findProduct(input.sku.trim());before=existing;states.push(['products',input.sku.trim(),importRecordState(existing)]);
                if (existing && duplicates === 'skip') {
                    rows.push({ line: record.line, data: existing, action: 'skip', id: existing.id });
                    continue;
                }
                if (existing && duplicates === 'error')
                    throw new InputError('Artikelnummer existiert bereits. Aktualisierung ausdrücklich aktivieren.');
                const incoming=keepImportFields(input,existing,options.clearEmptyFields);if(existing&&options.clearEmptyFields&&incoming.price===''){incoming.priceCents=0;delete incoming.price;}const values = { ...existing, ...incoming };
                for (const field of Object.keys(PRODUCT_REFS))
                    if (Object.hasOwn(incoming, field))
                        delete values[field + 'Id'];
                data = await store.prepareProduct(values, existing?.id);
                if(existing)data.revision=existing.revision;
                if (seen.has(data.sku))
                    throw new InputError('Artikelnummer kommt mehrfach in dieser Datei vor.');
                seen.add(data.sku);
                if (existing) {
                    action = 'update';
                    id = existing.id;
                }
            }
            else {
                const number = input.returnNumber?.trim(), existing = number ? await store.findReturn(number) : null;before=existing;states.push(['returns',number??input.serialNumber,importRecordState(existing)]);
                if (number && (existing || seen.has(number)) && duplicates === 'skip') {
                    rows.push({ line: record.line, data: existing ?? input, action: 'skip', id: existing?.id });
                    continue;
                }
                if (number && seen.has(number))
                    throw new InputError('Retourennummer kommt mehrfach in dieser Datei vor.');
                if (existing && duplicates === 'error')
                    throw new InputError('Retourennummer existiert bereits. Aktualisierung ausdrücklich aktivieren.');
                if (productErrors.has(input.sku.trim()))
                    throw new InputError(productErrors.get(input.sku.trim()));
                const product = await store.findProduct(input.sku.trim());
                if (!product || !product.active && existing?.productId !== product.id)
                    throw new InputError('Artikelnummer ist unbekannt oder archiviert. Produkte zuerst importieren.');
                const incoming=keepImportFields(input,existing,options.clearEmptyFields),values = { ...existing, ...incoming, productId: product.id };
                for (const field of Object.keys(RETURN_REFS))
                    if (Object.hasOwn(incoming, field))
                        delete values[field + 'Id'];
                data = await store.prepareReturn(values, existing?.id, { allowArchivedAssignee: true });
                if(existing)data.revision=existing.revision;
                if (data.returnNumber) {
                    seen.add(data.returnNumber);
                }
                data.sku = product.sku;
                if (existing) {
                    action = 'update';
                    id = existing.id;
                }
            }
            rows.push({ line: record.line, data, action, id,changes:importChanges(kind,before,data) });
        }
        catch (error) {
            if (!(error instanceof InputError))
                throw error;
            errors.push({ line: record.line, message: error.message });
        }
    }
    return {stateToken:importStateToken(states), headers: parsed.headers, total: parsed.rows.length, rows, errors, created: rows.filter(r => r.action === 'create').length, updated: rows.filter(r => r.action === 'update').length, skipped: rows.filter(r => r.action === 'skip').length };
}
export async function commitImport(store, kind, text, mapping, updateExisting = false, authorize = () => { }) {
    return store.transaction(async () => {
        const plan = await planImportDependencies(store, kind, text, mapping, updateExisting), products = await stageImportDependencies(store, plan, false);
        const preview = { ...await previewRows(store, kind, text, mapping, updateExisting, plan.errors), newMasterdata: plan.masters, newProducts: products };
        if (preview.errors.length)
            throw new InputError(`Import abgebrochen: ${preview.errors.length} fehlerhafte Zeile(n). ${preview.errors[0].message}`);
        checkImportState(typeof updateExisting==='object'?updateExisting:{},preview.stateToken);
        await authorize(preview);
        let created = 0, updated = 0, skipped = 0;
        for (const row of preview.rows) {
            if (row.action === 'skip') {
                skipped++;
                continue;
            }
            if (kind === 'returns') {
                if (row.action === 'update') {
                    await store.updateReturn(row.id, { ...row.data }, { allowArchivedAssignee: true });
                    updated++;
                }
                else {
                    await store.createReturn({ ...row.data }, { allowArchivedAssignee: true,priceSnapshotSource:'migration-observed' });
                    created++;
                }
            }
            else if (row.action === 'update') {
                await store.updateProduct(row.id, { ...row.data });
                updated++;
            }
            else {
                await store.createProduct({ ...row.data });
                created++;
            }
        }
        return typeof updateExisting === 'object' ? { created, updated, skipped, ...(products.length ? { productsCreated: products.length } : {}), ...(plan.masters.length ? { masterdataCreated: plan.masters.length } : {}) } : { created, updated };
    });
}
