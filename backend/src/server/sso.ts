import {randomBytes,createHash} from 'node:crypto';
import * as client from '../vendor/oidc.js';
import {InputError} from '../shared/model.js';
import {safeReturnPath} from '../shared/auth-navigation.js';
import {createSsoNetwork} from './sso-network.js';

type Browser={browserToken:string;origin:string;ip:string};
type Context={providerId:string;origin:string;ip:string;returnTo:string;expiresAt:number;version:number;globalVersion:number;cancelled?:boolean};
const random=()=>randomBytes(32).toString('hex'),digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const expired=():never=>{throw new InputError('SSO-Anmeldung ist abgelaufen oder ungültig. Bitte erneut starten.',401);};
export function createSso({accounts,auth,mfa,now=Date.now,allowLoopback=false,fetcher=fetch}:{accounts:any;auth:any;mfa:any;now?:()=>number;allowLoopback?:boolean;fetcher?:typeof fetch}){
 const network=createSsoNetwork({allowLoopback,fetcher});
 const configuration=async(provider:any)=>{try{return await network.configuration(provider);}catch(error){if(error instanceof InputError)throw error;throw new InputError('SSO-Anbieter ist nicht erreichbar oder fehlerhaft eingerichtet.',503);}};
 const transactions=new Map<string,Context&{state:string;nonce:string;verifier:string;callback:string}>();
 const completions=new Map<string,Context&{claims:any}>(),attempts=new Map<string,{count:number;expiresAt:number}>();
 const inflight=new Map<string,Context>(),challenges=new Map<string,{browserHash:string;expiresAt:number;context:Context}>(),issued=new Map<string,{context:Context;token:string;expiresAt:number}>();
 function prune(){for(const map of [transactions,completions,attempts,inflight,challenges,issued])for(const [key,item]of map)if(item.expiresAt<=now())map.delete(key);}
 function reserve(ip:string){prune();const old=attempts.get(ip)??{count:0,expiresAt:now()+900000};if(++old.count>30)throw new InputError('Zu viele SSO-Anmeldeversuche. Bitte später erneut versuchen.',429);attempts.set(ip,old);if(attempts.size>10000)attempts.delete(attempts.keys().next().value!);}
 async function providerFor(context:Context){if(context.cancelled)expired();const p=await accounts.getProvider(context.providerId);if(context.cancelled||p.configVersion!==context.version||p.globalVersion!==context.globalVersion)expired();return p;}
 function take<T extends Context>(map:Map<string,T>,browser:Browser){
  prune();if(typeof browser.browserToken!=='string'||! /^[a-f0-9]{64}$/.test(browser.browserToken))expired();
  const key=digest(browser.browserToken),item=map.get(key);if(!item||item.origin!==browser.origin||item.ip!==browser.ip)return expired();map.delete(key);return item;
 }
 async function use<T extends Context,R>(map:Map<string,T>,browser:Browser,job:(item:T)=>Promise<R>):Promise<R>{
  const key=digest(browser.browserToken),item=take(map,browser);if(inflight.size>=1000)expired();inflight.set(key,item);
  try{return await job(item);}finally{if(inflight.get(key)===item)inflight.delete(key);}
 }
 function invalidate(browserToken?:string){
  if(browserToken!==undefined&&!/^[a-f0-9]{64}$/.test(browserToken))return;
  const key=browserToken===undefined?null:digest(browserToken);
  for(const map of [transactions,completions,inflight])for(const [id,context]of map)if(!key||id===key){context.cancelled=true;map.delete(id);}
  for(const [id,challenge]of challenges)if(!key||challenge.browserHash===key){challenge.context.cancelled=true;mfa.cancelChallenge(id);challenges.delete(id);}
  for(const [id,session]of issued)if(!key||id===key){session.context.cancelled=true;auth.logout(session.token);issued.delete(id);}
  if(!key)network.clear();
 }
 function rememberSession(key:string,context:Context,token:string){
  prune();issued.set(key,{context,token,expiresAt:now()+300000});
  while(issued.size>1000){const first=issued.keys().next().value!,entry=issued.get(first)!;entry.context.cancelled=true;auth.logout(entry.token);issued.delete(first);}
 }
 return {
  invalidate,
  checkpoint(browserToken:string){const key=digest(browserToken),context=inflight.get(key)??completions.get(key)??issued.get(key)?.context;return ()=>{if(context?.cancelled)expired();};},
  challengeCheckpoint(id:string,browserToken:string){const pending=challenges.get(id);if(pending&&pending.browserHash!==digest(browserToken))expired();return ()=>{if(pending?.context.cancelled||pending&&pending.expiresAt<=now())expired();};},
  registerChallengeSession(id:string,login:any){const pending=challenges.get(id);if(!pending)return;if(pending.context.cancelled){auth.logout(login.token);expired();}rememberSession(pending.browserHash,pending.context,login.token);},
  async inspect(provider:any){await configuration({...provider,globalVersion:0});return {ok:true};},
  async start({providerId,returnTo,origin,ip,previousToken}:{providerId:string;returnTo:unknown;origin:string;ip:string;previousToken?:string}){
   reserve(ip);if(previousToken)invalidate(previousToken);
   if(transactions.size>=1000||inflight.size>=1000)throw new InputError('SSO ist momentan ausgelastet. Bitte erneut versuchen.',429);
   const browserToken=previousToken&&/^[a-f0-9]{64}$/.test(previousToken)?previousToken:random(),key=digest(browserToken),intent:Context={providerId,origin,ip,returnTo:safeReturnPath(returnTo),expiresAt:now()+300000,version:0,globalVersion:0};inflight.set(key,intent);
   try{
    const provider=await accounts.getProvider(providerId),config=await configuration(provider);if(intent.cancelled)expired();
    intent.version=provider.configVersion;intent.globalVersion=provider.globalVersion;
    const state=client.randomState(),nonce=client.randomNonce(),verifier=client.randomPKCECodeVerifier(),callback=`${origin}/api/sso/callback/${providerId}`;
    const url=client.buildAuthorizationUrl(config,{redirect_uri:callback,response_type:'code',response_mode:'query',scope:'openid profile email',state,nonce,code_challenge:await client.calculatePKCECodeChallenge(verifier),code_challenge_method:'S256'});
    await providerFor(intent);transactions.set(key,{...intent,state,nonce,verifier,callback});return {authorizationUrl:url.href,browserToken};
   }finally{if(inflight.get(key)===intent)inflight.delete(key);}
  },
  async callback({providerId,url,...browser}:Browser&{providerId:string;url:URL}){
   return use(transactions,browser,async tx=>{
   if(tx.providerId!==providerId||url.origin!==browser.origin||url.pathname!==new URL(tx.callback).pathname||url.href.length>10000)expired();
   for(const key of url.searchParams.keys())if(url.searchParams.getAll(key).length!==1)expired();
   if(url.searchParams.get('state')!==tx.state)expired();
   if(url.searchParams.has('error'))throw new InputError('SSO-Anmeldung wurde abgebrochen. Bitte erneut versuchen.',401);
   if(!url.searchParams.get('code')||url.hash)expired();
   const provider=await providerFor(tx);
   let claims:any;
   try{
    const config=await network.configuration(provider),tokens=await client.authorizationCodeGrant(config,url,{pkceCodeVerifier:tx.verifier,expectedState:tx.state,expectedNonce:tx.nonce,idTokenExpected:true});
    const verified=tokens.claims();if(!verified?.sub||verified.iss!==provider.issuer)return expired();
    claims={iss:verified.iss,sub:verified.sub,name:verified.name,email:verified.email};
   }catch{throw new InputError('SSO-Anmeldung konnte nicht sicher bestätigt werden. Bitte erneut versuchen.',401);}
   await providerFor(tx);
   prune();if(completions.size>=1000)expired();const browserToken=browser.browserToken;
   completions.set(digest(browserToken),{...tx,claims,expiresAt:now()+120000});
   return {browserToken,returnTo:tx.returnTo};
   });
  },
  async complete({accessScope,userAgent='',...browser}:Browser&{accessScope:string;userAgent?:string}){
   return use(completions,browser,async receipt=>{await providerFor(receipt);
   const account=await accounts.resolveIdentity(receipt.providerId,receipt.claims);
   if(!account){await accounts.requestAccess(receipt.providerId,receipt.claims);return {pending:true,returnTo:receipt.returnTo};}
   if(await mfa.needed(account.id)){
    const challenge=await mfa.beginChallenge(account.id,browser.ip,account.authVersion);
    try{await providerFor(receipt);}catch(error){mfa.cancelChallenge(challenge.challengeId);throw error;}
    challenges.set(challenge.challengeId,{browserHash:digest(browser.browserToken),expiresAt:now()+300000,context:receipt});
    if(challenges.size>1000){const first=challenges.keys().next().value!;challenges.get(first)!.context.cancelled=true;mfa.cancelChallenge(first);challenges.delete(first);}
    return {...challenge,returnTo:receipt.returnTo};
   }
   await providerFor(receipt);
   const login=await auth.startSession(account.id,{expectedAuthVersion:account.authVersion,userAgent,accessScope});
   if(receipt.cancelled){auth.logout(login.token);expired();}
   rememberSession(digest(browser.browserToken),receipt,login.token);
   return {...login,returnTo:receipt.returnTo};
   });
  }
 };
}
