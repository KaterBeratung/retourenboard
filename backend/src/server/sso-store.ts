import {randomUUID} from 'node:crypto';
import {InputError} from '../shared/model.js';
import type {createSecrets} from './secrets.js';

const fail=(message='Ungültige SSO-Einstellung.',status=400):never=>{throw new InputError(message,status);};
const text=(value:unknown,max:number,required=true)=>{
 if(typeof value!=='string'||value.length>max||/[\x00-\x1f\x7f]/.test(value)||required&&!value.trim())return fail();
 return value.trim();
};
export function ssoUrl(value:unknown,allowLoopback=false){
 const raw=text(value,1000),url=(()=>{try{return new URL(raw);}catch{return fail();}})();
 const local=allowLoopback&&['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 if(url.username||url.password||url.hash||url.search||url.protocol!=='https:'&&!(local&&url.protocol==='http:'))return fail('SSO benötigt eine gültige HTTPS-Adresse.');
 return url;
}
export function validateSsoProvider(input:any,allowLoopback=false){
 if(!input||typeof input!=='object'||Array.isArray(input))return fail();
 const type=input.type;if(!['oidc','microsoft'].includes(type))return fail();
 let issuer:string;
 if(type==='microsoft'){
  const tenant=text(input.tenantId??ssoUrl(input.issuer,allowLoopback).pathname.split('/')[1],36);
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenant))return fail('Bitte die konkrete Microsoft-Tenant-ID eingeben.');
  issuer=`https://login.microsoftonline.com/${tenant.toLowerCase()}/v2.0`;
 }else{ssoUrl(input.issuer,allowLoopback);issuer=text(input.issuer,1000);}
 if(typeof input.active!=='boolean'||!['client_secret_basic','client_secret_post'].includes(input.authMethod))return fail();
 if(!Array.isArray(input.allowedOrigins)||input.allowedOrigins.length>8)return fail();
 const allowedOrigins=[...new Set(input.allowedOrigins.map((value:unknown)=>{const url=ssoUrl(value,allowLoopback);if(url.pathname!=='/')return fail();return url.origin;}))];
 if(input.clientSecret!==undefined&&(typeof input.clientSecret!=='string'||input.clientSecret.length>4000||/[\x00-\x1f\x7f]/.test(input.clientSecret)))return fail();
 return {label:text(input.label,80),type,issuer,clientId:text(input.clientId,250),authMethod:input.authMethod,active:input.active,allowedOrigins,clientSecret:input.clientSecret??''};
}

