import { test } from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import { createStore } from './helpers/postgres-fixtures.js';
test('standard masterdata exposes stable identities without changing saved names', async () => {
    const s = await createStore(':memory:');
    try {
        const actual = Object.values(await s.listMasterData()).flat().sort((a, b) => a.id - b.id)
            .map(({ id, kind, name, builtinKey }) => ({ id, kind, name, builtinKey }));
        assert.deepEqual(actual, [
            { id: 1, kind: 'reasons', name: 'Defekt', builtinKey: 'reasons.defective' },
            { id: 2, kind: 'reasons', name: 'Falschlieferung', builtinKey: 'reasons.wrongDelivery' },
            { id: 3, kind: 'reasons', name: 'Nicht gefallen', builtinKey: 'reasons.disliked' },
            { id: 4, kind: 'reasons', name: 'Transportschaden', builtinKey: 'reasons.transportDamage' },
            { id: 5, kind: 'reasons', name: 'Unvollständig', builtinKey: 'reasons.incomplete' },
            { id: 6, kind: 'reasons', name: 'Sonstiges', builtinKey: 'reasons.other' },
            { id: 7, kind: 'conditions', name: 'Ungeprüft', builtinKey: 'conditions.unchecked' },
            { id: 8, kind: 'conditions', name: 'Neuwertig', builtinKey: 'conditions.likeNew' },
            { id: 9, kind: 'conditions', name: 'Gebraucht', builtinKey: 'conditions.used' },
            { id: 10, kind: 'conditions', name: 'Beschädigt', builtinKey: 'conditions.damaged' },
            { id: 11, kind: 'conditions', name: 'Defekt', builtinKey: 'conditions.defective' },
            { id: 12, kind: 'statuses', name: 'Eingegangen', builtinKey: 'statuses.received' },
            { id: 13, kind: 'statuses', name: 'In Prüfung', builtinKey: 'statuses.checking' },
            { id: 14, kind: 'statuses', name: 'In Bearbeitung', builtinKey: 'statuses.working' },
            { id: 15, kind: 'statuses', name: 'Abgeschlossen', builtinKey: 'statuses.completed' },
            { id: 16, kind: 'resolutions', name: 'Noch offen', builtinKey: 'resolutions.pending' },
            { id: 17, kind: 'resolutions', name: 'Erstattung', builtinKey: 'resolutions.refund' },
            { id: 18, kind: 'resolutions', name: 'Austausch', builtinKey: 'resolutions.exchange' },
            { id: 19, kind: 'resolutions', name: 'Reparatur', builtinKey: 'resolutions.repair' },
            { id: 20, kind: 'resolutions', name: 'Wiedereinlagerung', builtinKey: 'resolutions.restock' }
        ]);
    }
    finally {
        s.close();
    }
});
test('renaming a standard entry permanently removes localization identity and retains references', async () => {
    const s = await createStore(':memory:');
    try {
        const p = await s.createProduct({ sku: 'P', name: 'Produkt' });
        const r = await s.createReturn({ serialNumber: 'TEST-SN', productId: p.id, reasonId: 1 });
        const renamed = await s.updateMasterData(1, { name: 'Eigener Defektgrund', builtinKey: 'reasons.defective' });
        assert.equal(renamed.builtinKey, '');
        assert.equal((await s.getReturn(r.id)).reasonId, 1);
        assert.equal((await s.getReturn(r.id)).reason, 'Eigener Defektgrund');
        const restored = await s.updateMasterData(1, { name: 'Defekt', builtinKey: 'reasons.defective' });
        assert.equal(restored.builtinKey, '');
    }
    finally {
        s.close();
    }
});
test('editing standard entry attributes retains its localization identity', async () => {
    const s = await createStore(':memory:');
    try {
        const updated = await s.updateMasterData(12, { code: 'ST-1', notes: 'Eigene Notiz', active: false, isDefault: false, isClosed: true, tone: 'neutral', builtinKey: 'statuses.completed' });
        assert.equal(updated.builtinKey, 'statuses.received');
        assert.equal(updated.name, 'Eingegangen');
        assert.equal(updated.code, 'ST-1');
        assert.equal(updated.notes, 'Eigene Notiz');
        assert.equal(updated.active, false);
        assert.equal(updated.isClosed, true);
    }
    finally {
        s.close();
    }
});
test('custom and recreated standard names cannot acquire localization identities from client input', async () => {
    const s = await createStore(':memory:');
    try {
        await s.deleteMasterData(1);
        const recreated = await s.createMasterData('reasons', { name: 'Defekt', builtinKey: 'reasons.defective' });
        const custom = await s.createMasterData('conditions', { name: 'Sonderzustand', builtinKey: 'conditions.defective' });
        assert.ok(recreated.id > 20);
        assert.equal(recreated.builtinKey, '');
        assert.equal(custom.builtinKey, '');
        assert.equal((await s.updateMasterData(custom.id, { builtinKey: 'conditions.defective' })).builtinKey, '');
    }
    finally {
        s.close();
    }
});
test('masterdata names are unique within their list and defaults remain usable', async () => {
    const s = await createStore(':memory:');
    try {
        await s.createMasterData('suppliers', { name: 'Nord', code: 'L-1' });
        await assert.rejects(async () => s.createMasterData('suppliers', { name: ' nord ' }));
        assert.equal((await s.createMasterData('manufacturers', { name: 'Nord' })).name, 'Nord');
        const reasons = (await s.listMasterData()).reasons;
        const next = await s.updateMasterData(reasons[0].id, { ...reasons[0], isDefault: true });
        assert.equal(next.isDefault, true);
        assert.equal((await s.listMasterData()).reasons.filter(x => x.isDefault).length, 1);
        for (const reason of (await s.listMasterData()).reasons.slice(1))
            await s.deleteMasterData(reason.id);
        await assert.rejects(async () => s.deleteMasterData(next.id));
    }
    finally {
        s.close();
    }
});
test('return supplier is optional and independent of the product supplier', async () => {
    const s = await createStore(':memory:');
    try {
        const a = await s.createMasterData('suppliers', { name: 'A' }), b = await s.createMasterData('suppliers', { name: 'B' });
        const p = await s.createProduct({ sku: 'P', name: 'Produkt', supplierId: a.id });
        const r = await s.createReturn({ serialNumber: 'TEST-SN', productId: p.id, receiptDate: '2026-10-05', supplierId: b.id });
        const empty = await s.createReturn({ serialNumber: 'TEST-SN', productId: p.id, receiptDate: '2026-10-05', supplierId: null });
        assert.equal(empty.supplier, '');
        await s.updateProduct(p.id, { ...p, supplierId: b.id });
        assert.equal((await s.getReturn(r.id)).supplier, 'B');
        const inherited = await s.createReturn({ serialNumber: 'TEST-SN', productId: p.id, receiptDate: '2026-10-05' });
        assert.equal(inherited.supplier, 'B');
        await s.updateProduct(p.id, { ...await s.getProduct(p.id), supplierId: a.id });
        assert.equal((await s.getReturn(inherited.id)).supplier, 'B');
        await s.updateMasterData(b.id, { ...b, name: 'B neu' });
        assert.equal((await s.getReturn(r.id)).supplier, 'B neu');
    }
    finally {
        s.close();
    }
});
test('archive keeps references and rejects new assignments and wrong list IDs', async () => {
    const s = await createStore(':memory:');
    try {
        const supplier = await s.createMasterData('suppliers', { name: 'Nord' });
        const p = await s.createProduct({ sku: 'P', name: 'Produkt', supplierId: supplier.id });
        assert.equal((await s.deleteMasterData(supplier.id)).archived, true);
        assert.equal((await s.getProduct(p.id)).supplier, 'Nord');
        await s.updateProduct(p.id, { ...await s.getProduct(p.id), name: 'Neuer Name' });
        await assert.rejects(async () => s.createProduct({ sku: 'P2', name: 'Test', supplierId: supplier.id }));
        const maker = await s.createMasterData('manufacturers', { name: 'Marke' });
        await assert.rejects(async () => s.createProduct({ sku: 'P3', name: 'Test', supplierId: maker.id }));
    }
    finally {
        s.close();
    }
});
test('custom closed statuses affect the returned workflow state', async () => {
    const s = await createStore(':memory:');
    try {
        const status = await s.createMasterData('statuses', { name: 'Erledigt', isClosed: true, tone: 'done' });
        const p = await s.createProduct({ sku: 'P', name: 'Produkt' });
        const r = await s.createReturn({ serialNumber: 'TEST-SN', productId: p.id, receiptDate: '2026-10-05',resolutionId:17,statusId: status.id });
        assert.equal(r.isClosed, true);
        assert.equal(r.status, 'Erledigt');
    }
    finally {
        s.close();
    }
});
