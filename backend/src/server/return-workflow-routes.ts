import {hasPermission} from '../shared/permissions.js';
import {expectedRevision} from './database/record-metadata.js';
import {returnSelection} from './return-workflow.js';
export async function handleReturnWorkflowRoute({ path, method, query, body, json, user, mutate, workflow }: any) {
    if (path === '/api/returns/assignees' && method === 'GET') {
        await user();
        json(await workflow.assignees());
        return true;
    }
    if (path === '/api/returns/bulk/status' && method === 'POST') {
        const input = await body();
        returnSelection(input?.ids);
        if(!input?.revisions||typeof input.revisions!=='object'||Array.isArray(input.revisions))expectedRevision(undefined);
        if(Array.isArray(input.ids))for(const id of input.ids)expectedRevision(input.revisions[id]);
        json(await mutate(async () => workflow.bulkStatus(await user(), input)));
        return true;
    }
    if (path === '/api/returns/status/undo' && method === 'POST') {
        const input = await body();
        json(await mutate(async () => workflow.undoStatus(await user(), input)));
        return true;
    }
    if(path==='/api/returns/serial-lookup'&&method==='GET'){const current=await user(),data=await workflow.serialLookup(current,query);data.items=workflow.visibleRows(await user(),data.items);json(data);return true;}
    const transition=path.match(/^\/api\/returns\/([1-9]\d*)\/(reopen|handover)$/);if(transition&&method==='POST'){const input=await body();expectedRevision(input?.revision);json(await mutate(async()=>workflow.transition(await user(),Number(transition[1]),transition[2],input)));return true;}
    const inspection=path.match(/^\/api\/returns\/([1-9]\d*)\/workflow$/);if(inspection&&method==='GET'){const current=await user(),result=await workflow.completion(current,Number(inspection[1]));const latest=await user();if(!hasPermission(latest,'disposalsRead'))delete result.disposals;json(result);return true;}
    const status = path.match(/^\/api\/returns\/([1-9]\d*)\/status$/);
    if (status && method === 'PUT') {
        const input = await body();
        expectedRevision(input?.revision);
        json(await mutate(async () => workflow.quickStatus(await user(), Number(status[1]), input)));
        return true;
    }
    const timeline = path.match(/^\/api\/returns\/([1-9]\d*)\/timeline$/);
    if (timeline && method === 'GET') {
        json(await workflow.timeline(await user(), Number(timeline[1]), query));
        return true;
    }
    return false;
}
