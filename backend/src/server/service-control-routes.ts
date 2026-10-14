import type {IncomingMessage,ServerResponse} from 'node:http';
class RequestError extends Error {constructor(message:string,public status:number){super(message);}}
async function body(req:IncomingMessage,limit:number){if(req.headers['content-type']!=='application/json')throw new RequestError('JSON erwartet.',415);let size=0;const chunks:Buffer[]=[];for await(const chunk of req){size+=chunk.length;if(size>limit)throw new RequestError('Anfrage zu groß.',413);chunks.push(chunk);}try{const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!input||typeof input!=='object'||Array.isArray(input))throw Error();return input;}catch{throw new RequestError('Ungültige JSON-Anfrage.',400);}}
export function createServiceControlHandler({worker,serviceControl}:{worker:any;serviceControl:any}){
 return async(req:IncomingMessage,res:ServerResponse)=>{
  const json=(value:any,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  const noRestart=()=>{if(['prepared','restarting'].includes(serviceControl.status().state))throw new RequestError('Ein Serverneustart läuft bereits.',409);};
  try{
   if(req.method==='GET'&&req.url==='/status')return json(worker.status());
   if(req.method==='GET'&&req.url==='/server/status')return json(serviceControl.status());
   if(req.method==='GET'&&req.url==='/server/logs'){try{return json(await serviceControl.logs());}catch{throw new RequestError('Dienstprotokoll konnte nicht gelesen werden.',503);}}
   if(req.method==='POST'&&req.url==='/start'){
    noRestart();const input=await body(req,2048);if(Object.keys(input).some(key=>!['id','version'].includes(key)))throw new RequestError('Ungültiger Updateauftrag.',400);
    // A different request may reserve a restart while this body is arriving.
    noRestart();return json(worker.start(input),202);
   }
   if(req.method==='POST'&&['/server/restart/prepare','/server/restart/commit','/server/restart/cancel'].includes(req.url??'')){
    const input=await body(req,1024);if(Object.keys(input).some(key=>key!=='id'))throw new RequestError('Ungültiger Neustartauftrag.',400);
    if(req.url==='/server/restart/prepare'){if(Object.keys(input).length)throw new RequestError('Ungültiger Neustartauftrag.',400);return json(serviceControl.prepareRestart(),202);}
    if(typeof input.id!=='string'||! /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(input.id))throw new RequestError('Ungültiger Neustartauftrag.',400);
    if(req.url==='/server/restart/cancel'){serviceControl.cancelRestart(input.id);return json({ok:true});}
    const pending=serviceControl.commitRestart(input.id);void pending.catch(()=>{});return json(serviceControl.status(),202);
   }
   json({error:'Nicht gefunden.'},404);
  }catch(error:any){json({error:error instanceof RequestError?error.message:typeof error.message==='string'&&/bereits|neuere|Wiederherstellung|Updateauftrag|Neustartauftrag|Ein Update/.test(error.message)?error.message:'Serverauftrag konnte nicht angenommen werden.'},error instanceof RequestError?error.status:409);}
 };
}
