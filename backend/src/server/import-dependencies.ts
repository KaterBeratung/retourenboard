import { InputError, PRODUCT_REFS, RETURN_REFS, BUILTIN_MASTERDATA } from '../shared/model.js';
import { parseCsv } from '../shared/csv.js';
import { nameKey } from './migrate.js';
type Master = {
    kind: string;
    name: string;
};
type Product = Record<string, any>;
type Plan = {
    masters: Master[];
    products: Product[];
    errors: Map<string, string>;
};
const englishNames: Record<string, string> = { Defekt: 'Defective', Falschlieferung: 'Wrong item', 'Nicht gefallen': 'Not wanted', Transportschaden: 'Shipping damage', Unvollständig: 'Incomplete', Sonstiges: 'Other', Ungeprüft: 'Unchecked', Neuwertig: 'Like new', Gebraucht: 'Used', Beschädigt: 'Damaged', Eingegangen: 'Received', 'In Prüfung': 'Under review', 'In Bearbeitung': 'In progress', Abgeschlossen: 'Completed', 'Noch offen': 'Pending', Erstattung: 'Refund', Austausch: 'Replacement', Reparatur: 'Repair', Wiedereinlagerung: 'Restock' };
function referenceName(masters: any, kind: string, name: string) {
    const list = masters[kind] ?? [], key = nameKey(name);
    const exact = list.find((item: any) => nameKey(item.name) === key);
    if (exact)
        return exact.name;
    const builtin = BUILTIN_MASTERDATA.find(item => item.kind === kind && nameKey(englishNames[item.name] ?? '') === key);
    return builtin && list.some((item: any) => item.builtinKey === builtin.key && item.name === builtin.name) ? builtin.name : name;
}
export async function normalizeImportReferences(store: any, kind: string, input: Product, masters?: any) {
    masters ??= await store.listMasterData();
    const refs = kind === 'products' ? PRODUCT_REFS : RETURN_REFS;
    for (const [field, list] of Object.entries(refs))
        if (typeof input[field] === 'string' && input[field].trim())
            input[field] = referenceName(masters, list, input[field].trim());
    return input;
}
export async function planImportDependencies(store: any, kind: string, text: string, mapping: Record<string, number>, options: any): Promise<Plan> {
    for (const [field, message] of [['createMissingMasterdata', 'Ungültige Stammdatenoption.'], ['createMissingProducts', 'Ungültige Produktoption.']])
        if (options?.[field] !== undefined && typeof options[field] !== 'boolean')
            throw new InputError(message);
    const plan: Plan = { masters: [], products: [], errors: new Map() };
    if (!options?.createMissingMasterdata && !options?.createMissingProducts)
        return plan;
    const parsed = parseCsv(text, { delimiter: options.delimiter }), masters = await store.listMasterData(), known = new Map<string, Set<string>>();
    for (const [list, items] of Object.entries(masters))
        known.set(list, new Set((items as any[]).map(item => nameKey(item.name))));
    const products = new Map<string, Product>(), numbers = new Set<string>(), customStatuses = !!(await store.getRules()).customStatuses;
    for (const row of parsed.rows) {
        const cell = (field: string) => { const index = mapping?.[field]; return Number.isInteger(index) && index >= 0 && index < parsed.headers.length ? row.values[index].trim() : ''; };
        const sku = cell('sku'), number = cell('returnNumber'), existing = await store.findProduct(sku);
        if (options.duplicates === 'skip' && (kind === 'products' && existing || kind === 'returns' && number && (await store.findReturn(number) || numbers.has(number))))
            continue;
        if (number)
            numbers.add(number);
        const missing = kind === 'returns' && !existing && options.createMissingProducts;
        const refs = kind === 'products' ? PRODUCT_REFS : missing ? { ...RETURN_REFS, ...PRODUCT_REFS } : RETURN_REFS;
        if (options.createMissingMasterdata)
            for (const [field, list] of Object.entries(refs)) {
                const name = referenceName(masters, list, cell(field)), key = nameKey(name);
                if (!name || name.length > 250 || known.get(list)!.has(key) || list === 'statuses' && !customStatuses)
                    continue;
                known.get(list)!.add(key);
                plan.masters.push({ kind: list, name });
            }
        if (missing) {
            const product: Product = { sku, name: cell('productName'), ean: cell('ean'), manufacturer: cell('manufacturer'), supplier: cell('supplier'), category: cell('category'), price: cell('price'), description: cell('description'), active: true };
            const previous = products.get(sku);
            if (previous) {
                for (const field of ['name', 'ean', 'manufacturer', 'category', 'price', 'description']) {
                    const normalize = (value: string) => ['name', 'manufacturer', 'category'].includes(field) ? nameKey(value) : field === 'price' ? String(Number(value.replace(',', '.'))) : value;
                    if (previous[field] && product[field] && normalize(previous[field]) !== normalize(product[field]))
                        plan.errors.set(sku, 'Für dieselbe Artikelnummer wurden unterschiedliche Produktdaten angegeben.');
                    if (!previous[field])
                        previous[field] = product[field];
                }
                if (!previous.supplier)
                    previous.supplier = product.supplier;
            }
            else
                products.set(sku, product);
        }
    }
    plan.products = [...products.values()].map(product => ({ ...product, name: product.name || product.sku }));
    return plan;
}
export async function stageImportDependencies(store: any, plan: Plan, preview: boolean) {
    for (const item of plan.masters)
        if (preview)
            await store.masters.create(item.kind, { name: item.name });
        else
            await store.createMasterData(item.kind, { name: item.name });
    const products: Product[] = [], masters = await store.listMasterData();
    for (const input of plan.products) {
        if (plan.errors.has(input.sku))
            continue;
        try {
            const values = await normalizeImportReferences(store, 'products', { ...input }, masters);
            if (!preview) {
                products.push(await store.createProduct(values));
                continue;
            }
            // Stage validated rows inside the preview savepoint without publishing audit/events.
            const data = { ...await store.prepareProduct(values), active: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
            products.push(await store.getProduct(await writeInventoryRow(store.db, 'products', data)));
        }
        catch (error) {
            if (!(error instanceof InputError))
                throw error;
            plan.errors.set(input.sku, error.message);
        }
    }
    return products;
}
import { writeInventoryRow } from './database/inventory-row.js';
