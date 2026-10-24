import {InputError} from '../shared/model.js';
import {loginPathFor} from '../shared/auth-navigation.js';
import {randomBytes} from 'node:crypto';

export function ssoCookieName(secure:boolean,scope:string){return secure?'__Host-retouren_sso':scope==='local'?'retouren_local_sso':'retouren_sso';}
export function ssoBrowserToken(req:any,secure:boolean,scope:string){const name=ssoCookieName(secure,scope);return String(req.headers.cookie??'').split(';').map(c=>c.trim()).find(c=>c.startsWith(name+'='))?.slice(name.length+1)??'';}

export async function handleSsoPublic({req,res,path,method,json,body,accounts,sso,origin,expectedOrigin,secure,scope,ip,userAgent,currentSession,sessionBody,setSession,run,setupRequired,allowLoopback}:any){
 if(!path.startsWith('/api/sso/'))return false;
 const cookieName=ssoCookieName(secure,scope),browserToken=ssoBrowserToken(req,secure,scope);
 const cookie=(value:string,age:number)=>res.setHeader('Set-Cookie',`${cookieName}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure?'; Secure':''}`);
 const clear=()=>cookie('',0);
 const configuredOrigin=()=>{const url=origin?new URL(origin):null,local=allowLoopback&&url&&['localhost','127.0.0.1','[::1]'].includes(url.hostname);if(!url||url.origin!==expectedOrigin||url.protocol!=='https:'&&!(local&&url.protocol==='http:'))throw new InputError('Bitte die öffentliche SSO-Adresse in den Servereinstellungen konfigurieren und den Server gegebenenfalls neu starten.',503);return origin;};
 if(path==='/api/sso/providers'&&method==='GET'){
  const enabled=!(await setupRequired())&&(await accounts.settings()).enabled;
  if(enabled&&!/^[a-f0-9]{64}$/.test(browserToken))cookie(randomBytes(32).toString('hex'),900);
  json({enabled,providers:enabled&&origin===expectedOrigin?await accounts.publicProviders():[]});return true;
 }
 const callback=path.match(/^\/api\/sso\/callback\/([a-f0-9-]{36})$/);
 if(callback&&method==='GET'){
  res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');
  try{
   const result=await sso.callback({providerId:callback[1],url:new URL(req.url,configuredOrigin()),browserToken,origin,ip});cookie(result.browserToken,120);
   res.writeHead(303,{Location:loginPathFor(result.returnTo)+'&sso=complete'});res.end();
  }catch{
   sso.invalidate(browserToken);clear();res.writeHead(303,{Location:'/login?sso=error'});res.end();
  }
  return true;
 }
 if(method!=='POST'||!['/api/sso/start','/api/sso/complete'].includes(path))throw new InputError('Endpunkt nicht gefunden.',404);
 if(req.headers.origin!==expectedOrigin)throw new InputError('Diese Anfrage ist nicht erlaubt.',403);
 if(await currentSession())throw new InputError('Bitte vor dem Wechsel des Anmeldekontos abmelden.',409);
 if(await setupRequired()||!(await accounts.settings()).enabled)throw new InputError('SSO ist deaktiviert.',403);
 configuredOrigin();
 if(path==='/api/sso/start'){
  const input=await body();if(typeof input.providerId!=='string'||!/^[a-f0-9-]{36}$/.test(input.providerId))throw new InputError('SSO-Anbieter nicht gefunden.',404);
  const result=await sso.start({providerId:input.providerId,returnTo:input.returnTo,origin,ip,previousToken:browserToken});
  cookie(result.browserToken,300);json({authorizationUrl:result.authorizationUrl});return true;
 }
 await body();
 const checkpoint=sso.checkpoint(browserToken);
 try{
  const result=await run(async()=>{if(await currentSession())throw new InputError('Anmeldung wurde inzwischen geändert.',409);return sso.complete({browserToken,origin,ip,accessScope:scope,userAgent});});
  if(result.mfaRequired||result.enrollmentRequired)cookie(browserToken,300);else clear();
  if(result.token){const payload={...await sessionBody(result),returnTo:result.returnTo};checkpoint();await setSession(result,checkpoint);checkpoint();json(payload);}else{checkpoint();json(result);}return true;
 }catch(error){res.removeHeader('Set-Cookie');clear();throw error;}
}

export async function handleSsoAdmin({path,method,body,json,accounts,sso,requireAdmin,verifyIdentity,mutate,publicOrigin}:any){
 if(!path.startsWith('/api/admin/sso'))return false;
 await requireAdmin();
 if(path==='/api/admin/sso'&&method==='GET'){
  json({settings:await accounts.settings(),providers:await accounts.providers(),requests:await accounts.requests(),identities:await accounts.identities(),publicOrigin});return true;
 }
 const input=await body();
 const check=async()=>{const current=await requireAdmin();await verifyIdentity(current.user.id,input.password,input.factor,requireAdmin);return current;};
 if(path==='/api/admin/sso/secrets/reset'&&method==='POST'){
  if(input.confirmed!==true)throw new InputError('Bitte das Zurücksetzen der SSO-Secrets bestätigen.');
  json(await mutate(async()=>{await check();return accounts.resetSecrets(requireAdmin);}));return true;
 }
 if(path==='/api/admin/sso'&&method==='PUT'){
  if(!Number.isSafeInteger(input.revision))throw new InputError('Der gelesene Versionsstand fehlt.',428);
  json(await mutate(async()=>{await check();return accounts.setEnabled(input.enabled,requireAdmin,input.revision);}));return true;
 }
 if(path==='/api/admin/sso/providers/check'&&method==='POST'){
  const provider=await accounts.prepareProvider(input.id??null,input);await sso.inspect(provider);await requireAdmin();json({ok:true});return true;
 }
 const providerPath=path.match(/^\/api\/admin\/sso\/providers(?:\/([a-f0-9-]{36}))?$/);
 if(providerPath&&['POST','PUT'].includes(method)){
  const id=providerPath[1]??null;if((method==='PUT')!==!!id)throw new InputError('Endpunkt nicht gefunden.',404);
  const provider=await accounts.prepareProvider(id,input);if(input.active)await sso.inspect(provider);
  json(await mutate(async()=>{await check();return accounts.saveProvider(id,input,requireAdmin);}),id?200:201);return true;
 }
 const decision=path.match(/^\/api\/admin\/sso\/requests\/([a-f0-9-]{36})$/);
 if(decision&&method==='POST'){json(await mutate(async()=>{await check();return accounts.decide(decision[1],input,requireAdmin);}));return true;}
 const link=path.match(/^\/api\/admin\/sso\/identities\/([a-f0-9-]{36})$/);
 if(link&&method==='DELETE'){json(await mutate(async()=>{await check();return accounts.unlink(link[1],requireAdmin);}));return true;}
 throw new InputError('Endpunkt nicht gefunden.',404);
}
