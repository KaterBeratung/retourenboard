import { requireCapability, requirePermission } from './permissions.js';
// Berechtigungen je API-Pfad; die Anmeldung und der Adminbereich werden vorher geprüft.
export function requireRoutePermissions(user: any, path: string, method: string, isWrite: boolean) {
    if (path.startsWith('/api/import/') || path.startsWith('/api/template/'))
        requireCapability(user, 'import');
    else if (path.startsWith('/api/export/'))
        requireCapability(user, 'export');
    const csvKind = path.match(/^\/api\/(export|template)\/(products|returns)$/);
    if (csvKind)
        requirePermission(user, (csvKind[2] + (csvKind[1] === 'export' ? 'Export' : 'Import')) as any);
    if (/^\/api\/returns\/[1-9]\d*\/attachments$/.test(path))
        requirePermission(user, method === 'POST' ? 'attachmentsUpload' : 'attachmentsView');
    else if (/^\/api\/attachments\//.test(path))
        requirePermission(user, method === 'DELETE' ? 'attachmentsDelete' : 'attachmentsView');
    else if (/^\/api\/returns\/[1-9]\d*\/status$/.test(path))
        requirePermission(user, 'returnsStatus');
    else if (/^\/api\/returns\/[1-9]\d*\/(reopen|handover)$/.test(path)){requirePermission(user,'returnsEdit');requirePermission(user,'returnsStatus');}
    else if (path === '/api/returns/bulk/status')
        requirePermission(user, 'returnsStatus');
    else if (isWrite) {
        const kind = path.match(/^\/api\/(products|returns)(?:\/[1-9]\d*)?$/)?.[1];
        if (kind)
            requirePermission(user, (kind + (method === 'DELETE' ? 'Delete' : method === 'POST' ? 'Create' : 'Edit')) as any);
    }
    if(/^\/api\/returns\/[1-9]\d*\/customer-status$/.test(path))requirePermission(user,'returnsShare');
    if(path.startsWith('/api/disposals')){requirePermission(user,'disposalsRead');if(/^\/api\/disposals\/[1-9]\d*\/customer-status(?:\/comments)?$/.test(path)){requirePermission(user,'disposalsShare');}else if(/^\/api\/disposals\/[1-9]\d*\/comments(?:\/[1-9]\d*)?$/.test(path)){if(method==='POST'||method==='PUT')requirePermission(user,'disposalsCommentsCreate');}else{const action=path.split('/')[4],key=path.startsWith('/api/disposals/import/')?'disposalsImport':path==='/api/disposals/export'?'disposalsExport':method==='GET'?(action==='label'?'disposalsExport':'disposalsRead'):method==='PUT'?'disposalsEdit':action==='approve'?'disposalsApprove':action==='complete'||action==='correct'?'disposalsComplete':action==='cancel'?'disposalsEdit':'disposalsCreate';requirePermission(user,key);if(action==='correct')requirePermission(user,'disposalsEdit');}}
}
