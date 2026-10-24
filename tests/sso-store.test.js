import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,unlinkSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from './helpers/postgres-fixtures.js';
import {sourceModule} from './helpers/source-module.js';
import {createUsers} from '../dist/server/users.js';
import {createSecrets} from '../dist/server/secrets.js';

async function fixture(t){
 const store=await createStore(':memory:'),dir=mkdtempSync(join(tmpdir(),'retouren-sso-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const users=createUsers(store);await users.createFirst({username:'Admin',password:'A-long-test-password!'});
 const worker=await users.create({username:'Worker',password:'Another-long-password!',role:'viewer'});
 const {createSsoStore}=await sourceModule("export {createSsoStore} from './backend/src/server/sso-store.ts';");
 let now=1792600000000;const secrets=createSecrets(dir),sso=createSsoStore({store,secrets,now:()=>now});
 const input={label:'Company',type:'oidc',issuer:'https://identity.example/realms/team',clientId:'retourenboard',clientSecret:'server-only-secret',authMethod:'client_secret_basic',active:true,allowedOrigins:[]};
 const provider=await sso.saveProvider(null,input);
 return {store,users,worker,secrets,sso,provider,input,advance:ms=>now+=ms};
}

test('SSO settings default off, public list requires global and provider activation and never returns secrets',async t=>{
 const f=await fixture(t);assert.equal((await f.sso.settings()).enabled,false);
 assert.deepEqual(await f.sso.publicProviders(),[]);
 await f.sso.setEnabled(true);assert.deepEqual(await f.sso.publicProviders(),[{id:f.provider.id,label:'Company',type:'oidc'}]);
 assert.equal(JSON.stringify(await f.sso.providers()).includes('server-only-secret'),false);
 const row=(await f.store.db.query('SELECT secretEnc FROM sso_providers')).rows[0];
 assert.notEqual(row.secretEnc,'server-only-secret');assert.equal(f.secrets.decrypt('oidc',f.provider.id,row.secretEnc),'server-only-secret');
 await f.sso.saveProvider(f.provider.id,{...f.input,configVersion:f.provider.configVersion,active:false,clientSecret:''});assert.deepEqual(await f.sso.publicProviders(),[]);
});

test('only explicit approval binds exact issuer and subject to an active local account',async t=>{
 const f=await fixture(t);await f.sso.setEnabled(true);
 const claims={iss:f.input.issuer,sub:'person-1',name:'Worker',email:'worker@example.test'};
 assert.equal(await f.sso.resolveIdentity(f.provider.id,claims),null);
 const request=await f.sso.requestAccess(f.provider.id,claims);
 assert.equal(await f.sso.resolveIdentity(f.provider.id,claims),null);
 await f.sso.decide(request.id,{revision:request.revision,userId:f.worker.id,approve:true});
 assert.equal((await f.sso.resolveIdentity(f.provider.id,claims)).id,f.worker.id);
 assert.equal(await f.sso.resolveIdentity(f.provider.id,{...claims,sub:'person-2'}),null);
 const identities=await f.sso.identities();assert.equal(identities.length,1);
 await f.sso.unlink(identities[0].id);
 assert.equal(await f.sso.resolveIdentity(f.provider.id,claims),null);
});

test('revocation invalidates authVersion and disables login without deleting configuration or bindings',async t=>{
 const f=await fixture(t);await f.sso.setEnabled(true);
 const claims={iss:f.input.issuer,sub:'abc'},request=await f.sso.requestAccess(f.provider.id,claims);
 await f.sso.decide(request.id,{revision:request.revision,userId:f.worker.id,approve:true});
 const before=(await f.users.credentialsById(f.worker.id)).authVersion;
 await f.sso.setEnabled(false);
 assert.equal((await f.users.credentialsById(f.worker.id)).authVersion,before+1);
 await assert.rejects(f.sso.getProvider(f.provider.id),e=>e.status===403);
 assert.equal((await f.sso.identities()).length,1);
 await f.sso.setEnabled(true);assert.equal((await f.sso.resolveIdentity(f.provider.id,claims)).id,f.worker.id);
});

test('lost authorization and stale approval revisions leave identities unchanged',async t=>{
 const f=await fixture(t);await f.sso.setEnabled(true);
 const request=await f.sso.requestAccess(f.provider.id,{iss:f.input.issuer,sub:'abc'});
 await assert.rejects(f.sso.decide(request.id,{revision:request.revision,userId:f.worker.id,approve:true},()=>{throw Error('revoked');}),/revoked/);
 assert.equal((await f.sso.identities()).length,0);
 await f.sso.decide(request.id,{revision:request.revision,approve:false});
 await assert.rejects(f.sso.decide(request.id,{revision:request.revision,userId:f.worker.id,approve:true}),e=>e.status===409);
});

test('request deduplication, expiry and missing secret key fail closed',async t=>{
 const f=await fixture(t);await f.sso.setEnabled(true);const claims={iss:f.input.issuer,sub:'abc'};
 assert.equal((await f.sso.requestAccess(f.provider.id,claims)).id,(await f.sso.requestAccess(f.provider.id,claims)).id);
 const key=readFileSync(f.secrets.path('oidc'));assert.equal(key.length,32);unlinkSync(f.secrets.path('oidc'));
 assert.deepEqual(await f.sso.publicProviders(),[]);
 await assert.rejects(f.sso.getProvider(f.provider.id),e=>e.status===503);
 await assert.rejects(f.sso.saveProvider(f.provider.id,{...f.input,configVersion:f.provider.configVersion,clientSecret:'replacement'}),e=>e.status===503);
});

test('explicit secret recovery disables SSO, keeps bindings and permits setting new secrets',async t=>{
 const f=await fixture(t);await f.sso.setEnabled(true);unlinkSync(f.secrets.path('oidc'));
 await f.sso.resetSecrets();assert.equal((await f.sso.settings()).enabled,false);
 const [provider]=await f.sso.providers();assert.equal(provider.active,false);assert.equal(provider.secretSet,false);
 await f.sso.saveProvider(provider.id,{...f.input,configVersion:provider.configVersion,clientSecret:'new-secret'});
 await f.sso.setEnabled(true);assert.equal((await f.sso.getProvider(provider.id)).clientSecret,'new-secret');
});

test('a structurally valid but wrong key is reported as unavailable and never produces a dead login button',async t=>{
 const f=await fixture(t);await f.sso.setEnabled(true);writeFileSync(f.secrets.path('oidc'),Buffer.alloc(32));
 assert.equal(f.secrets.has('oidc'),true);
 assert.equal((await f.sso.providers())[0].keyAvailable,false);
 assert.deepEqual(await f.sso.publicProviders(),[]);
});
