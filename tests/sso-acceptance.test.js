import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import {runtimeFixture,testPassword} from './helpers/runtime.js';
import {oidcProvider} from './helpers/oidc-provider.js';
import {enableMfa} from './helpers/mfa.js';

async function fixture(t,options={}){
 const idp=await oidcProvider(t),f=await runtimeFixture(t,{ssoAllowLoopback:true,...options}),{auth}=await f.setup();idp.state.authMethod='client_secret_post';
 const made=await f.request('/api/users','POST',{username:'Worker',password:testPassword,role:'viewer',displayName:'Worker Demo'},auth);assert.equal(made.status,201);const user=await made.json();
 const input={type:'oidc',label:'Acceptance',issuer:idp.issuer,clientId:'test-client',clientSecret:'server-secret',authMethod:'client_secret_post',active:true,allowedOrigins:[],password:testPassword};
 const response=await f.request('/api/admin/sso/providers','POST',input,auth);assert.equal(response.status,201);const provider=await response.json();
 assert.equal((await f.request('/api/admin/sso','PUT',{enabled:true,revision:1,password:testPassword},auth)).status,200);
 const begin=async(returnTo='/#returns')=>{const r=await f.request('/api/sso/start','POST',{providerId:provider.id,returnTo});assert.equal(r.status,200);return {cookie:r.headers.getSetCookie()[0].split(';')[0],...(await r.json())};};
 const callback=async start=>fetch(await idp.authorize(start.authorizationUrl),{redirect:'manual',headers:{Cookie:start.cookie}});
 const complete=async receipt=>f.request('/api/sso/complete','POST',{}, {Cookie:receipt.headers.getSetCookie()[0].split(';')[0]});
 const login=async()=>{const start=await begin(),receipt=await callback(start);assert.match(receipt.headers.get('location'),/sso=complete/);return complete(receipt);};
 const snapshot=async()=>{const r=await f.request('/api/admin/sso','GET',undefined,auth);assert.equal(r.status,200);return r.json();};
 const approve=async()=>{const pending=await login();assert.equal((await pending.json()).pending,true);const s=await snapshot(),request=s.requests.find(r=>r.status==='pending');assert.ok(request);assert.equal((await f.request('/api/admin/sso/requests/'+request.id,'POST',{revision:request.revision,approve:true,userId:user.id,password:testPassword},auth)).status,200);};
 const deactivate=async()=>{const r=await f.request('/api/admin/sso/providers/'+provider.id,'PUT',{...input,active:false,configVersion:provider.configVersion},auth);assert.equal(r.status,200);};
 return {...f,localLogin:f.login,idp,auth,user,input,provider,begin,callback,complete,login,snapshot,approve,deactivate};
}

