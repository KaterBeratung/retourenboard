export async function handleReturnWorkflowRoute({path,method,query,body,json,user,mutate,workflow}:any){
  if(path==='/api/returns/assignees'&&method==='GET'){user();json(workflow.assignees());return true;}
  if(path==='/api/returns/bulk/status'&&method==='POST'){
    const input=await body();json(await mutate(()=>workflow.bulkStatus(user(),input)));return true;
  }
  if(path==='/api/returns/status/undo'&&method==='POST'){
    const input=await body();json(await mutate(()=>workflow.undoStatus(user(),input)));return true;
  }
  const status=path.match(/^\/api\/returns\/([1-9]\d*)\/status$/);
  if(status&&method==='PUT'){
    const input=await body();json(await mutate(()=>workflow.quickStatus(user(),Number(status[1]),input)));return true;
  }
  const timeline=path.match(/^\/api\/returns\/([1-9]\d*)\/timeline$/);
  if(timeline&&method==='GET'){json(workflow.timeline(user(),Number(timeline[1]),query));return true;}
  return false;
}
