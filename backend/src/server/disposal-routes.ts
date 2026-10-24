import {exportDisposals,importDisposals} from './disposal-transfer.js';
import {requirePermission} from './permissions.js';
import {qrDataUrl} from '../vendor/qr.js';
export async function handleDisposalRoute({path,method,query,body,json,user,mutate,disposals,store,now}:any){
 if(path==='/api/disposals/export'&&method==='GET'){const result=await exportDisposals(store,await user());requirePermission(await user(),'disposalsExport');json(result);return true;}
 if(['/api/disposals/import/preview','/api/disposals/import/commit'].includes(path)&&method==='POST'){const input=await body();const run=async()=>importDisposals({store,user:await user(),data:input.data,commit:path.endsWith('commit'),now});const result=path.endsWith('commit')?await mutate(run):await run();requirePermission(await user(),'disposalsImport');json(result);return true;}
 if(path==='/api/disposals'){
  if(method==='GET'){json(await disposals.list(await user(),query));return true;}
  if(method==='POST'){const input=await body();json(await mutate(async()=>disposals.create(await user(),input)),201);return true;}
 }
 const match=path.match(/^\/api\/disposals\/([1-9]\d*)(?:\/(approve|complete|cancel|correct|label))?$/);if(!match)return false;const id=Number(match[1]),action=match[2];
 if(method==='GET'&&!action){json(await disposals.details(await user(),id));return true;}
 if(method==='GET'&&action==='label'){const owner=await user(),row=await disposals.label(owner,id,query.kind??'order'),image=await qrDataUrl(row.disposalNumber,{margin:4}),current=await user();requirePermission(current,'disposalsExport');requirePermission(current,'disposalsRead');if(current.id!==owner.id)throw Error('Deine Anmeldung hat sich geändert.');json({...row,qrDataUrl:image});return true;}
 if((method==='POST'&&action&&action!=='label')||(method==='PUT'&&!action)){const input=await body();json(await mutate(async()=>disposals.change(await user(),id,action??'update',input)));return true;}
 return false;
}