test('client_secret_post login preserves viewer permissions and normal logout',async t=>{
 const f=await fixture(t);await f.approve();const result=await f.login(),data=await result.json();assert.equal(result.status,200);assert.equal(data.user.id,f.user.id);assert.equal(data.user.role,'viewer');
 const auth={Cookie:result.headers.getSetCookie().find(c=>c.startsWith('retouren_session=')).split(';')[0],'X-CSRF-Token':data.csrfToken};assert.match(auth.Cookie,/session=/);assert.equal((await f.request('/api/admin/sso','GET',undefined,auth)).status,403);
 assert.equal((await f.request('/api/logout','POST',{},auth)).status,200);assert.equal((await(await f.request('/api/session','GET',undefined,auth)).json()).unlocked,false);
});
test('provider deactivation between start and callback rejects the callback',async t=>{
 const f=await fixture(t),start=await f.begin();await f.deactivate();const receipt=await f.callback(start);assert.equal(receipt.headers.get('location'),'/login?sso=error');assert.equal((await f.snapshot()).requests.length,0);
});
test('provider deactivation after callback rejects completion and creates no request',async t=>{
 const f=await fixture(t),receipt=await f.callback(await f.begin());await f.deactivate();const result=await f.complete(receipt);assert.equal(result.status,403);assert.equal((await f.snapshot()).requests.length,0);
});
test('SSO MFA rejects a different browser without consuming the valid recovery code',async t=>{
 const f=await fixture(t);await f.approve();const mfa=await enableMfa(f,(await f.localLogin('Worker')).auth,Date.now());
 const receipt=await f.login(),challenge=await receipt.json();assert.equal(challenge.mfaRequired,true);const code=mfa.recoveryCodes[0],body={challengeId:challenge.challengeId,code};
 assert.equal((await f.request('/api/login/mfa','POST',body)).status,401);
 const result=await f.request('/api/login/mfa','POST',body,{Cookie:receipt.headers.getSetCookie()[0].split(';')[0]});assert.equal(result.status,200);assert.equal((await result.json()).user.id,f.user.id);
 assert.equal((await f.request('/api/login/mfa','POST',body,{Cookie:receipt.headers.getSetCookie()[0].split(';')[0]})).status,401);
});
test('denied external identity stays unapproved and does not duplicate access requests',async t=>{
 const f=await fixture(t);assert.equal((await(await f.login()).json()).pending,true);const {requests}=await f.snapshot(),request=requests[0];
 assert.equal((await f.request('/api/admin/sso/requests/'+request.id,'POST',{revision:request.revision,approve:false,password:testPassword},f.auth)).status,200);
 const result=await f.login(),body=await result.json();assert.equal(body.pending,true);assert.equal(body.token,undefined);assert.equal(result.headers.getSetCookie().some(c=>/session=/.test(c)),false);
 const again=await f.snapshot();assert.equal(again.requests.length,1);assert.equal(again.requests[0].status,'denied');
});
test('same subject and email at another issuer never inherit an existing approval',async t=>{
 const f=await fixture(t);await f.approve();const second=await oidcProvider(t),made=await f.request('/api/admin/sso/providers','POST',{...f.input,label:'Other issuer',issuer:second.issuer},f.auth);assert.equal(made.status,201);const provider=await made.json();
 const start=await f.request('/api/sso/start','POST',{providerId:provider.id});assert.equal(start.status,200);const cookie=start.headers.getSetCookie()[0].split(';')[0],url=await second.authorize((await start.json()).authorizationUrl);
 const receipt=await fetch(url,{redirect:'manual',headers:{Cookie:cookie}}),result=await f.complete(receipt);assert.equal((await result.json()).pending,true);const snapshot=await f.snapshot();assert.equal(snapshot.identities.length,1);assert.equal(snapshot.requests.length,1);assert.equal(snapshot.requests[0].issuer,second.issuer);
});
test('wrong client secret fails without granting a session or leaking the secret',async t=>{
 const f=await fixture(t),changed=await f.request('/api/admin/sso/providers/'+f.provider.id,'PUT',{...f.input,configVersion:f.provider.configVersion,clientSecret:'deliberately-wrong-secret'},f.auth);assert.equal(changed.status,200);
 const receipt=await f.callback(await f.begin());assert.equal(receipt.headers.get('location'),'/login?sso=error');assert.doesNotMatch(await receipt.text(),/deliberately-wrong-secret|server-secret/);assert.equal((await f.snapshot()).requests.length,0);
});
test('expired authorization transaction fails closed',async t=>{
 let time=Date.now();const f=await fixture(t,{now:()=>time}),start=await f.begin();time+=301000;const receipt=await f.callback(start);assert.equal(receipt.headers.get('location'),'/login?sso=error');
});
test('external return target never leaves the application and duplicate parameters are rejected',async t=>{
 const f=await fixture(t);await f.approve();const start=await f.begin('https://external.example/steal'),receipt=await f.callback(start),location=receipt.headers.get('location');assert.match(location,/^\/login\?/);const returnTo=new URL(location,f.base).searchParams.get('returnTo');assert.equal(returnTo,'/#overview');
 const completed=await f.complete(receipt);assert.equal(completed.status,200);assert.equal((await completed.json()).returnTo,'/#overview');
 const duplicate=await f.begin(),url=await f.idp.authorize(duplicate.authorizationUrl);url.searchParams.append('state','extra');const failure=await fetch(url,{redirect:'manual',headers:{Cookie:duplicate.cookie}});assert.equal(failure.headers.get('location'),'/login?sso=error');
});
test('malformed Microsoft issuer is a validation error rather than an internal server error',async t=>{
 const f=await runtimeFixture(t),{auth}=await f.setup();
 const response=await f.request('/api/admin/sso/providers','POST',{type:'microsoft',label:'Broken Microsoft',issuer:'not-a-url',clientId:'id',clientSecret:'secret',authMethod:'client_secret_post',active:false,allowedOrigins:[],password:testPassword},auth);
 assert.equal(response.status,400);assert.equal((await(await f.request('/api/admin/sso','GET',undefined,auth)).json()).providers.length,0);
});
