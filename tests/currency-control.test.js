import test from 'node:test';
import assert from 'node:assert/strict';
import {createCurrencyView,renderCurrencyMenu,bindCurrencyControl} from '../dist/public/currency-control.js';
import {setLanguage,addTranslations} from '../dist/public/i18n.js';
import {english} from '../dist/public/i18n-catalog.js';
const eur={base:'EUR',display:'EUR',rate:null,date:null,checkedAt:null,stale:false,status:'disabled'};
const usd={...eur,display:'USD',rate:1.1177,date:'2026-10-07',checkedAt:100,status:'current'};
function storage(){const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};}
test('header currency choice persists for the current account without changing the board default',async()=>{
 const saved=storage(),view=createCurrencyView(saved);view.account(7);view.sync(eur);
 const requests=[];assert.equal(await view.choose('USD',async path=>{requests.push(path);return usd;}),true);
 assert.deepEqual(requests,['/api/currency?display=USD']);assert.equal(view.snapshot().display,'USD');assert.equal(eur.display,'EUR');
 const reopened=createCurrencyView(saved);reopened.account(7);reopened.sync({...usd,display:'EUR'});assert.equal(reopened.snapshot().display,'USD');
 reopened.account(8);reopened.sync(eur);assert.equal(reopened.snapshot().display,'EUR');
});
test('EUR switching is immediate and retains original values and a loaded quote for the submenu',async()=>{
 const view=createCurrencyView(storage());view.account(1);view.sync(usd);
 assert.equal(view.snapshot().display,'USD');
 assert.equal(await view.choose('EUR',()=>{throw Error('EUR must not fetch a rate');}),true);
 assert.equal(view.snapshot().display,'EUR');assert.equal(view.snapshot().rate,1.1177);
 view.useDefault();assert.equal(view.snapshot().display,'USD');
});
test('no rate leaves EUR selected and reports a recoverable menu error',async()=>{
 const view=createCurrencyView(storage());view.account(1);view.sync(eur);
 assert.equal(await view.choose('USD',async()=>({...usd,rate:null,status:'unavailable'})),false);
 assert.equal(view.snapshot().display,'EUR');assert.match(view.error(),/Kurs/i);
 assert.equal(await view.choose('USD',async()=>usd),true);assert.equal(view.snapshot().display,'USD');assert.equal(view.error(),'');
});
test('late currency reads cannot change a signed-out or different account',async()=>{
 for(const next of [null,2]){
  const view=createCurrencyView(storage());view.account(1);view.sync(eur);let resolve;
  const pending=view.choose('USD',()=>new Promise(yes=>resolve=yes));view.account(next);view.sync(eur);resolve(usd);
  assert.equal(await pending,false);assert.equal(view.snapshot().display,'EUR');
 }
});
test('a late USD choice cannot undo a newer EUR choice',async()=>{
 const view=createCurrencyView(storage());view.account(1);view.sync(eur);let resolve;
 const pending=view.choose('USD',()=>new Promise(yes=>resolve=yes));await view.choose('EUR',async()=>eur);resolve(usd);
 assert.equal(await pending,false);assert.equal(view.snapshot().display,'EUR');
});
test('blocked storage keeps the selector usable and stale quotes cannot appear current after polling',async()=>{
 const view=createCurrencyView({getItem(){throw Error('blocked');},setItem(){throw Error('blocked');},removeItem(){throw Error('blocked');}});
 view.account(1);view.sync(eur);
 assert.equal(await view.choose('USD',async()=>({...usd,stale:true,status:'cached'})),true);
 view.sync(usd);assert.equal(view.snapshot().stale,true);assert.equal(view.snapshot().status,'cached');
 assert.equal(await view.choose('USD',async()=>({...usd,checkedAt:200})),true);
 view.sync({...usd,stale:true,status:'cached'});assert.equal(view.snapshot().stale,false);
 assert.equal(await view.choose('EUR',async()=>usd),true);view.useDefault();assert.equal(view.snapshot().display,'USD');
});
test('menu contains localized choices and dated rate context rather than an overview banner',()=>{
 addTranslations(english);const view=createCurrencyView(storage());view.account(1);view.sync(usd);
 setLanguage('en');try{
  const html=renderCurrencyMenu(view);
  assert.match(html,/US dollar/);assert.match(html,/Euro/);assert.match(html,/1\.1177/);assert.match(html,/07\/10\/2026/);
  assert.match(html,/data-currency-choice="USD"/);assert.match(html,/aria-pressed="true"/);assert.doesNotMatch(html,/currency-notice/);
 }finally{setLanguage('de');}
});

