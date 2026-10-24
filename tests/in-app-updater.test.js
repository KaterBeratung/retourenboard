import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {create as archive} from '../dist/vendor/archive.js';
import {createUpdateWorker} from '../dist/server/update-worker.js';
import {validateUpdatePackage} from '../dist/server/update-package.js';
import {downloadUpdate} from '../dist/server/update-download.js';
import {runtimeFixture,testPassword} from './helpers/runtime.js';
import {enableMfa} from './helpers/mfa.js';

function folder(t){const dir=mkdtempSync(join(tmpdir(),'retourenboard-updater-test-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));return dir;}
function adapter(extra={}){const calls=[];return {calls,installed:()=> '3.1.0',lock(){calls.push('lock');},unlock(){calls.push('unlock');},prepare:async()=>calls.push('prepare'),snapshot:async()=>calls.push('snapshot'),activate:async()=>calls.push('activate'),restart:async()=>calls.push('restart'),commit:async()=>calls.push('commit'),rollback:async()=>{calls.push('rollback');return true;},...extra};}
test('updater has one active job and commits only after download, validation, snapshot and healthy restart',async()=>{
  const env=adapter();let finish;const worker=createUpdateWorker({adapter:env,download:async()=>new Promise(resolve=>finish=resolve),saveState:()=>{}}),id=randomUUID();
  assert.equal(worker.start({id,version:'3.2.0'}).state,'queued');assert.throws(()=>worker.start({id:randomUUID(),version:'3.2.0'}),/bereits/);
  finish('archive');await worker.wait();assert.equal(worker.status().state,'complete');assert.deepEqual(env.calls,['lock','prepare','snapshot','activate','restart','commit','unlock']);
});
test('failed activation rolls back the prior code and data and records a failed update',async()=>{
  const env=adapter({restart:async()=>{env.calls.push('restart');throw new Error('internal failure');}}),worker=createUpdateWorker({adapter:env,download:async()=> 'archive',saveState:()=>{}});
  worker.start({id:randomUUID(),version:'3.2.0'});await worker.wait();assert.equal(worker.status().state,'failed');assert.equal(worker.status().rolledBack,true);assert.doesNotMatch(worker.status().message,/internal failure/);assert.deepEqual(env.calls,['lock','prepare','snapshot','activate','restart','rollback','unlock']);
});
test('download failure never activates a release, and a failed rollback keeps maintenance locked',async()=>{
  const env=adapter(),worker=createUpdateWorker({adapter:env,download:async()=>{throw Error('offline');},saveState:()=>{}});worker.start({id:randomUUID(),version:'3.2.0'});await worker.wait();assert.deepEqual(env.calls,['lock','rollback','unlock']);
  const broken=adapter({rollback:async()=>{throw Error('rollback failed');}}),other=createUpdateWorker({adapter:broken,download:async()=>{throw Error('offline');},saveState:()=>{}});other.start({id:randomUUID(),version:'3.2.0'});await other.wait();assert.equal(other.status().recoveryRequired,true);assert.ok(!broken.calls.includes('unlock'));assert.throws(()=>other.start({id:randomUUID(),version:'3.2.0'}),/Wiederherstellung/);
});

test('a failed download permits a fresh job after cleanup and releases its maintenance lock',async()=>{
  let attempts=0;const env=adapter(),worker=createUpdateWorker({adapter:env,download:async()=>{if(++attempts===1)throw Error('offline');return 'archive';},saveState:()=>{}});
  worker.start({id:randomUUID(),version:'3.2.0'});await worker.wait();assert.equal(worker.status().state,'failed');
  const id=randomUUID();worker.start({id,version:'3.2.0'});await worker.wait();
  assert.equal(worker.status().id,id);assert.equal(worker.status().state,'complete');assert.equal(env.calls.filter(call=>call==='unlock').length,2);
});
test('invalid job IDs, equal versions and downgrades cannot enter the worker',()=>{
  const env=adapter(),worker=createUpdateWorker({adapter:env,download:async()=> 'archive',saveState:()=>{}});
  for(const input of [{id:'../../etc/passwd',version:'3.2.0'},{id:randomUUID(),version:'3.1.0'},{id:randomUUID(),version:'3.0.0'},{id:randomUUID(),version:'3.2.0-beta'}])assert.throws(()=>worker.start(input));assert.deepEqual(env.calls,[]);
});

test('update download accepts only the requested latest stable release and verifies its SHA256',async t=>{
  const dir=folder(t),bytes=Buffer.from('verified archive'),name='retourenboard-linux-3.2.0.tar.gz',digest=createHash('sha256').update(bytes).digest('hex'),requests=[];
  const fetcher=async(url,options)=>{requests.push(url);assert.equal(options.redirect,'manual');assert.ok(options.signal);if(url.includes('/releases/latest'))return new Response(JSON.stringify({tag_name:'v3.2.0',draft:false,prerelease:false,assets:[{name},{name:name+'.sha256'}]}));return new Response(url.endsWith('.sha256')?digest+'  '+name+'\n':bytes);};
  assert.deepEqual(readFileSync(await downloadUpdate('3.2.0',dir,{fetcher})),bytes);assert.equal(requests.length,3);assert.ok(requests.every(url=>url.startsWith('https://api.github.com/repos/KaterBeratung/retourenboard/')||url.startsWith('https://github.com/KaterBeratung/retourenboard/releases/download/v3.2.0/')));
  await assert.rejects(downloadUpdate('3.3.0',dir,{fetcher}),/neueste/);
  await assert.rejects(downloadUpdate('3.2.0',dir,{fetcher:async(url,options)=>url.endsWith('.sha256')?new Response('0'.repeat(64)+'  '+name):fetcher(url,options)}),/Prüfsumme/);
});
test('release downloads reject redirected non-GitHub hosts and oversized responses',async t=>{
  const dir=folder(t);await assert.rejects(downloadUpdate('3.2.0',dir,{fetcher:async()=>new Response('',{status:302,headers:{location:'http://127.0.0.1/private'}})}),/Weiterleitung/);
  await assert.rejects(downloadUpdate('3.2.0',dir,{fetcher:async()=>new Response('x'.repeat(150000))}),/groß/);
});

async function packageFixture(t,extra){const dir=folder(t),source=join(dir,'source');mkdirSync(join(source,'dist/server'),{recursive:true});mkdirSync(join(source,'dist/public'),{recursive:true});mkdirSync(join(source,'deploy'));
  for(const name of ['package.json','dist/package.json'])writeFileSync(join(source,name),JSON.stringify({name:'retourenboard',version:'3.2.0',type:'module',engines:{node:'>=22.16.0'}}));
  writeFileSync(join(source,'dist/server/index.js'),'export {};');writeFileSync(join(source,'dist/server/app.js'),'export {};');writeFileSync(join(source,'dist/public/index.html'),'ok');writeFileSync(join(source,'deploy/runtime-files.txt'),'server/index.js\nserver/app.js\npublic/index.html\n');writeFileSync(join(source,'deploy/compiled-runtime-files.txt'),'server/index.js\n');if(extra)await extra(source);
  const path=join(dir,'update.tar.gz');await archive({cwd:source,file:path,gzip:true},['package.json','dist','deploy']);return {dir,path,source};}
test('release package validation checks metadata and extracts compiled runtime files',async t=>{const f=await packageFixture(t),target=join(f.dir,'release');await validateUpdatePackage({archive:f.path,target,version:'3.2.0'});assert.equal(readFileSync(join(target,'dist/public/index.html'),'utf8'),'ok');});
test('release packages with mismatched metadata, missing runtime files or links are rejected before extraction',async t=>{
  for(const extra of [source=>writeFileSync(join(source,'dist/package.json'),JSON.stringify({name:'retourenboard',version:'3.1.0'})),source=>rmSync(join(source,'dist/server/app.js')),source=>writeFileSync(join(source,'deploy/runtime-files.txt'),'../../outside\n')]){
    const f=await packageFixture(t,extra);await assert.rejects(validateUpdatePackage({archive:f.path,target:join(f.dir,'release'),version:'3.2.0'}));
  }
  const f=await packageFixture(t);writeFileSync(join(f.source,'dist/server/linked.js'),'same');await archive({cwd:f.source,file:f.path,gzip:true},['package.json','dist','deploy','dist/server/linked.js']);await assert.rejects(validateUpdatePackage({archive:f.path,target:join(f.dir,'release'),version:'3.2.0'}),/Links|Pfade/);
});

test('in-app update API is admin-only, requires CSRF, password and explicit confirmation',async t=>{
  const requests=[],f=await runtimeFixture(t,{updateService:{status:async()=>({available:true,state:'idle'}),start:async input=>{requests.push(input);return {state:'queued',id:input.id};}}}),{auth}=await f.setup();
  assert.equal((await f.request('/api/admin/updater')).status,401);assert.equal((await f.request('/api/admin/updater','GET',undefined,auth)).status,200);
  await f.request('/api/users','POST',{username:'Member',password:testPassword,permissions:{diagnosticsView:true}},auth);const member=(await f.login('Member')).auth;assert.equal((await f.request('/api/admin/updater','GET',undefined,member)).status,403);
  const input={version:'99.0.0',confirmed:true,password:testPassword};
  assert.equal((await f.request('/api/admin/updater/start','POST',input,{...auth,'X-CSRF-Token':'bad'})).status,403);
  assert.equal((await f.request('/api/admin/updater/start','POST',{...input,confirmed:false},auth)).status,400);
  assert.equal((await f.request('/api/admin/updater/start','POST',{...input,password:'wrong'},auth)).status,401);assert.equal(requests.length,0);
  const res=await f.request('/api/admin/updater/start','POST',input,auth);assert.equal(res.status,202);assert.equal(requests.length,1);assert.equal(requests[0].version,'99.0.0');assert.equal(requests[0].password,undefined);assert.equal((await f.app.backups.list())[0].state,'complete');
});
test('failed updater handoff releases maintenance and preserves normal writes',async t=>{
  const f=await runtimeFixture(t,{updateService:{status:async()=>({available:true,state:'idle'}),start:async()=>{throw Error('socket offline');}}}),{auth}=await f.setup();
  assert.equal((await f.request('/api/admin/updater/start','POST',{version:'99.0.0',confirmed:true,password:testPassword},auth)).status,503);assert.equal((await f.request('/api/products','POST',{name:'Available',sku:'OK'},auth)).status,201);
});

test('the API accepts another job after a recorded download failure and creates a fresh backup',async t=>{
  const env=adapter(),worker=createUpdateWorker({adapter:env,download:async()=>{throw Error('offline');},saveState:()=>{}});
  const f=await runtimeFixture(t,{updateService:{status:async()=>({available:true,...worker.status()}),start:async input=>worker.start(input)}}),{auth}=await f.setup();
  const input={version:'99.0.0',confirmed:true,password:testPassword};
  const first=await f.request('/api/admin/updater/start','POST',input,auth);assert.equal(first.status,202);const firstJob=await first.json();await worker.wait();
  const failed=await(await f.request('/api/admin/updater','GET',undefined,auth)).json();assert.equal(failed.state,'failed');assert.equal(failed.recoveryRequired,false);
  const retry=await f.request('/api/admin/updater/start','POST',input,auth);assert.equal(retry.status,202);const nextJob=await retry.json();await worker.wait();
  assert.notEqual(nextJob.id,firstJob.id);assert.notEqual(nextJob.backupId,firstJob.backupId);assert.equal((await f.app.backups.list()).length,2);
  assert.equal((await f.request('/api/products','POST',{name:'Still available',sku:'RETRY'},auth)).status,201);
});
test('enabled MFA requires an unused factor for update confirmation',async t=>{
  const now=1791374400000,requests=[],f=await runtimeFixture(t,{now:()=>now,updateService:{status:async()=>({available:true,state:'idle'}),start:async input=>{requests.push(input);return {state:'queued',id:input.id};}}}),{auth}=await f.setup(),mfa=await enableMfa(f,auth,now),input={version:'99.0.0',confirmed:true,password:testPassword};
  assert.equal((await f.request('/api/admin/updater/start','POST',input,mfa.auth)).status,401);assert.equal(requests.length,0);
  assert.equal((await f.request('/api/admin/updater/start','POST',{...input,factor:mfa.recoveryCodes[0]},mfa.auth)).status,202);assert.equal(requests.length,1);
  assert.equal((await f.request('/api/admin/updater/start','POST',{...input,factor:mfa.recoveryCodes[0]},mfa.auth)).status,401);assert.equal(requests.length,1);
});
test('demotion during asynchronous updater discovery cannot authorize an installation',async t=>{
  let finish,started,calls=0;const signal=new Promise(resolve=>started=resolve),f=await runtimeFixture(t,{updateService:{status:async()=>{started();return new Promise(resolve=>finish=resolve);},start:async()=>calls++}}),{auth}=await f.setup();
  const created=await(await f.request('/api/users','POST',{username:'Updater',role:'admin',password:testPassword},auth)).json(),other=(await f.login('Updater')).auth;
  const pending=f.request('/api/admin/updater/start','POST',{version:'99.0.0',confirmed:true,password:testPassword},other);await signal;assert.equal((await f.request(`/api/users/${created.id}`,'PUT',{role:'member'},auth)).status,200);finish({available:true,state:'idle'});assert.equal((await pending).status,403);assert.equal(calls,0);
});
