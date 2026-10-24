import test from 'node:test';
import assert from 'node:assert/strict';
import {createUpdateFlow,updaterView,waitForUpdate} from '../dist/public/admin-updater.js';
import {addTranslations,setLanguage} from '../dist/public/i18n.js';
import {english} from '../dist/public/i18n-catalog.js';

test('updater service messages follow the selected language and unknown errors stay escaped',t=>{
  addTranslations(english);setLanguage('en');t.after(()=>setLanguage('de'));
  assert.match(updaterView({available:false,message:'Der In-App-Updater benötigt eine Debian-/Ubuntu-Installation mit systemd.'},null),/The in-app updater requires a Debian\/Ubuntu installation with systemd/);
  assert.doesNotMatch(updaterView({available:false,message:'<script>Fehler</script>'},null),/<script>/);
});
test('update confirmation sends only the selected version and identity proof and prevents duplicate submission',async()=>{
  let finish;const requests=[],flow=createUpdateFlow(async(path,options)=>{requests.push([path,options]);return new Promise(resolve=>finish=resolve);});
  const input={version:'3.3.0',confirmed:true,password:'existing-password',factor:'123456'},pending=flow.start(input);assert.equal(flow.busy,true);await assert.rejects(flow.start(input),/bereits/);assert.equal(requests.length,1);assert.equal(requests[0][0],'/api/admin/updater/start');assert.deepEqual(requests[0][1].body,input);
  finish({accepted:true,id:'job'});await pending;assert.equal(flow.accepted,true);await assert.rejects(flow.start(input),/bereits/);
});
test('failed or incomplete confirmation keeps the update retryable',async()=>{
  let calls=0;const flow=createUpdateFlow(async()=>{calls++;throw Error('Password wrong');});await assert.rejects(flow.start({version:'3.3.0',confirmed:false}),/bestätigen/);assert.equal(calls,0);
  await assert.rejects(flow.start({version:'3.3.0',confirmed:true}),/Password wrong/);assert.equal(flow.busy,false);assert.equal(flow.accepted,false);
});

test('an accepted update becomes retryable after its recorded failure, without reloading the page',async()=>{
  let calls=0;const flow=createUpdateFlow(async()=>({accepted:true,id:'job-'+ ++calls}));
  const input={version:'3.3.0',confirmed:true};await flow.start(input);
  assert.equal(typeof flow.observe,'function');
  flow.observe({available:true,id:'job-1',state:'failed',recoveryRequired:false});
  assert.equal(flow.busy,false);assert.equal(flow.accepted,false);
  await flow.start(input);assert.equal(calls,2);assert.equal(flow.accepted,true);
});

test('stale job results and unavailable status cannot unlock a current update',async()=>{
  const flow=createUpdateFlow(async()=>({accepted:true,id:'current'}));await flow.start({version:'3.3.0',confirmed:true});
  assert.equal(typeof flow.observe,'function');
  for(const status of [{available:true,id:'previous',state:'failed'},{available:false,id:'current',state:'failed'},{available:true,id:'current',state:'restarting'}]){
    flow.observe(status);assert.equal(flow.busy,true);assert.equal(flow.accepted,true);
  }
  flow.observe({available:true,id:'current',state:'complete'});assert.equal(flow.busy,false);
});

test('a pending confirmation stays protected against an old failed status',async()=>{
  let finish;const flow=createUpdateFlow(async()=>new Promise(resolve=>finish=resolve)),pending=flow.start({version:'3.3.0',confirmed:true});
  assert.equal(typeof flow.observe,'function');flow.observe({available:true,id:'old',state:'failed'});assert.equal(flow.busy,true);
  finish({accepted:true,id:'new'});await pending;assert.equal(flow.accepted,true);
});
test('updater view explains unavailable Linux service, escapes messages and offers install only for a newer release',()=>{
  assert.match(updaterView({available:false,message:'Linux fehlt'},null),/Linux fehlt/);
  assert.match(updaterView({available:true,state:'idle'},{status:'updateAvailable',latestVersion:'3.3.0'}),/Update installieren/);
  assert.match(updaterView({available:true,state:'idle'},{status:'ahead',latestVersion:'3.0.0'}),/disabled/);
  assert.doesNotMatch(updaterView({available:true,state:'failed',message:'<script>unsafe</script>'},null),/<script>/);
});

test('a failed job permits retry but recovery-required or pending jobs keep the install button disabled',()=>{
  const release={status:'updateAvailable',latestVersion:'3.3.0'},status={available:true,state:'failed'};
  assert.doesNotMatch(updaterView(status,release),/id="updater-start" disabled/);
  assert.match(updaterView({...status,recoveryRequired:true},release),/id="updater-start" disabled/);
  assert.match(updaterView(status,release,true),/id="updater-start" disabled/);
});
test('update reconnect waits through downtime and sends users to login after the service restarts',async()=>{
  let now=0,calls=0;const result=await waitForUpdate({now:()=>now,pause:async()=>{now+=1000;},fetcher:async()=>{if(++calls===1)throw Error('connection refused');return new Response(JSON.stringify({unlocked:false,version:'3.3.0'}));}});assert.equal(result.relogin,true);assert.equal(calls,2);
});
test('an update failing before restart returns its recorded result instead of waiting forever',async()=>{
  const seen=[],result=await waitForUpdate({onProgress:value=>seen.push(value.state),fetcher:async path=>new Response(JSON.stringify(path==='/api/session'?{unlocked:true}:{available:true,state:'failed',message:'Download fehlgeschlagen'}))});assert.equal(result.state,'failed');assert.deepEqual(seen,['failed']);
});

test('reconnect ignores the previous failed job while waiting for the newly accepted update',async()=>{
  let calls=0,now=0;const progress=[];
  const result=await waitForUpdate({jobId:'new',now:()=>now,pause:async()=>{now+=1000;},onProgress:value=>progress.push(value.id),fetcher:async path=>new Response(JSON.stringify(path==='/api/session'?{unlocked:true}:{available:true,id:++calls===1?'old':'new',state:'failed'}))});
  assert.equal(result.id,'new');assert.equal(calls,2);assert.deepEqual(progress,['new']);
});
