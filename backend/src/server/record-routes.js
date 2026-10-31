import { InputError } from '../shared/model.js';
import { requirePermission } from './permissions.js';
import { hasPermission } from '../shared/permissions.js';
import { checkRecordRevision, expectedRevision } from './database/record-metadata.js';
import { NOT_HANDLED } from './route-result.js';
export async function handleRecordRoute(ctx) {
    const { req, res, path, method, isWrite, json, body, mutate, requireAccess, requireSession, requireAdministration, store, attachments, returnWorkflow } = ctx;
    const attachmentList = path.match(/^\/api\/returns\/([1-9]\d*)\/attachments$/);
    if (attachmentList) {
        const id = Number(attachmentList[1]);
        if (!Number.isSafeInteger(id))
            throw new InputError('Ungültige ID.');
        if (method === 'GET')
            return json(await attachments.list(id));
        if (method === 'POST')
            return json(await attachments.upload(id, req, requireAccess, async (job) => mutate(job)), 201);
    }
    const attachmentPath = path.match(/^\/api\/attachments\/([1-9]\d*)(?:\/(preview|download))?$/);
    if (attachmentPath) {
        const id = Number(attachmentPath[1]);
        if (!Number.isSafeInteger(id))
            throw new InputError('Ungültige ID.');
        if (method === 'DELETE' && !attachmentPath[2])
            return json(await mutate(async () => attachments.remove(id)));
        if (['GET', 'HEAD'].includes(method) && attachmentPath[2]) {
            const { item, bytes } = await attachments.read(id), mode = attachmentPath[2] === 'download' ? 'attachment' : 'inline';
            await requireAccess();
            res.setHeader('X-Frame-Options', 'SAMEORIGIN');
            res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'self'; base-uri 'none'");
            res.writeHead(200, { 'Content-Type': item.mediaType, 'Content-Length': item.size, 'Cache-Control': 'no-store', 'Content-Disposition': `${mode}; filename="datei${item.mediaType === 'application/pdf' ? '.pdf' : item.mediaType === 'image/png' ? '.png' : item.mediaType === 'image/webp' ? '.webp' : '.jpg'}"; filename*=UTF-8''${encodeURIComponent(item.originalName)}` });
            return res.end(method === 'HEAD' ? undefined : bytes);
        }
    }
    if (method === 'GET' && path === '/api/masterdata') {
        const values = await store.listMasterData();
        if (!hasPermission((await requireSession()).user, 'masterdataManage'))
            for (const entries of Object.values(values))
                for (const item of entries) {
                    delete item.code;
                    delete item.notes;
                    delete item.nameKey;
                }
        return json(values);
    }
    const masterMatch = path.match(/^\/api\/masterdata\/([a-z]+|[1-9]\d*)$/);
    if (masterMatch) {
        if (isWrite)
            await requireAdministration();
        const key = masterMatch[1];
        if (method === 'POST' && /^[a-z]+$/.test(key)) {
            const value = await body();
            return json(await mutate(async () => { await requireAdministration(); return store.createMasterData(key, value); }), 201);
        }
        if (/^\d+$/.test(key)) {
            const id = Number(key);
            if (!Number.isSafeInteger(id))
                throw new InputError('Ungültige ID.');
            if (method === 'PUT') {
                const value = await body();
                return json(await mutate(async () => { await requireAdministration(); return store.updateMasterData(id, value); }));
            }
            if (method === 'DELETE')
                return json(await mutate(async () => { await requireAdministration(); return store.deleteMasterData(id); }));
        }
    }
    const statusPath = path.match(/^\/api\/returns\/([1-9]\d*)\/status$/);
    if (statusPath && method === 'PUT') {
        const input = await body();
        if (Object.keys(input).some(key => !['status', 'statusId'].includes(key)) || Object.keys(input).length !== 1)
            throw new InputError('Bitte ausschließlich den neuen Status angeben.');
        return json(await mutate(async () => {
            const id = Number(statusPath[1]), old = await store.getReturn(id);
            if (!old)
                throw new InputError('Retoure nicht gefunden.', 404);
            const value = { ...old, ...input };
            if (Object.hasOwn(input, 'status'))
                delete value.statusId;
            return store.updateReturn(id, value);
        }));
    }
    const productImageMatch = path.match(/^\/api\/products\/([1-9]\d*)\/image$/);
    if (productImageMatch && ['GET', 'HEAD'].includes(method)) {
        const id = Number(productImageMatch[1]);
        if (!Number.isSafeInteger(id))
            throw new InputError('Ungültige ID.');
        const image = (await store.db.query("SELECT mediaType,data FROM product_images WHERE productId=$1", [id])).rows[0];
        if (!image || !['image/png', 'image/jpeg', 'image/webp'].includes(image.mediaType))
            throw new InputError('Produktbild nicht gefunden.', 404);
        res.writeHead(200, { 'Content-Type': image.mediaType, 'Content-Length': image.data.length, 'Cache-Control': 'private, no-store', 'Vary': 'Cookie' });
        return res.end(method === 'HEAD' ? undefined : image.data);
    }
    for (const kind of ['products', 'returns']) {
        if (path === `/api/${kind}`) {
            if (method === 'GET') {
                if (kind === 'products')
                    return json(await store.listProducts());
                const page=await store.pageReturns(new URL(req.url,'http://localhost').searchParams),rows=page?.items??await store.listReturns();
                const counts = new Map((rows.length?(await store.db.query("SELECT returnId,COUNT(*) AS total FROM attachments WHERE returnId=ANY($1::bigint[]) GROUP BY returnId", [rows.map(row=>row.id)])).rows:[]).map(row => [row.returnId, Number(row.total)]));
                const enriched=await returnWorkflow.enrichReturns(rows,(await requireSession()).user),items=returnWorkflow.visibleRows((await requireSession()).user,enriched).map(item=>({...item,attachmentCount:counts.get(item.id)??0}));return json(page?{...page,items}:items);
            }
            if (method === 'POST') {
                const value = await body();
                return json(await mutate(async () => kind === 'products' ? await store.createProduct(value) : await store.createReturn(value)), 201);
            }
        }
        const match = path.match(new RegExp(`^/api/${kind}/([1-9]\\d*)$`));
        if (match) {
            const id = Number(match[1]);
            if (!Number.isSafeInteger(id))
                throw new InputError('Ungültige ID.');
            if (method === 'GET') {
                const item = kind === 'products' ? await store.getProduct(id) : await store.getReturn(id);
                if (!item)
                    throw new InputError('Eintrag nicht gefunden.', 404);
                if(kind==='returns'){const enriched=await returnWorkflow.enrichReturns([item],(await requireSession()).user),attachmentCount=Number((await store.db.query('SELECT COUNT(*) AS total FROM attachments WHERE returnId=$1',[id])).rows[0].total);return json({...returnWorkflow.visibleRows((await requireSession()).user,enriched)[0],attachmentCount});}return json(item);
            }
            if (method === 'PUT') {
                const value = await body();
                return json(await mutate(async () => {
                    await checkRecordRevision(store.db,kind,id,expectedRevision(value?.revision));
                    if (kind === 'products') {
                        const prepared = await store.prepareProduct(value, id);
                        if ((await store.getProduct(id)).active && !prepared.active)
                            requirePermission((await requireSession()).user, 'productsDelete');
                        return store.updateProduct(id, value);
                    }
                    const prepared = await store.prepareReturn(value, id);
                    if (prepared.statusId !== (await store.getReturn(id)).statusId)
                        requirePermission((await requireSession()).user, 'returnsStatus');
                    return store.updateReturn(id, value);
                }));
            }
            if (method === 'DELETE') {
                const value=await body();
                return json(await mutate(async () => {
                    const revision=expectedRevision(value?.revision);
                    await checkRecordRevision(store.db,kind,id,revision);
                    if (kind === 'products')
                        return store.deleteProduct(id,{expectedRevision:revision});
                    if ((await attachments.list(id)).length)
                        requirePermission((await requireSession()).user, 'attachmentsDelete');
                    return attachments.removeReturn(id,{expectedRevision:revision});
                }));
            }
        }
    }
    return NOT_HANDLED;
}
