import {validateUpdateOptions,keepImportFields,importChanges,importRecordState,importStateToken,checkImportState} from './import-changes.js';
import { statement } from './database/statements.js';
import { PRODUCT_COLUMNS, RETURN_COLUMNS, PRODUCT_REFS, RETURN_REFS, InputError } from '../shared/model.js';
import { INVENTORY_FORMAT, parseInventoryFile, type InventoryRow } from '../shared/inventory-file.js';
import { normalizeImportReferences } from './import-dependencies.js';
import { nameKey } from './migrate.js';
import { prepareProductImage, saveProductImage } from './product-images.js';
type Options = {
    duplicates: 'skip' | 'update' | 'error';
    createMissingMasterdata: boolean;clearEmptyFields?:boolean;expectedState?:string;
};
type Row = {
    kind: 'products' | 'returns';
    line: number;
    data: InventoryRow;
    action: 'create' | 'update' | 'skip';
    id?: number;changes?:any[];
};
const pick = (item: InventoryRow, keys: string[]) => Object.fromEntries(keys.filter(key => Object.hasOwn(item, key)).map(key => [key, item[key]]));
const productKeys = Object.keys(PRODUCT_COLUMNS).filter(key => key !== 'price').concat('priceCents');
const returnKeys = Object.keys(RETURN_COLUMNS).filter(key => key !== 'productName');
const metadata = (item: InventoryRow) => pick(item, ['createdAt', 'updatedAt']);
const historical = { allowArchivedReferences: true, allowArchivedProduct: true, allowArchivedAssignee: true };
function mergeFields(old: InventoryRow | null, input: InventoryRow, refs: Record<string, string>) {
    const values = { ...old, ...input };
    for (const field of Object.keys(refs))
        if (Object.hasOwn(input, field))
            delete values[field + 'Id'];
    return values;
}
export async function exportInventory(store: any) {
    const products = await store.listProducts(), returns = await store.listReturns(), referenced = new Set<number>();
    for (const [items, refs] of [[products, PRODUCT_REFS], [returns, RETURN_REFS]] as const)
        for (const item of items)
            for (const field of Object.keys(refs))
                if (item[field + 'Id'])
                    referenced.add(item[field + 'Id']);
    const masterdata = (await Promise.all([...referenced].map(async (id) => store.masters.get(id)))).map(item => pick(item, ['kind', 'name', 'active', 'isClosed', 'tone']));
    const imageQuery = statement(store.db, "SELECT originalName,data FROM product_images WHERE productId=$1");
    const result = { format: INVENTORY_FORMAT, formatVersion: 1, currency: 'EUR', exportedAt: new Date().toISOString(), products: await Promise.all(products.map(async (item: any) => {
            const stored = await imageQuery.get(item.id), image = stored ? { name: stored.originalName, data: Buffer.from(stored.data).toString('base64') } : null;
            prepareProductImage(image);
            return { ...pick(item, productKeys), ...metadata(item),revision:item.revision, image };
        })), returns: returns.map((item: any) => ({ ...pick(item, returnKeys), ...metadata(item),revision:item.revision,priceSnapshot:{cents:item.priceCents,source:item.priceSnapshotSource,capturedAt:item.priceCapturedAt} })), masterdata };
    // Every exported file must fit the same validated, portable import contract.
    parseInventoryFile(JSON.stringify(result));
    return result;
}
async function writePreview(store: any, table: 'products' | 'returns', data: InventoryRow, id?: number,priceSnapshot?:InventoryRow) {
    const values = { ...data, updatedAt: new Date().toISOString(), ...(!id ? { createdAt: new Date().toISOString() } : {}), ...(table === 'products' ? { active: Number(data.active) } : {}) };
    return writeInventoryRow(store.db, table, values, id,{source:'migration-observed',priceSnapshot:priceSnapshot as any});
}
async function run(store: any, text: string, options: Options, commit: boolean) {
    const file = parseInventoryFile(text);validateUpdateOptions(options);const states:any[]=[];
    if (!['skip', 'update', 'error'].includes(options.duplicates) || typeof options.createMissingMasterdata !== 'boolean')
        throw new InputError('Ungültige Importoptionen.');
    // Hash the untouched inventory before staged products/images alter joined return rows.
    for(const source of file.products)states.push(['products',source.sku.trim(),importRecordState(await store.findProduct(source.sku.trim()))]);
    for(const source of file.returns)states.push(['returns',source.returnNumber.trim(),importRecordState(await store.findReturn(source.returnNumber.trim()))]);
    const rows: Row[] = [], errors: {
        line: number;
        message: string;
    }[] = [], newMasterdata: InventoryRow[] = [], masters = await store.listMasterData();
    const needed = new Map<string, {
        kind: string;
        name: string;
    }>();
    for (const [items, refs, kind] of [[file.products, PRODUCT_REFS, 'products'], [file.returns, RETURN_REFS, 'returns']] as const)
        for (const source of items) {
            if (options.duplicates === 'skip' && (kind === 'products' && await store.findProduct(source.sku.trim()) || kind === 'returns' && await store.findReturn(source.returnNumber.trim())))
                continue;
            const input = await normalizeImportReferences(store, kind, { ...source }, masters);
            for (const [field, list] of Object.entries(refs)) {
                const name = input[field];
                if (typeof name === 'string' && name.trim() && !masters[list].some((item: any) => nameKey(item.name) === nameKey(name)))
                    needed.set(list + ':' + nameKey(name), { kind: list, name: name.trim() });
            }
        }
    if (options.createMissingMasterdata)
        for (const item of needed.values()) {
            const source = file.masterdata.find(master => master.kind === item.kind && nameKey(master.name) === nameKey(item.name));
            const values = { name: item.name, ...(source ? pick(source, ['active', 'isClosed', 'tone']) : {}) };
            if (commit)
                await store.createMasterData(item.kind, values);
            else
                await store.masters.create(item.kind, values);
            newMasterdata.push(item);
        }
    const currentMasters = await store.listMasterData();
    let line = 0;
    for (const source of file.products) {
        line++;
        try {
            let input = await normalizeImportReferences(store, 'products', pick(source, productKeys.concat('image')), currentMasters);const old = await store.findProduct(source.sku.trim());input=keepImportFields(input,old,options.clearEmptyFields);const image = prepareProductImage(input.image);
            if (old && options.duplicates === 'skip') {
                rows.push({ kind: 'products', line, data: old, action: 'skip', id: old.id });
                continue;
            }
            if (old && options.duplicates === 'error')
                throw new InputError('Artikelnummer existiert bereits. Aktualisierung ausdrücklich aktivieren.');
            const originalImage=old?await imageQueryForDiff(store,old.id):null;const values = mergeFields(old, input, PRODUCT_REFS), prepared = await store.prepareProduct(values, old?.id, historical);
            let saved;
            if (commit)
                saved = old ? await store.updateProduct(old.id, values, historical) : await store.createProduct(values, { ...historical, ...metadata(source) });
            else {
                const id = await writePreview(store, 'products', prepared, old?.id);
                await saveProductImage(store.db, id, image);
                saved = await store.getProduct(id);
            }
            const changes=importChanges('products',old,saved);if(old&&Object.hasOwn(input,'image')){const previous=originalImage;if(input.image===null&&old.imageVersion||input.image&&(!previous||input.image.name!==previous.originalName||input.image.data!==Buffer.from(previous.data).toString('base64')))changes.push({field:'image',before:old.imageName??null,after:input.image?.name??null});}rows.push({ kind: 'products', line, data: saved, action: old ? 'update' : 'create', id: old?.id,changes });
        }
        catch (error) {
            if (!(error instanceof InputError))
                throw error;
            errors.push({ line, message: error.message });
        }
    }
    for (const source of file.returns) {
        line++;
        try {
            let input = await normalizeImportReferences(store, 'returns', pick(source, returnKeys), currentMasters);const old = await store.findReturn(source.returnNumber.trim());input=keepImportFields(input,old,options.clearEmptyFields);
            if (old && options.duplicates === 'skip') {
                rows.push({ kind: 'returns', line, data: old, action: 'skip', id: old.id });
                continue;
            }
            if (old && options.duplicates === 'error')
                throw new InputError('Retourennummer existiert bereits. Aktualisierung ausdrücklich aktivieren.');
            const product = await store.findProduct(source.sku.trim());
            if (!product)
                throw new InputError('Artikelnummer ist unbekannt.');
            const values = mergeFields(old, { ...input, productId: product.id }, RETURN_REFS), prepared = await store.prepareReturn(values, old?.id, historical);
            const priceSnapshot=source.priceSnapshot?{cents:source.priceSnapshot.cents,source:source.priceSnapshot.source,capturedAt:source.priceSnapshot.capturedAt}:undefined;
            const saved = commit ? (old ? await store.updateReturn(old.id, values, historical) : await store.createReturn(values, { ...historical, ...metadata(source),priceSnapshot,priceSnapshotSource:'migration-observed' })) : await store.getReturn(await writePreview(store, 'returns', prepared, old?.id,priceSnapshot));
            rows.push({ kind: 'returns', line, data: saved, action: old ? 'update' : 'create', id: old?.id,changes:importChanges('returns',old,saved) });
        }
        catch (error) {
            if (!(error instanceof InputError))
                throw error;
            errors.push({ line, message: error.message });
        }
    }
    const counts = (items: Row[]) => ({ created: items.filter(row => row.action === 'create').length, updated: items.filter(row => row.action === 'update').length, skipped: items.filter(row => row.action === 'skip').length });
    return {stateToken:importStateToken(states), kind: 'all', total: file.products.length + file.returns.length, rows, errors, ...counts(rows), products: counts(rows.filter(row => row.kind === 'products')), returns: counts(rows.filter(row => row.kind === 'returns')), newMasterdata, masterdataCreated: newMasterdata.length };
}
export async function previewInventoryImport(store: any, text: string, options: Options) { return rollbackPreview(store.db, async () => run(store, text, options, false)); }
export async function commitInventoryImport(store: any, text: string, options: Options, authorize: (preview: Awaited<ReturnType<typeof run>>) => void | Promise<void>) {
    // Validate and authorize the complete plan before audited writes are performed.
    return store.transaction(async () => {
        const preview = await previewInventoryImport(store, text, options);
        if (preview.errors.length)
            throw new InputError(`Import abgebrochen: ${preview.errors.length} fehlerhafte Einträge. ${preview.errors[0].message}`);
        checkImportState(options,preview.stateToken);
        await authorize(preview);
        const result = await run(store, text, options, true);
        if (result.errors.length)
            throw new InputError('Der Bestand hat sich geändert. Bitte Vorschau erneut prüfen.', 409);
        return { created: result.created, updated: result.updated, skipped: result.skipped, products: result.products, returns: result.returns, masterdataCreated: result.masterdataCreated };
    });
}
import { writeInventoryRow } from './database/inventory-row.js';
import { rollbackPreview } from './database/preview.js';

async function imageQueryForDiff(store:any,id:number){return (await store.db.query('SELECT originalName,data FROM product_images WHERE productId=$1',[id])).rows[0];}
