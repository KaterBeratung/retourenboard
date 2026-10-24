import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import {runtimeFixture,testPassword} from './helpers/runtime.js';
import {oidcProvider} from './helpers/oidc-provider.js';
import {enableMfa} from './helpers/mfa.js';

async function configured(t){
 const idp=await oidcProvider(t),f=await runtimeFixture(t,{ssoAllowLoopback:true}),{auth}=await f.setup();idp.state.authMethod='client_secret_basic';
 const user=await (await f.request('/api/users','POST',{username:'Worker',password:testPassword,role:'viewer'},auth)).json();
 const input={type:'oidc',label:'Company',issuer:idp.issuer,clientId:'test-client',clientSecret:'server-secret',authMethod:'client_secret_basic',active:true,allowedOrigins:[],password:testPassword};
 const response=await f.request('/api/admin/sso/providers','POST',input,auth);assert.equal(response.status,201);
 const provider=await response.json();assert.equal(provider.clientSecret,undefined);
 assert.equal((await f.request('/api/admin/sso','PUT',{enabled:true,revision:1,password:testPassword},auth)).status,200);
 const ssoLogin=async()=>{
  const start=await f.request('/api/sso/start','POST',{providerId:provider.id,returnTo:'/#returns'});assert.equal(start.status,200);
  const cookie=start.headers.getSetCookie()[0];assert.match(cookie,/HttpOnly; SameSite=Lax/);
  const location=await idp.authorize((await start.json()).authorizationUrl);
  const callback=await fetch(location,{redirect:'manual',headers:{Cookie:cookie.split(';')[0]}});assert.equal(callback.status,303);
  assert.match(callback.headers.get('location'),/sso=complete/);
  const complete=await f.request('/api/sso/complete','POST',{}, {Cookie:callback.headers.getSetCookie()[0].split(';')[0]});
  return complete;
 };
 return {...f,idp,auth,user,input,provider,ssoLogin};
}

test('SSO is disabled by default and its public provider list leaks no configuration',async t=>{
 const f=await runtimeFixture(t);
 const response=await f.request('/api/sso/providers');
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{enabled:false,providers:[]});
});

test('SSO login module is public, while its administrator module remains protected',async t=>{
 const f=await runtimeFixture(t);
 assert.equal((await fetch(f.base+'/sso-login.js')).status,200);
 assert.equal((await fetch(f.base+'/admin-sso.js')).status,401);
});

test('admin approval completes the browser-bound flow and issues the existing Strict session cookie',async t=>{
 const f=await configured(t),pending=await f.ssoLogin();assert.equal((await pending.json()).pending,true);
 const snapshot=await (await f.request('/api/admin/sso','GET',undefined,f.auth)).json();assert.equal(snapshot.requests.length,1);
 const request=snapshot.requests[0];
 const approval=await f.request('/api/admin/sso/requests/'+request.id,'POST',{revision:request.revision,approve:true,userId:f.user.id,password:testPassword},f.auth);assert.equal(approval.status,200);
 const result=await f.ssoLogin(),data=await result.json();assert.equal(result.status,200);assert.equal(data.user.id,f.user.id);assert.equal(data.user.role,'viewer');
 const sessionCookie=result.headers.getSetCookie().find(c=>c.startsWith('retouren_session='));assert.match(sessionCookie,/HttpOnly; SameSite=Strict/);
 const identity=await (await f.request('/api/account/sso','GET',undefined,{Cookie:sessionCookie.split(';')[0]})).json();assert.equal(identity[0].providerLabel,'Company');
 const disabled=await f.request('/api/admin/sso','PUT',{enabled:false,revision:snapshot.settings.revision,password:testPassword},f.auth);assert.equal(disabled.status,200);
 assert.equal((await f.request('/api/session','GET',undefined,{Cookie:sessionCookie.split(';')[0]})).status,200);
 assert.equal((await (await f.request('/api/session','GET',undefined,{Cookie:sessionCookie.split(';')[0]})).json()).unlocked,false);
 assert.equal((await f.login('Worker')).data.unlocked,true);
});