export function createSsoStore({store,secrets,now=Date.now,onRevoke=async()=>{},allowLoopback=false}:{store:any;secrets:ReturnType<typeof createSecrets>;now?:()=>number;onRevoke?:(id:number)=>Promise<void>;allowLoopback?:boolean}){
 const db=store.db,at=()=>new Date(now()).toISOString();
 const settings=async()=>{const row=(await db.query("SELECT value FROM app_preferences WHERE section='sso'")).rows[0];const v=row?JSON.parse(row.value):{};return {enabled:v.enabled===true,revision:Number.isSafeInteger(v.revision)?v.revision:1};};
 const rawProvider=async(id:string)=>{const row=(await db.query('SELECT * FROM sso_providers WHERE id=$1',[id])).rows[0];if(!row)return fail('SSO-Anbieter nicht gefunden.',404);return row;};
 const readable=(p:any)=>{if(!p.secretEnc)return false;try{secrets.decrypt('oidc',p.id,p.secretEnc);return true;}catch{return false;}};
 const visible=(p:any)=>({id:p.id,label:p.label,type:p.type,issuer:p.issuer,clientId:p.clientId,authMethod:p.authMethod,allowedOrigins:JSON.parse(p.allowedOrigins),active:!!p.active,configVersion:p.configVersion,secretSet:!!p.secretEnc,keyAvailable:readable(p)});
 async function transaction<T>(check:()=>any,job:()=>Promise<T>):Promise<T>{return store.transaction(async()=>{await db.query("SELECT pg_advisory_xact_lock(hashtextextended(current_schema() || ':accounts',0))");await check();return job();});}
 async function revoke(ids:number[]){
  for(const id of new Set(ids)){await db.query('UPDATE users SET authVersion=authVersion+1 WHERE id=$1',[id]);await onRevoke(id);}
 }
 const linked=async(providerId?:string)=>(await db.query('SELECT DISTINCT userId FROM sso_identities'+(providerId?' WHERE providerId=$1':''),providerId?[providerId]:[])).rows.map((r:any)=>r.userId);
 const record=async(action:string,id:string|number,after:any={})=>store.recordChange?.({entity:'sso',id,action,after});
 async function getProvider(id:string){
  const global=await settings();if(!global.enabled)return fail('SSO ist deaktiviert.',403);
  const p=await rawProvider(id);if(!p.active)return fail('SSO-Anbieter ist deaktiviert.',403);
  if(!p.secretEnc)return fail('SSO-Anbieter ist nicht vollständig eingerichtet.',503);
  return {...visible(p),clientSecret:secrets.decrypt('oidc',p.id,p.secretEnc),globalVersion:global.revision};
 }
 function identity(claims:any,issuer:string){
  if(claims?.iss!==issuer||typeof claims?.sub!=='string'||!claims.sub.length||claims.sub.length>255||/[^\x20-\x7e]/.test(claims.sub))return fail('SSO-Identität ist ungültig.',401);
  return {issuer,subject:claims.sub};
 }
 return {
  settings,getProvider,
  async resetSecrets(check:()=>any=()=>{}){
   const result={ok:true,keyAvailable:false};
   await transaction(check,async()=>{
    await revoke(await linked());const old=await settings();
    await db.query("INSERT INTO app_preferences(section,value) VALUES('sso',$1) ON CONFLICT(section) DO UPDATE SET value=excluded.value",[JSON.stringify({enabled:false,revision:old.revision+1})]);
    await db.query("UPDATE sso_providers SET active=0,secretEnc='',configVersion=configVersion+1,updatedAt=$1",[at()]);
    await record('ssoSecretsReset','global',{enabled:false});
    db.onCommit(()=>{secrets.resetOidcKey();result.keyAvailable=true;});
   });return result;
  },
  async prepareProvider(id:string|null,input:any){const value=validateSsoProvider(input,allowLoopback),old=id?await rawProvider(id):null;return {...value,id:id??'inspection',configVersion:old?.configVersion??1,clientSecret:value.clientSecret||(old?.secretEnc?secrets.decrypt('oidc',old.id,old.secretEnc):'')};},
  async providers(){return (await db.query('SELECT * FROM sso_providers ORDER BY lower(label),id')).rows.map(visible);},
  async publicProviders(){
   if(!(await settings()).enabled||!secrets.has('oidc'))return [];
   return (await db.query("SELECT * FROM sso_providers WHERE active=1 AND secretEnc<>'' ORDER BY lower(label),id")).rows.filter(readable).map((p:any)=>({id:p.id,label:p.label,type:p.type}));
  },
  async setEnabled(enabled:boolean,check:()=>any=()=>{},revision?:number){
   if(typeof enabled!=='boolean')return fail();
   return transaction(check,async()=>{const old=await settings();if(revision!==undefined&&old.revision!==revision)return fail('SSO-Einstellungen wurden inzwischen geändert. Bitte neu laden.',409);
    if(enabled&&!(await db.query("SELECT 1 FROM sso_providers WHERE active=1 AND secretEnc<>'' LIMIT 1")).rowCount)return fail('Bitte zuerst einen SSO-Anbieter einrichten und aktivieren.');
    if(enabled&&!(await db.query("SELECT * FROM sso_providers WHERE active=1 AND secretEnc<>''")).rows.some(readable))return fail('SSO-Schlüssel fehlt oder passt nicht. Bitte Anbieter-Secrets neu einrichten.',503);
    if(old.enabled===enabled)return old;
    if(!enabled)await revoke(await linked());
    const result={enabled,revision:old.revision+1};await db.query("INSERT INTO app_preferences(section,value) VALUES('sso',$1) ON CONFLICT(section) DO UPDATE SET value=excluded.value",[JSON.stringify(result)]);
    await record('ssoToggle','global',{enabled});return result;
   });
  },
  async saveProvider(id:string|null,input:any,check:()=>any=()=>{}){
   const value=validateSsoProvider(input,allowLoopback);
   return transaction(check,async()=>{
    const old=id?await rawProvider(id):null;
    if(old&&(input.configVersion!==old.configVersion))return fail('SSO-Einstellungen wurden inzwischen geändert. Bitte neu laden.',409);
    if(old&&(old.issuer!==value.issuer||old.clientId!==value.clientId||old.type!==value.type))return fail('Issuer und Client-ID sind unveränderlich. Bitte einen neuen Anbieter anlegen.');
    if(!old&&(await db.query('SELECT COUNT(*) AS n FROM sso_providers')).rows[0].n>=20)return fail('Höchstens 20 SSO-Anbieter sind möglich.');
    const key=id??randomUUID();let secretEnc=old?.secretEnc??'';
    if(value.clientSecret){const any=(await db.query("SELECT 1 FROM sso_providers WHERE secretEnc<>'' LIMIT 1")).rowCount>0;secretEnc=secrets.encrypt('oidc',key,value.clientSecret,!any);}
    if(value.active&&!secretEnc)return fail('Bitte ein Client-Secret hinterlegen.');
    const securityChange=old&&(old.active!==Number(value.active)||old.authMethod!==value.authMethod||old.allowedOrigins!==JSON.stringify(value.allowedOrigins)||old.secretEnc!==secretEnc);
    if(securityChange)await revoke(await linked(key));
    await db.query('INSERT INTO sso_providers(id,label,type,issuer,clientId,secretEnc,authMethod,allowedOrigins,active,configVersion,createdAt,updatedAt) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(id) DO UPDATE SET label=excluded.label,secretEnc=excluded.secretEnc,authMethod=excluded.authMethod,allowedOrigins=excluded.allowedOrigins,active=excluded.active,configVersion=excluded.configVersion,updatedAt=excluded.updatedAt',[key,value.label,value.type,value.issuer,value.clientId,secretEnc,value.authMethod,JSON.stringify(value.allowedOrigins),Number(value.active),(old?.configVersion??0)+1,old?.createdAt??at(),at()]);
    await record(old?'ssoProviderUpdate':'ssoProviderCreate',key,{name:value.label,active:value.active});return visible(await rawProvider(key));
   });
  },
  async prune(){await db.query('DELETE FROM sso_access_requests WHERE expiresAt<=$1',[now()]);},
  async requests(){return (await db.query('SELECT r.*,p.label AS providerLabel FROM sso_access_requests r JOIN sso_providers p ON p.id=r.providerId WHERE r.expiresAt>$1 ORDER BY r.createdAt,r.id',[now()])).rows;},
  async requestAccess(providerId:string,claims:any){
   return transaction(()=>{},async()=>{const provider=await getProvider(providerId),who=identity(claims,provider.issuer);
    await db.query('DELETE FROM sso_access_requests WHERE expiresAt<=$1',[now()]);
    const old=(await db.query('SELECT * FROM sso_access_requests WHERE providerId=$1 AND issuer=$2 AND subject=$3',[providerId,who.issuer,who.subject])).rows[0];if(old)return old;
    if((await db.query('SELECT COUNT(*) AS n FROM sso_access_requests')).rows[0].n>=1000)return fail('SSO-Anfrage konnte nicht angenommen werden. Bitte Administrator kontaktieren.',429);
    const row={id:randomUUID(),providerId,...who,displayName:typeof claims.name==='string'?claims.name.replace(/[\x00-\x1f\x7f]/g,'').slice(0,100):'',email:typeof claims.email==='string'?claims.email.replace(/[\x00-\x1f\x7f]/g,'').slice(0,254):'',status:'pending',revision:1,expiresAt:now()+7*86400000,createdAt:at()};
    await db.query('INSERT INTO sso_access_requests(id,providerId,issuer,subject,displayName,email,status,revision,expiresAt,createdAt) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',Object.values(row));return row;
   });
  },
  async resolveIdentity(providerId:string,claims:any){
   const provider=await getProvider(providerId),who=identity(claims,provider.issuer);
   const row=(await db.query('SELECT u.* FROM users u JOIN sso_identities i ON i.userId=u.id WHERE i.providerId=$1 AND i.issuer=$2 AND i.subject=$3 AND u.active=1 AND u.deletedAt IS NULL',[providerId,who.issuer,who.subject])).rows[0];return row??null;
  },
  async decide(id:string,input:any,check:()=>any=()=>{}){
   if(typeof input.approve!=='boolean'||!Number.isSafeInteger(input.revision)||input.approve&&(!Number.isSafeInteger(input.userId)||input.userId<1))return fail();
   return transaction(check,async()=>{
    const row=(await db.query('SELECT * FROM sso_access_requests WHERE id=$1 FOR UPDATE',[id])).rows[0];
    if(!row||row.status!=='pending'||row.expiresAt<=now()||row.revision!==input.revision)return fail('SSO-Anfrage wurde inzwischen geändert. Bitte neu laden.',409);
    await getProvider(row.providerId);
    if(input.approve){
     if(!(await db.query('SELECT 1 FROM users WHERE id=$1 AND active=1 AND deletedAt IS NULL',[input.userId])).rowCount)return fail('Konto ist nicht verfügbar.',409);
     if((await db.query('SELECT 1 FROM sso_identities WHERE providerId=$1 AND issuer=$2 AND subject=$3',[row.providerId,row.issuer,row.subject])).rowCount)return fail('SSO-Identität ist bereits verknüpft.',409);
     await db.query('INSERT INTO sso_identities(id,providerId,issuer,subject,userId,createdAt) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),row.providerId,row.issuer,row.subject,input.userId,at()]);
     await db.query('DELETE FROM sso_access_requests WHERE id=$1',[id]);
    }else await db.query("UPDATE sso_access_requests SET status='denied',revision=revision+1 WHERE id=$1",[id]);
    await record(input.approve?'ssoApprove':'ssoDeny',id,{assignedUserId:input.approve?input.userId:null});return {ok:true};
   });
  },
  async identities(userId?:number){return (await db.query('SELECT i.id,i.providerId,i.issuer,i.subject,i.userId,i.createdAt,p.label AS providerLabel,u.displayName,u.username FROM sso_identities i JOIN sso_providers p ON p.id=i.providerId JOIN users u ON u.id=i.userId WHERE u.deletedAt IS NULL'+(userId?' AND i.userId=$1':'')+' ORDER BY lower(p.label),u.username',userId?[userId]:[])).rows;},
  async unlink(id:string,check:()=>any=()=>{}){return transaction(check,async()=>{const row=(await db.query('SELECT userId FROM sso_identities WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!row)return fail('SSO-Verknüpfung nicht gefunden.',404);await revoke([row.userId]);await db.query('DELETE FROM sso_identities WHERE id=$1',[id]);await record('ssoUnlink',id,{assignedUserId:row.userId});return {ok:true};});}
 };
}
