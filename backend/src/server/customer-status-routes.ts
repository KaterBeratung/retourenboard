import {CUSTOMER_STATUS_TOKEN} from './customer-status.js';
export function customerStatusHeaders(res:any){res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');}
export async function handleCustomerStatusPublic({path,method,res,json,readPage,service,limit,ip,kind='returns'}:any){
 const prefix=kind==='disposals'?'/api/public/disposal-status/':'/api/public/return-status/',short=kind==='disposals'?'/d/':'/s/',api=path.startsWith(prefix),page=path.startsWith(short);if(!api&&!page)return false;
 customerStatusHeaders(res);
 if(!['GET','HEAD'].includes(method)){res.setHeader('Allow','GET, HEAD');json({error:'Diese Aktion ist nicht erlaubt.'},405);return true;}
 const retry=limit(ip);if(retry){res.setHeader('Retry-After',String(retry));json({error:'Bitte kurz warten und erneut versuchen.'},429);return true;}
 const token=path.slice(api?prefix.length:short.length);
 if(!CUSTOMER_STATUS_TOKEN.test(token)){json({error:'Dieser Link ist nicht verfügbar oder abgelaufen.'},404);return true;}
 if(page){const content=await readPage();res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(method==='HEAD'?undefined:content);return true;}
 try{const data=await service.publicRead(token);json(data);}catch(error:any){if(error.status!==404)throw error;json({error:'Dieser Link ist nicht verfügbar oder abgelaufen.'},404);}return true;
}
export async function handleCustomerStatusRoute({path,method,body,json,user,mutate,service,publicOrigin,query,kind='returns'}:any){
 const base=kind==='disposals'?'disposals':'returns';
 const choices=path.match(new RegExp('^/api/'+base+'/([1-9]\\d*)/customer-status/comments$'));
 if(choices&&method==='GET'){json(await service.commentChoices(await user(),Number(choices[1]),query?.get('before')??undefined,query?.get('ids')??undefined));return true;}
 const match=path.match(new RegExp('^/api/'+base+'/([1-9]\\d*)/customer-status$'));if(!match)return false;
 const id=Number(match[1]);
 if(method==='GET'){json({...await service.read(await user(),id),publicOrigin:publicOrigin||null});return true;}
 if(['POST','PUT','DELETE'].includes(method)){const input=await body();const data=await mutate(async()=>service.write(await user(),id,method,input));json({...data,publicOrigin:publicOrigin||null},method==='POST'?201:200);return true;}
 return false;
}
