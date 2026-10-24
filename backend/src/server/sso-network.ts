import * as client from '../vendor/oidc.js';
import {ssoUrl} from './sso-store.js';
import {InputError} from '../shared/model.js';
import {createHash} from 'node:crypto';

export function createSsoNetwork({fetcher=fetch,allowLoopback=false}:{fetcher?:typeof fetch;allowLoopback?:boolean}={}){
 const cache=new Map<string,{version:string;expiresAt:number;config:client.Configuration}>();
 async function configuration(provider:any){
  const version=createHash('sha256').update(JSON.stringify([provider.configVersion,provider.globalVersion,provider.issuer,provider.clientId,provider.clientSecret,provider.authMethod,provider.allowedOrigins])).digest('hex'),old=cache.get(provider.id);
  if(old?.version===version&&old.expiresAt>Date.now())return old.config;
  const allowed=new Set([new URL(provider.issuer).origin,...provider.allowedOrigins]);
  const endpoint=(value:unknown)=>{const url=ssoUrl(value,allowLoopback);if(!allowed.has(url.origin))throw new InputError('SSO-Endpunkt benötigt eine zusätzliche Origin-Freigabe.',400);return url;};
  const request:client.CustomFetch=async(input,options)=>{
   const url=endpoint(input);
   const signal=AbortSignal.any([AbortSignal.timeout(10000),...(options?.signal?[options.signal]:[])]);
   const response=await fetcher(url,{...options,body:options?.body as BodyInit|undefined,redirect:'manual',signal});
   if(response.status>=300&&response.status<400){await response.body?.cancel();throw new Error('OIDC redirect refused');}
   if(Number(response.headers.get('content-length'))>1024*1024){await response.body?.cancel();throw new Error('OIDC response too large');}
   const reader=response.body?.getReader(),chunks:Uint8Array[]=[];let size=0;
   try{if(reader)for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1024*1024)throw new Error('OIDC response too large');chunks.push(value);}}
   finally{await reader?.cancel().catch(()=>{});}
   return new Response(Buffer.concat(chunks),{status:response.status,statusText:response.statusText,headers:response.headers});
  };
  const config=await client.discovery(new URL(provider.issuer),provider.clientId,{client_secret:provider.clientSecret,id_token_signed_response_alg:'RS256'},provider.authMethod==='client_secret_basic'?client.ClientSecretBasic(provider.clientSecret):client.ClientSecretPost(provider.clientSecret),{
   timeout:10,[client.customFetch]:request,
   execute:[client.enableNonRepudiationChecks,...(allowLoopback?[client.allowInsecureRequests]:[])]
  });
  const metadata=config.serverMetadata();
  if(metadata.issuer!==provider.issuer)throw new Error('OIDC issuer mismatch');
  for(const key of ['authorization_endpoint','token_endpoint','jwks_uri'] as const)endpoint(metadata[key]);
  cache.set(provider.id,{version,expiresAt:Date.now()+600000,config});
  if(cache.size>20)cache.delete(cache.keys().next().value!);
  return config;
 }
 return {configuration,clear:()=>cache.clear()};
}
