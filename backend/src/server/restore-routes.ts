import {InputError} from '../shared/model.js';
export async function handleRestoreRoute({req,res,path,method,runtime,backups,owner,body,json,coordinator,verifyIdentity,beginMaintenance,checkOwner,actor}:any){
 if(!path.startsWith('/api/admin/backups/restore/'))return false;
 const original=owner();if(!runtime)throw new InputError('Wiederherstellung benötigt den regulären Serverstart.',503);
 const controller=runtime.controller;
 if(method==='POST'&&path.endsWith('/prepare')){const input=await body(),file=backups.file(input.backupId);const view=await controller.prepareLocal(file.path,original);checkOwner(original);json(view,201);return true;}
 if(method==='POST'&&path.endsWith('/upload')){if(!['application/octet-stream','application/gzip'].includes(String(req.headers['content-type']).split(';')[0]))throw new InputError('Binäres Sicherungsarchiv erwartet.',415);req.setTimeout(120000);const view=await controller.prepareUpload(req,original);checkOwner(original);json(view,201);return true;}
 const match=path.match(/^\/api\/admin\/backups\/restore\/([a-f0-9-]{36})(?:\/(key|commit))?$/);if(!match)throw new InputError('Wiederherstellung nicht gefunden.',404);
 if(method==='GET'&&!match[2]){json(controller.get(match[1],original));return true;}
 if(method==='POST'&&match[2]==='key'){let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>32)throw new InputError('Die Schlüsseldatei muss genau 32 Byte enthalten.',413);chunks.push(chunk);}checkOwner(original);json(controller.setKey(match[1],Buffer.concat(chunks),original));return true;}
 if(method==='POST'&&match[2]==='commit'){
  const input=await body();if(input.confirmed!==true)throw new InputError('Wiederherstellung muss ausdrücklich bestätigt werden.');controller.get(match[1],original);
  let prepared:any,release:()=>void=()=>{},cancelled=res.destroyed;
  const disconnected=()=>{if(!res.writableFinished)cancelled=true;};res.once('close',disconnected);
  try{
   await coordinator.run(async()=>{checkOwner(original);runtime.limitIdentity(original);await verifyIdentity(original.userId,input.password,input.factor,()=>checkOwner(original));checkOwner(original);release=beginMaintenance();prepared=controller.reserve(match[1],original);});
   await backups.create(actor(),'manual',()=>checkOwner(original));checkOwner(original);
   if(cancelled||res.destroyed){release();controller.release(prepared.id);return true;}
   let handedOff=false;
   const handoff=()=>{if(handedOff)return;handedOff=true;res.removeListener('close',disconnected);runtime.activateRestore(prepared).catch((error:any)=>{runtime.recordFailure(error);});};
   res.once('finish',handoff);
   res.once('close',()=>{if(!handedOff){if(res.writableFinished)handoff();else{release();controller.release(prepared.id);}}});
   json({accepted:true,id:prepared.id},202);
  }catch(error){release();if(prepared)controller.release(prepared.id);throw error;}
  return true;
 }
 throw new InputError('Wiederherstellung nicht gefunden.',404);
}