// A small DOM boundary models replacement of focused nodes and native disabled
// buttons, so a pending network request cannot silently strand keyboard users.
function currencyDOM(){
 const doc={activeElement:null,addEventListener(){}};
 const listeners=new Map(),menuListeners=new Map();let buttons=new Map();
 const summary={setAttribute(){},focus(){doc.activeElement=this;}};
 const menu={contains:node=>[...buttons.values()].includes(node),addEventListener:(name,fn)=>menuListeners.set(name,fn),querySelector:selector=>buttons.get(selector.match(/"(EUR|USD)"/)?.[1])};
 Object.defineProperty(menu,'innerHTML',{set(value){
  if(menu.contains(doc.activeElement))doc.activeElement=null;
  buttons=new Map([...value.matchAll(/<button[^>]+data-currency-choice="(EUR|USD)"[^>]*>/g)].map(match=>{
   const button={dataset:{currencyChoice:match[1]},disabled:match[0].includes('disabled'),closest(){return this;},hasAttribute(){return false;},focus(){if(!this.disabled)doc.activeElement=this;}};
   return [match[1],button];
  }));
 }});
 const text={removeAttribute(){},textContent:''};
 const details={open:false,querySelector:selector=>selector==='summary'?summary:selector==='#currency-menu'?menu:text,addEventListener:(name,fn)=>listeners.set(name,fn)};
 doc.createElement=()=>details;
 return {doc,details,summary,menuListeners,listeners,button:code=>buttons.get(code),root:{querySelector:()=>null,prepend(){}}};
}
test('loading and failure retain keyboard focus, while Escape and outside focus are respected',async()=>{
 const originalDocument=globalThis.document,originalStorage=globalThis.localStorage;
 try{
  for(const leave of ['stay','escape','elsewhere']){
   const dom=currencyDOM();globalThis.document=dom.doc;globalThis.localStorage=storage();let reject;
   const ctx={unlocked:true,authGeneration:1,api:()=>new Promise((_,no)=>reject=no)};
   const control=bindCurrencyControl(ctx,dom.root,()=>{});control.account(1,1);dom.details.open=true;dom.button('USD').focus();
   const pending=dom.menuListeners.get('click')({target:dom.button('USD')});
   assert.equal(dom.doc.activeElement,dom.summary,'The enabled summary must keep focus while choices are disabled');
   if(leave==='escape')dom.listeners.get('keydown')({key:'Escape',preventDefault(){}});
   const outside={};if(leave==='elsewhere')dom.doc.activeElement=outside;
   reject(Error('offline'));await pending;
   if(leave==='stay')assert.equal(dom.doc.activeElement,dom.button('USD'),'Failed choices must be focusable for retry');
   else if(leave==='escape'){assert.equal(dom.details.open,false);assert.equal(dom.doc.activeElement,dom.summary);}
   else assert.equal(dom.doc.activeElement,outside,'Completing a request must not steal focus from another control');
  }
 }finally{if(originalDocument===undefined)delete globalThis.document;else globalThis.document=originalDocument;if(originalStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=originalStorage;}
});

test('background refresh updates an open currency menu without rebuilding a dirty page or contacting EUR unnecessarily',async()=>{
 const originalDocument=globalThis.document,originalStorage=globalThis.localStorage;
 try{
  const dom=currencyDOM();globalThis.document=dom.doc;globalThis.localStorage=storage();let calls=0,rate=usd,rebuilds=0;
  const ctx={unlocked:true,authGeneration:1,api:async()=>{calls++;return rate;}},control=bindCurrencyControl(ctx,dom.root,()=>rebuilds++);control.account(1,1);
  assert.equal(typeof control.refresh,'function');await control.sync(eur);await control.refresh();assert.equal(calls,0);
  dom.details.open=true;await control.refresh();assert.equal(calls,1);assert.equal(control.snapshot(eur).rate,1.1177);
  rate={...usd,rate:1.2,checkedAt:3600100};await control.refresh();assert.equal(control.snapshot(eur).rate,1.2);assert.equal(rebuilds,0);
  ctx.unlocked=false;await control.refresh();assert.equal(calls,2);
 }finally{if(originalDocument===undefined)delete globalThis.document;else globalThis.document=originalDocument;if(originalStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=originalStorage;}
});

test('Escape is consumed only by an open currency disclosure so its parent remains keyboard-closable',()=>{
 const originalDocument=globalThis.document,originalStorage=globalThis.localStorage;
 try{
  const dom=currencyDOM();globalThis.document=dom.doc;globalThis.localStorage=storage();
  bindCurrencyControl({unlocked:true,authGeneration:1},dom.root,()=>{});
  let consumed=0;const escape={key:'Escape',preventDefault(){consumed++;}};
  dom.details.open=true;dom.listeners.get('keydown')(escape);
  assert.equal(consumed,1);assert.equal(dom.details.open,false);assert.equal(dom.doc.activeElement,dom.summary);
  dom.listeners.get('keydown')(escape);assert.equal(consumed,1,'A closed child must allow Escape to reach its containing disclosure');
 }finally{if(originalDocument===undefined)delete globalThis.document;else globalThis.document=originalDocument;if(originalStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=originalStorage;}
});

test('an EUR admin card receives cached updates and a late read cannot replace a manual refresh',async()=>{
 const originalDocument=globalThis.document,originalStorage=globalThis.localStorage;
 try{
  const dom=currencyDOM();dom.doc.querySelector=selector=>selector==='#currency-rate'?{}:null;globalThis.document=dom.doc;globalThis.localStorage=storage();let finish,calls=[];
  const ctx={unlocked:true,authGeneration:1,api:path=>{calls.push(path);return new Promise(resolve=>finish=resolve);}},control=bindCurrencyControl(ctx,dom.root,()=>assert.fail('A dirty settings form must not be rebuilt'));control.account(1,1);await control.sync(eur);
  const pending=control.refresh();assert.deepEqual(calls,['/api/currency?display=EUR']);assert.equal(typeof control.apply,'function');control.apply({...usd,display:'EUR',rate:1.25,checkedAt:300});finish({...usd,display:'EUR',rate:1.1,checkedAt:200});await pending;
  assert.equal(control.snapshot(eur).rate,1.25);assert.equal(control.snapshot(eur).display,'EUR');
 }finally{if(originalDocument===undefined)delete globalThis.document;else globalThis.document=originalDocument;if(originalStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=originalStorage;}
});
