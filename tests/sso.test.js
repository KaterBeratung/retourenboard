import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import {runtimeFixture} from './helpers/runtime.js';
import {oidcProvider} from './helpers/oidc-provider.js';

async function fixture(t){
 const idp=await oidcProvider(t),f=await runtimeFixture(t,{ssoAllowLoopback:true});await f.setup();
 const {createSso}=await import('../dist/server/sso.js'),{createSsoStore}=await import('../dist/server/sso-store.js');
 const accounts=createSsoStore({store:f.app.store,secrets:f.app.secrets,allowLoopback:true,onRevoke:id=>f.app.mfa.invalidate(id)});
 const provider=await accounts.saveProvider(null,{type:'oidc',label:'Company',issuer:idp.issuer,clientId:'test-client',clientSecret:'server-secret',authMethod:'client_secret_basic',active:true,allowedOrigins:[]});
 await accounts.setEnabled(true);const sso=createSso({accounts,auth:f.app.auth,mfa:f.app.mfa,allowLoopback:true});
 const begin=()=>sso.start({providerId:provider.id,returnTo:'/#returns',origin:f.base,ip:'test'});
 const callback=async start=>sso.callback({providerId:provider.id,url:await idp.authorize(start.authorizationUrl),browserToken:start.browserToken,origin:f.base,ip:'test'});
 const complete=receipt=>sso.complete({browserToken:receipt.browserToken,origin:f.base,ip:'test',accessScope:'standard'});
 return {...f,idp,accounts,provider,sso,begin,callback,complete};
}

test('verified SSO requires approval, then reuses the approved account without name-based linking',async t=>{
 const f=await fixture(t);const first=await f.complete(await f.callback(await f.begin()));
 assert.equal(first.pending,true);assert.equal(first.token,undefined);
 const [request]=await f.accounts.requests(),user=(await f.app.users.list())[0];
 await f.accounts.decide(request.id,{revision:request.revision,approve:true,userId:user.id});
 const second=await f.complete(await f.callback(await f.begin()));
 assert.equal(second.user.id,user.id);assert.equal(second.returnTo,'/#returns');assert.ok(second.token);
 f.idp.state.subject='different-person';const unknown=await f.complete(await f.callback(await f.begin()));assert.equal(unknown.pending,true);
});

test('SSO rejects browser mismatch, duplicate callbacks and pending completion after global disable',async t=>{
 const f=await fixture(t),start=await f.begin(),url=await f.idp.authorize(start.authorizationUrl);
 await assert.rejects(f.sso.callback({providerId:f.provider.id,url,browserToken:'wrong',origin:f.base,ip:'test'}));
 const receipt=await f.sso.callback({providerId:f.provider.id,url,browserToken:start.browserToken,origin:f.base,ip:'test'});
 await assert.rejects(f.sso.callback({providerId:f.provider.id,url,browserToken:start.browserToken,origin:f.base,ip:'test'}));
 await f.accounts.setEnabled(false);await assert.rejects(f.complete(receipt),e=>e.status===403);
});

for(const [name,claims,badSignature] of [['issuer',{iss:'https://other.example'},false],['audience',{aud:'another-client'},false],['nonce',{nonce:'wrong'},false],['expiry',{exp:1},false],['signature',{},true]])test(`SSO refuses an invalid ${name}`,async t=>{
 const f=await fixture(t);Object.assign(f.idp.state,{claims,badSignature});await assert.rejects(f.callback(await f.begin()),e=>e.status===401);
});

test('SSO preserves existing local MFA and disabling SSO invalidates that pending challenge',async t=>{
 const f=await fixture(t),user=(await f.app.users.list())[0];await f.complete(await f.callback(await f.begin()));const [request]=await f.accounts.requests();await f.accounts.decide(request.id,{revision:request.revision,userId:user.id,approve:true});
 await f.app.mfa.reset(user.id);
 const result=await f.complete(await f.callback(await f.begin()));assert.equal(result.enrollmentRequired,true);assert.equal(result.token,undefined);
 await f.accounts.setEnabled(false);await assert.rejects(f.app.mfa.proofForEnrollment(result.challengeId,'test'));
});

test('browser cancellation also cancels SSO MFA and an in-flight session is never returned',async t=>{
 const f=await fixture(t),user=(await f.app.users.list())[0];await f.complete(await f.callback(await f.begin()));const [request]=await f.accounts.requests();await f.accounts.decide(request.id,{revision:request.revision,userId:user.id,approve:true});
 const receipt=await f.callback(await f.begin());let entered,resume;const started=new Promise(r=>entered=r),gate=new Promise(r=>resume=r),startSession=f.app.auth.startSession;
 f.app.auth.startSession=async(...args)=>{entered();await gate;return startSession(...args);};
 const completing=f.complete(receipt);await started;f.sso.invalidate(receipt.browserToken);resume();await assert.rejects(completing,e=>e.status===401);
 f.app.auth.startSession=startSession;await f.app.mfa.reset(user.id);
 const pendingReceipt=await f.callback(await f.begin()),challenge=await f.complete(pendingReceipt);f.sso.invalidate(pendingReceipt.browserToken);
 await assert.rejects(f.app.mfa.proofForEnrollment(challenge.challengeId,'test'));
});
