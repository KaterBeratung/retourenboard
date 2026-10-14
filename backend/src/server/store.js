import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { validateProduct, validateReturn, InputError, PRODUCT_REFS, RETURN_REFS } from '../shared/model.js';
import { migrateDatabase } from './migrate.js';
import { createMasterDataRepository } from './masterdata.js';
import {checkReturnFields,defaultRules,dueDate,isOverdue} from './return-rules.js';
import {prepareProductImage,saveProductImage} from './product-images.js';
export function createStore(path) {
    if (path !== ':memory:')
        mkdirSync(dirname(path), { recursive: true });
    const db = new DatabaseSync(path);
    db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, sku TEXT NOT NULL UNIQUE,
      ean TEXT NOT NULL, manufacturer TEXT NOT NULL, supplier TEXT NOT NULL, category TEXT NOT NULL,
      priceCents INTEGER NOT NULL, description TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT, productId INTEGER NOT NULL REFERENCES products(id),
      returnNumber TEXT UNIQUE, serialNumber TEXT NOT NULL, orderNumber TEXT NOT NULL,
      receiptDate TEXT NOT NULL, quantity INTEGER NOT NULL, reason TEXT NOT NULL,
      condition TEXT NOT NULL, status TEXT NOT NULL, resolution TEXT NOT NULL, notes TEXT NOT NULL,
      createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
    );`);
    db.exec(`CREATE TABLE IF NOT EXISTS product_images (
      productId INTEGER PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
      originalName TEXT NOT NULL, mediaType TEXT NOT NULL, data BLOB NOT NULL, revision TEXT NOT NULL
    );`);
    migrateDatabase(db);
    const masters = createMasterDataRepository(db);
    let rules=()=>defaultRules,clock={now:Date.now};
    let commitCallbacks=[],rollbackCallbacks=[];
    // SQLite's untyped row boundary is converted using the schema and reference map.
    function display(row, refs) {
        if (!row)
            return null;
        const result = { ...row };
        if(!result.imageVersion){delete result.imageVersion;delete result.imageName;}
        if (refs === PRODUCT_REFS)
            result.active = !!row.active;
        for (const field of Object.keys(refs))
            result[field] = masters.get(row[field + 'Id'])?.name ?? '';
        if (refs === RETURN_REFS) {
            const status = masters.get(row.statusId);
            result.isClosed = !!status?.isClosed;
            result.statusTone = status?.tone ?? 'neutral';
            result.dueDate=dueDate(row.receiptDate,rules().deadlineDays);
            result.overdue=isOverdue(result,rules(),clock);
        }
        return result;
    }
    function failMissing(value) { if (!value)
        throw new InputError('Eintrag wurde nicht gefunden.', 404); return value; }
    function sqlAction(callback) { try {
        return callback();
    }
    catch (error) {
        if (String(error.message).includes('UNIQUE constraint'))
            throw new InputError('Artikelnummer oder Retourennummer ist bereits vorhanden.', 409);
        throw error;
    } }
    function save(table, data, id, metadata = {}) {
        const now = new Date().toISOString(), values = { ...data, updatedAt: !id ? metadata.updatedAt ?? now : now };
        if (!id)
            values.createdAt = metadata.createdAt ?? now;
        if (table === 'products')
            values.active = Number(values.active);
        const keys = Object.keys(values);
        const parameters = Object.values(values);
        if (id) {
            sqlAction(() => db.prepare(`UPDATE ${table} SET ${keys.map(k => k + '=?').join(',')} WHERE id=?`).run(...parameters, id));
            return id;
        }
        return Number(sqlAction(() => db.prepare(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map(() => '?').join(',')})`).run(...parameters)).lastInsertRowid);
    }
    function resolveFields(input, refs, existing, options = {}) {
        const result = {}, old = existing;
        for (const [field, kind] of Object.entries(refs)) {
            const key = field + 'Id';
            let value;
            if (Object.hasOwn(input, key) && input[key] !== undefined) {
                value = input[key];
                if (value === '')
                    value = null;
                else if (typeof value === 'string' && /^\d+$/.test(value))
                    value = Number(value);
                if (value !== null && (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1))
                    throw new InputError('Ungültige Auswahl.');
            }
            else if (Object.hasOwn(input, field))
                value = input[field];
            else if (old)
                value = old[key];
            const item = masters.resolve(kind, value, old?.[key], refs === RETURN_REFS && field !== 'supplier', options.allowArchivedReferences === true);
            result[key] = item?.id ?? null;
            result[field] = item?.name ?? '';
        }
        return result;
    }
    const productQuery='SELECT p.*, i.revision AS imageVersion, i.originalName AS imageName FROM products p LEFT JOIN product_images i ON i.productId=p.id';
    const joinQuery = 'SELECT r.*, p.name AS productName, p.sku, p.ean, p.priceCents, i.revision AS imageVersion, i.originalName AS imageName FROM returns r JOIN products p ON p.id=r.productId LEFT JOIN product_images i ON i.productId=p.id';
    const store = {
        db, masters,setRules:(getRules,newClock={now:Date.now})=>{rules=getRules;clock=newClock;},
        listMasterData: () => masters.all(), createMasterData: (kind, input) => masters.create(kind, input), updateMasterData: (id, input) => masters.update(id, input), deleteMasterData: id => masters.remove(id),
        listProducts: () => db.prepare(productQuery+' ORDER BY p.createdAt DESC,p.id DESC').all().map(r => display(r, PRODUCT_REFS)),
        getProduct: id => display(db.prepare(productQuery+' WHERE p.id=?').get(id), PRODUCT_REFS),
        findProduct: sku => display(db.prepare(productQuery+' WHERE p.sku=?').get(sku), PRODUCT_REFS),
        listReturns: () => db.prepare(`${joinQuery} ORDER BY r.createdAt DESC,r.id DESC`).all().map(r => display(r, RETURN_REFS)),
        getReturn: id => display(db.prepare(`${joinQuery} WHERE r.id=?`).get(id), RETURN_REFS),
        findReturn: number => { const r = db.prepare('SELECT id FROM returns WHERE returnNumber=?').get(number); return r ? store.getReturn(r.id) : null; },
        prepareProduct(input, id, options = {}) { const old = id ? failMissing(store.getProduct(id)) : null, refs = resolveFields(input, PRODUCT_REFS, old, options); return { ...validateProduct({ ...input, ...refs }), ...refs }; },
        prepareReturn(input, id, options = {}) {
            const old = id ? failMissing(store.getReturn(id)) : null, p = failMissing(store.getProduct(Number(input.productId)));
            if (!p.active && old?.productId !== p.id && options.allowArchivedProduct !== true)
                throw new InputError('Archivierte Produkte können keine neuen Retouren erhalten.');
            const values = { ...input };
            if(old&&!Object.hasOwn(values,'quantity'))values.quantity=old.quantity;
            if(old&&!Object.hasOwn(values,'replacementSerialNumber'))values.replacementSerialNumber=old.replacementSerialNumber;
            for(const field of ['assignedUserId','nextStep'])if(old&&!Object.hasOwn(values,field))values[field]=old[field];
            if (!old && !Object.hasOwn(values, 'supplier') && !Object.hasOwn(values, 'supplierId'))
                values.supplierId = masters.get(p.supplierId)?.active ? p.supplierId : null;
            const refs = resolveFields(values, RETURN_REFS, old, options), choices = Object.fromEntries(Object.entries(masters.all()).map(([k, v]) => [k, v.map(x => x.name)]));
            const requireSerialNumber=!old||Boolean(old.serialNumber.trim());
            const config=rules();
            checkReturnFields({...values,...refs},{...config,requiredFields:config.requiredFields.filter(field=>field!=='serialNumber')});
            const data=validateReturn({ ...values, ...refs }, choices, {requireSerialNumber});
            let assignedDisplayName='';
            if(data.assignedUserId!==null){
                if(old?.assignedUserId===data.assignedUserId)assignedDisplayName=old.assignedDisplayName;
                else{
                    const hasUsers=db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='users'").get();
                    const account=hasUsers?db.prepare('SELECT active,displayName FROM users WHERE id=?').get(data.assignedUserId):null;
                    if(!account)throw new InputError('Zuständiges Konto nicht gefunden.');
                    if(!account.active&&options.allowArchivedAssignee!==true)throw new InputError('Nur aktive Konten können neu zugeordnet werden.');
                    assignedDisplayName=account.displayName;
                }
            }
            return { ...data, ...refs, assignedDisplayName };
        },
        createProduct(input, options = {}) {const image=prepareProductImage(input.image);return store.transaction(()=>{const id=save('products',store.prepareProduct(input,undefined,options),undefined,options);saveProductImage(db,id,image);return store.getProduct(id);});},
        updateProduct(id, input, options = {}) {const image=prepareProductImage(input.image);return store.transaction(()=>{save('products',store.prepareProduct(input,id,options),id);saveProductImage(db,id,image);return store.getProduct(id);});},
        deleteProduct(id) {
            failMissing(store.getProduct(id));
            if (db.prepare('SELECT id FROM returns WHERE productId=? LIMIT 1').get(id)) {
                db.prepare('UPDATE products SET active=0,updatedAt=? WHERE id=?').run(new Date().toISOString(), id);
                return { archived: true };
            }
            db.prepare('DELETE FROM products WHERE id=?').run(id);
            return { archived: false };
        },
        createReturn(input, options = {}) {
            return store.transaction(() => {
                const data = store.prepareReturn(input, undefined, options), now = new Date().toISOString();
                data.returnNumber = data.returnNumber || null;
                const id = save('returns', data, undefined, options);
                if (!data.returnNumber) {
                    let number = `${rules().numberPrefix}-${now.slice(0, 4)}-${String(id).padStart(6, '0')}`;
                    while (store.findReturn(number))
                        number += 'A';
                    db.prepare('UPDATE returns SET returnNumber=? WHERE id=?').run(number, id);
                }
                return store.getReturn(id);
            });
        },
        updateReturn(id, input, options = {}) { const data = store.prepareReturn(input, id, options); delete data.returnNumber; return store.getReturn(save('returns', data, id)); },
        deleteReturn(id) { failMissing(store.getReturn(id)); db.prepare('DELETE FROM returns WHERE id=?').run(id); return { deleted: true }; },
        onCommit:job=>{if(!db.isTransaction)throw new Error('Transaktion erforderlich');commitCallbacks.push(job);},
        onRollback:job=>{if(!db.isTransaction)throw new Error('Transaktion erforderlich');rollbackCallbacks.push(job);},
        transaction(callback) { const nested = db.isTransaction; if (!nested){
            commitCallbacks=[];rollbackCallbacks=[];db.exec('BEGIN IMMEDIATE');} try {
            const result = callback();
            if (!nested){db.exec('COMMIT');for(const job of commitCallbacks)try{job();}catch{console.error('Temporäre Dateibereinigung fehlgeschlagen.');}commitCallbacks=[];rollbackCallbacks=[];}
            return result;
        }
        catch (error) {
            if (!nested){db.exec('ROLLBACK');for(const job of rollbackCallbacks.reverse())job();commitCallbacks=[];rollbackCallbacks=[];}
            throw error;
        } },
        close: () => db.close()
    };
    return store;
}
