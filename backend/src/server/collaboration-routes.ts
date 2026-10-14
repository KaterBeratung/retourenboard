export async function handleCollaborationRoute({req,res,path,method,query,body,json,user,mutate,collaboration:c}:any){
  if(path==='/api/collaboration/users'&&method==='GET'){user();json(c.directory());return true;}
  if(path==='/api/chat/channels'){
    if(method==='GET'){json(c.channels(user()));return true;}
    if(method==='POST'){const input=await body();json(await mutate(()=>c.createChannel(user(),input)),201);return true;}
  }
  const upload=path.match(/^\/api\/chat\/channels\/([1-9]\d*)\/attachments$/);
  if(upload&&method==='POST'){json(await c.uploadAttachment(Number(upload[1]),req,user,mutate),201);return true;}
  const file=path.match(/^\/api\/chat\/attachments\/([1-9]\d*)\/(preview|download)$/);
  if(file&&['GET','HEAD'].includes(method)){
    const n=Number(file[1]),{item,bytes}=await c.readAttachment(user(),n);c.assertAttachmentAccess(user(),n);
    res.setHeader('X-Frame-Options','SAMEORIGIN');res.setHeader('Content-Security-Policy',"default-src 'none'; frame-ancestors 'self'; base-uri 'none'");
    const extension=item.mediaType==='application/pdf'?'.pdf':item.mediaType==='image/png'?'.png':item.mediaType==='image/webp'?'.webp':'.jpg',mode=file[2]==='download'?'attachment':'inline';
    res.writeHead(200,{'Content-Type':item.mediaType,'Content-Length':item.size,'Cache-Control':'private, no-store','Content-Disposition':`${mode}; filename="datei${extension}"; filename*=UTF-8''${encodeURIComponent(item.originalName)}`});res.end(method==='HEAD'?undefined:bytes);return true;
  }
  const lookup=path.match(/^\/api\/chat\/channels\/([1-9]\d*)\/(search|pins)$/);
  if(lookup&&method==='GET'){json(lookup[2]==='search'?c.searchMessages(user(),Number(lookup[1]),query):c.pins(user(),Number(lookup[1])));return true;}
  const pin=path.match(/^\/api\/chat\/messages\/([1-9]\d*)\/pin$/);
  if(pin&&method==='PUT'){const input=await body();json(await mutate(()=>c.pinMessage(user(),Number(pin[1]),input)));return true;}
  const channel=path.match(/^\/api\/chat\/channels\/([1-9]\d*)(?:\/(messages|read|join|leave))?$/);
  if(channel){const n=Number(channel[1]),action=channel[2];
    if(method==='GET'&&!action){json(c.getChannel(user(),n));return true;}
    if(method==='PUT'&&!action){const input=await body();json(await mutate(()=>c.updateChannel(user(),n,input)));return true;}
    if(method==='GET'&&action==='messages'){json(c.messages(user(),n,query));return true;}
    if(method==='POST'&&action){const input=await body();json(await mutate(()=>action==='messages'?c.postMessage(user(),n,input):action==='read'?c.markRead(user(),n,input):action==='join'?c.join(user(),n):c.leave(user(),n)),action==='messages'?201:200);return true;}
  }
  const message=path.match(/^\/api\/chat\/messages\/([1-9]\d*)$/);
  if(message&&['PUT','DELETE'].includes(method)){const input=method==='PUT'?await body():{};json(await mutate(()=>c.changeMessage(user(),Number(message[1]),input,method==='DELETE')));return true;}
  const comment=path.match(/^\/api\/returns\/([1-9]\d*)\/comments(?:\/([1-9]\d*))?$/);
  if(comment){const n=Number(comment[1]),commentId=comment[2]?Number(comment[2]):null;
    if(method==='GET'&&!commentId){json(c.comments(user(),n,query));return true;}
    if(method==='POST'&&!commentId){const input=await body();json(await mutate(()=>c.postComment(user(),n,input)),201);return true;}
    if(commentId&&['PUT','DELETE'].includes(method)){const input=method==='PUT'?await body():{};json(await mutate(()=>c.changeComment(user(),n,commentId,input,method==='DELETE')));return true;}
  }
  return false;
}
