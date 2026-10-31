import { InputError } from '../shared/model.js';
import { requirePermission } from './permissions.js';
import { hasPermission } from '../shared/permissions.js';
import { PRODUCT_COLUMNS, RETURN_COLUMNS } from '../shared/model.js';
import { exportCsv, parseCsv, guessCsvMapping, inferCsvKind } from '../shared/csv.js';
import { isInventoryText } from '../shared/inventory-file.js';
import { exportInventory, previewInventoryImport, commitInventoryImport } from './inventory-transfer.js';
import { previewImport, commitImport } from './import.js';
import { resolveProfile } from './csv-profiles.js';
import { NOT_HANDLED } from './route-result.js';
export async function handleImportExportRoute(ctx) {
    const { req, res, path, method, json, body, mutate, requireAccess, store, csvProfiles, returnWorkflow } = ctx;
    for (const kind of ['products', 'returns']) {
        if (method === 'GET' && [`/api/export/${kind}`, `/api/template/${kind}`].includes(path)) {
            const columns = kind === 'products' ? PRODUCT_COLUMNS : RETURN_COLUMNS;
            const data = path.includes('/template/') ? [] : (kind === 'products' ? await store.listProducts() : await returnWorkflow.selectedExport(new URL(req.url, 'http://localhost').searchParams));
            const rows = data.map(item => Object.keys(columns).map(key => key === 'price' ? (item.priceCents / 100).toFixed(2).replace('.', ',') : key === 'active' ? (('active' in item && item.active) ? 'ja' : 'nein') : item[key]));
            res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${kind === 'products' ? 'produkte' : 'retouren'}${path.includes('/template/') ? '-vorlage' : ''}.csv"`, 'Cache-Control': 'no-store' });
            return res.end(exportCsv(Object.values(columns), rows));
        }
    }
    if (method === 'GET' && path === '/api/export/all') {
        const current = await requireAccess();
        requirePermission(current.user, 'productsExport');
        requirePermission(current.user, 'returnsExport');
        const data = await exportInventory(store);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="retourenboard-bestand.json"', 'Cache-Control': 'no-store' });
        return res.end(JSON.stringify(data));
    }
    if (method === 'POST' && ['/api/import/preview', '/api/import/commit'].includes(path)) {
        const b = await body();
        const operation = path.endsWith('preview') ? previewImport : commitImport;
        const run = async () => {
            const importer = (await requireAccess()).user;
            if (b.kind === 'all' || (b.kind === undefined || b.kind === 'auto') && isInventoryText(b.text)) {
                requirePermission(importer, 'productsImport');
                requirePermission(importer, 'returnsImport');
                if (b.profileId !== undefined)
                    throw new InputError('CSV-Profile können nicht auf Bestandsdateien angewendet werden.');
                if (b.createMissingMasterdata === true)
                    requirePermission(importer, 'masterdataManage');
                const options = {clearEmptyFields:b.clearEmptyFields??false,expectedState:b.expectedState, duplicates: b.duplicates ?? (hasPermission(importer, 'productsEdit') && hasPermission(importer, 'returnsEdit') ? 'update' : 'skip'), createMissingMasterdata: b.createMissingMasterdata ?? hasPermission(importer, 'masterdataManage') };
                const authorize = async (preview) => {
                    const current = await requireAccess();
                    requirePermission(current.user, 'productsImport');
                    requirePermission(current.user, 'returnsImport');
                    if (preview.newMasterdata.length)
                        requirePermission(current.user, 'masterdataManage');
                    for (const row of preview.rows)
                        if (row.action !== 'skip') {
                            requirePermission(current.user, row.kind + (row.action === 'update' ? 'Edit' : 'Create'));
                            if (row.kind === 'products' && row.action === 'update' && (await store.getProduct(row.id)).active && !row.data.active)
                                requirePermission(current.user, 'productsDelete');
                            if (row.kind === 'returns' && row.action === 'update' && (await store.getReturn(row.id)).statusId !== row.data.statusId)
                                requirePermission(current.user, 'returnsStatus');
                        }
                };
                if (path.endsWith('preview')) {
                    const preview = await previewInventoryImport(store, b.text, options);
                    await authorize(preview);
                    return preview;
                }
                return commitInventoryImport(store, b.text, options, authorize);
            }
            let profile;
            if (b.profileId !== undefined) {
                if (!Number.isSafeInteger(b.profileId))
                    throw new InputError('Ungültiges CSV-Profil.');
                profile = await csvProfiles.get(b.profileId);
                if (profile.revision !== b.profileRevision)
                    throw new InputError('CSV-Profil wurde geändert. Bitte Vorschau erneut prüfen.', 409);
            }
            const automatic = b.kind === undefined || b.kind === 'auto';
            const kind = automatic ? (profile?.kind ?? inferCsvKind(parseCsv(b.text, { delimiter: b.delimiter ?? 'auto' }).headers, null)) : b.kind;
            if (!kind)
                throw new InputError('Der Importtyp konnte nicht automatisch erkannt werden. Bitte Produkte oder Retouren auswählen.');
            if (!['products', 'returns'].includes(kind))
                throw new InputError('Unbekannter Importtyp.');
            requirePermission(importer, kind + 'Import');
            const authorize = async (preview) => {
                const current = await requireAccess();
                requirePermission(current.user, kind + 'Import');
                if (preview.newProducts?.length)
                    requirePermission(current.user, 'productsCreate');
                if (preview.newMasterdata?.length)
                    requirePermission(current.user, 'masterdataManage');
                for (const row of preview.rows)
                    if (row.action !== 'skip') {
                        requirePermission(current.user, kind + (row.action === 'update' ? 'Edit' : 'Create'));
                        if (kind === 'products' && row.action === 'update' && (await store.getProduct(row.id)).active && !row.data.active)
                            requirePermission(current.user, 'productsDelete');
                        if (kind === 'returns' && row.action === 'update' && (await store.getReturn(row.id)).statusId !== row.data.statusId)
                            requirePermission(current.user, 'returnsStatus');
                    }
            };
            if (b.createMissingMasterdata === true)
                requirePermission(importer, 'masterdataManage');
            if (b.createMissingMasterdata !== undefined && typeof b.createMissingMasterdata !== 'boolean')
                throw new InputError('Ungültige Stammdatenoption.');
            if (b.createMissingProducts === true)
                requirePermission(importer, 'productsCreate');
            if (b.createMissingProducts !== undefined && typeof b.createMissingProducts !== 'boolean')
                throw new InputError('Ungültige Produktoption.');
            let mapping = b.mapping, options = {clearEmptyFields:b.clearEmptyFields??false,expectedState:b.expectedState, duplicates: b.duplicates ?? (b.updateExisting !== undefined ? (b.updateExisting ? 'update' : 'error') : kind === 'returns' ? 'skip' : hasPermission(importer, 'productsEdit') ? 'update' : 'skip'), delimiter: b.delimiter ?? 'auto', createMissingMasterdata: b.createMissingMasterdata ?? hasPermission(importer, 'masterdataManage'), createMissingProducts: b.createMissingProducts ?? (kind === 'returns' && hasPermission(importer, 'productsCreate')) };
            if (profile) {
                if (profile.kind !== kind)
                    throw new InputError('Profil passt nicht zum Importtyp.');
                mapping = resolveProfile(profile, parseCsv(b.text, { delimiter: profile.delimiter }).headers);
                options = { ...options, duplicates: profile.duplicates, delimiter: profile.delimiter };
            }
            if (mapping === undefined)
                mapping = guessCsvMapping(kind, parseCsv(b.text, { delimiter: options.delimiter }).headers);
            if (path.endsWith('preview')) {
                const preview = await operation(store, kind, b.text, mapping, options);
                await authorize(preview);
                return preview;
            }
            return operation(store, kind, b.text, mapping, options, authorize);
        };
        return json(path.endsWith('preview') ? await run() : await mutate(run));
    }
    return NOT_HANDLED;
}
