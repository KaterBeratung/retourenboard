import test from 'node:test';
import assert from 'node:assert/strict';
import {bindUpdates,renderUpdates} from '../dist/public/admin-updates.js';
import {addTranslations,setLanguage} from '../dist/public/i18n.js';
import {english} from '../dist/public/i18n-catalog.js';

test('the live check button changes language without a request or a page reload',async t=>{
  addTranslations(english);const {root,button}=boundary(t),previousWindow=globalThis.window;let markup='',nodes=[],requests=0;
  Object.defineProperty(button,'innerHTML',{get:()=>markup,set:value=>{markup=value;nodes=[...value.matchAll(/<!--(rb-i18n:[^>]+)-->([^<]*)/g)].map(match=>({data:match[1],nextSibling:{nodeType:3,nodeValue:match[2]}}));}});
  globalThis.document.documentElement={lang:'de'};globalThis.document.querySelectorAll=()=>[];
  globalThis.document.createTreeWalker=()=>{let index=0;return {nextNode:()=>nodes[index++]};};globalThis.window={dispatchEvent(){}};
  try{
    setLanguage('de');await bindUpdates({isAdmin:true,api:async()=>{requests++;return snapshot;}},root);
    setLanguage('en');const visible=()=>nodes.length?nodes.map(node=>node.nextSibling.nodeValue).join(''):markup.replace(/<[^>]*>/g,'');
    assert.equal(visible(),'Check now');assert.equal(requests,1);
    setLanguage('de');assert.equal(visible(),'Jetzt prüfen');
  }finally{setLanguage('de');if(previousWindow===undefined)delete globalThis.window;else globalThis.window=previousWindow;}
});

const snapshot = {installedVersion:'3.1.0',latestVersion:null,status:'unchecked',checkedAt:null,publishedAt:null,retryAt:null,message:''};
function boundary(t){
  const button={disabled:false,innerHTML:''},retry={textContent:''},target={isConnected:true,innerHTML:'',setAttribute(){},querySelector:selector=>selector==='#updates-retry'?retry:null,prepend(node){this.error=node;}};
  const root={querySelector:selector=>selector==='#updates-content'?target:selector==='#updates-check'?button:null},original=globalThis.document;
  globalThis.document={createElement:()=>({setAttribute(){}})};
  t.after(()=>{if(original===undefined)delete globalThis.document;else globalThis.document=original;});
  return {root,target,button,retry};
}

test('updates page reads cached status and only posts after a manual click, blocking duplicate clicks',async t=>{
  const {root,target,button}=boundary(t),requests=[];let finish;
  assert.match(renderUpdates(),/Jetzt prüfen/);
  await bindUpdates({isAdmin:true,api:async(path,options)=>{requests.push([path,options?.method||'GET']);return options?new Promise(resolve=>finish=resolve):snapshot;}},root);
  assert.deepEqual(requests,[['/api/admin/version-check','GET']]);assert.match(target.innerHTML,/Noch nicht geprüft/);assert.equal(button.disabled,false);
  const checking=button.onclick();assert.equal(button.disabled,true);assert.match(button.innerHTML,/Wird geprüft/);await button.onclick();assert.equal(requests.length,2);
  finish({...snapshot,status:'current',latestVersion:'3.1.0'});await checking;assert.equal(button.disabled,false);assert.match(target.innerHTML,/Auf dem aktuellen Stand/);
});

test('update states distinguish newer public releases, locally newer versions and failures while escaping upstream text',async t=>{
  for(const [status,label] of [['updateAvailable','Neue Version verfügbar'],['ahead','Lokale Version ist neuer'],['unavailable','Prüfung nicht möglich']]){
    const {root,target}=boundary(t);
    await bindUpdates({isAdmin:true,api:async()=>({...snapshot,status,latestVersion:status==='unavailable'?null:'3.2.0',message:'<script>unsafe</script>'})},root);
    assert.match(target.innerHTML,new RegExp(label));assert.doesNotMatch(target.innerHTML,/<script>/);assert.match(target.innerHTML,/https:\/\/github.com\/KaterBeratung\/retourenboard\/releases/);
  }
});

test('a delayed result cannot replace another page or content after loss of admin access',async t=>{
  for(const lostAccess of [false,true]){
    const {root,target,button}=boundary(t);let finish;const ctx={isAdmin:true,api:async(_path,options)=>options?new Promise(resolve=>finish=resolve):snapshot};
    await bindUpdates(ctx,root);const checking=button.onclick(),previous=target.innerHTML;
    if(lostAccess)ctx.isAdmin=false;else target.isConnected=false;
    finish({...snapshot,status:'updateAvailable',latestVersion:'9.0.0'});await checking;assert.equal(target.innerHTML,previous);
  }
});

test('request errors remain visible and permit a retry',async t=>{
  const {root,target,button}=boundary(t);let calls=0;
  await bindUpdates({isAdmin:true,api:async()=>{if(++calls===1)throw new Error('Server nicht erreichbar');return snapshot;}},root);
  assert.equal(target.error.textContent,'Server nicht erreichbar');assert.equal(button.disabled,false);
  await button.onclick();assert.equal(calls,2);assert.match(target.innerHTML,/Noch nicht geprüft/);
});
test('automatic status refresh reads cached results while visible and never starts an installation',async t=>{
 const {root,target}=boundary(t),originalTimer=globalThis.setTimeout,originalCancel=globalThis.clearTimeout,timers=[],requests=[];
 globalThis.setTimeout=(fn,delay)=>{const timer={fn,delay,unref(){}};timers.push(timer);return timer;};globalThis.clearTimeout=()=>{};
 t.after(()=>{globalThis.setTimeout=originalTimer;globalThis.clearTimeout=originalCancel;});
 const ctx={isAdmin:true,api:async(path,options)=>{requests.push([path,options?.method||'GET']);return {...snapshot,automatic:true,nextCheckAt:'2026-10-13T00:00:00Z',status:requests.length>1?'updateAvailable':'current',latestVersion:requests.length>1?'3.2.0':'3.1.0'};}};
 await bindUpdates(ctx,root);assert.match(target.innerHTML,/Automatische Prüfung alle sechs Stunden/);
 assert.equal(timers.at(-1).delay,30000);await timers.at(-1).fn();assert.match(target.innerHTML,/Neue Version verfügbar/);
 assert.deepEqual(requests,[['/api/admin/version-check','GET'],['/api/admin/version-check','GET']]);
 globalThis.document.visibilityState='hidden';await timers.at(-1).fn();assert.equal(requests.length,2);
 target.isConnected=false;await timers.at(-1).fn();assert.equal(requests.length,2);
});