test('SSO admin writes require current administrator, CSRF, Origin and renewed credentials',async t=>{
 const f=await configured(t),worker=(await f.login('Worker')).auth;
 assert.equal((await f.request('/api/admin/sso','GET',undefined,worker)).status,403);
 const change={enabled:false,revision:2,password:testPassword};
 assert.equal((await f.request('/api/admin/sso','PUT',change,{'Cookie':f.auth.Cookie})).status,403);
 assert.equal((await f.request('/api/admin/sso','PUT',change,f.auth,{Origin:'https://foreign.example'})).status,403);
 assert.equal((await f.request('/api/admin/sso','PUT',{...change,password:'wrong'},f.auth)).status,401);
 assert.equal((await f.request('/api/sso/start','POST',{providerId:f.provider.id},{},{Origin:'https://foreign.example'})).status,403);
 const check=await f.request('/api/admin/sso/providers/check','POST',{...f.input,issuer:'http://169.254.169.254'},f.auth);assert.equal(check.status,400);
});

test('a local sign-in supersedes the browser SSO transaction even after local sign-out',async t=>{
 const f=await configured(t),start=await f.request('/api/sso/start','POST',{providerId:f.provider.id}),data=await start.json(),cookie=start.headers.getSetCookie()[0].split(';')[0];
 const local=await f.request('/api/login','POST',{username:'Worker',password:testPassword},{Cookie:cookie});assert.equal(local.status,200);
 const auth=f.authFrom(local,await local.json());assert.equal((await f.request('/api/logout','POST',{},auth)).status,200);
 const url=await f.idp.authorize(data.authorizationUrl),callback=await fetch(url,{redirect:'manual',headers:{Cookie:cookie}});
 assert.equal(callback.headers.get('location'),'/login?sso=error');
});

test('a callback or local login without this browser binding cannot cancel another browser SSO flow',async t=>{
 const f=await configured(t),start=await f.request('/api/sso/start','POST',{providerId:f.provider.id}),data=await start.json(),cookie=start.headers.getSetCookie()[0].split(';')[0];
 await fetch(f.base+'/api/sso/callback/'+f.provider.id+'?state=invalid&code=invalid',{redirect:'manual'});
 await f.login('Worker');
 const url=await f.idp.authorize(data.authorizationUrl),callback=await fetch(url,{redirect:'manual',headers:{Cookie:cookie}});
 assert.match(callback.headers.get('location'),/sso=complete/);
});

test('local sign-in cancels SSO while MFA session creation is already in progress',async t=>{
 const f=await configured(t);await f.ssoLogin();const [request]=(await (await f.request('/api/admin/sso','GET',undefined,f.auth)).json()).requests;
 await f.request('/api/admin/sso/requests/'+request.id,'POST',{approve:true,userId:f.user.id,revision:request.revision,password:testPassword},f.auth);
 const factor=await enableMfa(f,(await f.login('Worker')).auth,Date.now());
 const receipt=await f.ssoLogin(),challenge=await receipt.json(),binding=receipt.headers.getSetCookie()[0].split(';')[0];assert.equal(challenge.mfaRequired,true);
 let entered,resume;const started=new Promise(r=>entered=r),gate=new Promise(r=>resume=r),original=f.app.auth.startSession;
 f.app.auth.startSession=async(id,...args)=>{if(id===f.user.id){entered();await gate;}return original(id,...args);};
 const result=f.request('/api/login/mfa','POST',{challengeId:challenge.challengeId,code:factor.recoveryCodes[0]},{Cookie:binding});
 await started;assert.equal((await f.request('/api/login','POST',{username:'Admin',password:testPassword},{Cookie:binding})).status,200);resume();
 assert.equal((await result).status,401);
});

test('disabled SSO cannot start while local password login remains available',async t=>{
 const f=await runtimeFixture(t);await f.setup();
 const response=await f.request('/api/sso/start','POST',{providerId:'missing',returnTo:'/'});
 assert.equal(response.status,403);
 assert.equal((await f.login('Admin',testPassword)).data.unlocked,true);
});
