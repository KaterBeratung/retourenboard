import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceModule} from './helpers/source-module.js';
const actions=await sourceModule("export * from './frontend/src/quick-actions.ts'; export * from './frontend/src/record-action-menu.ts'; export {setLanguage} from './frontend/src/i18n.js'; import {addTranslations} from './frontend/src/i18n.js'; import {english} from './frontend/src/i18n-catalog.js'; addTranslations(english);").catch(()=>({}));
test('return row actions are directly accessible by keyboard without opening a menu',()=>{
 assert.equal(typeof actions.returnQuickActions,'function');
 const markup=String(actions.returnQuickActions({can:()=>true},{id:9,returnNumber:'<RET-9>',serialNumber:'SN-9'})).replace(/<!--.*?-->/g,'');
 for(const hook of ['data-quick-status="9"','data-copy-serial="9"','data-copy-return="9"','data-disposal-return="9"','data-detail="returns"'])assert.ok(markup.includes(hook),hook);
 assert.doesNotMatch(markup,/role="menuitem"|tabindex="-1"|aria-haspopup="menu"|<RET-9>/);
 for(const button of markup.match(/<button\b[^>]*>/g))assert.match(button,/aria-label="[^"]+"/);
});
test('direct disposal actions require both permissions and an open return',()=>{
 const row={id:9,returnNumber:'RET-9',serialNumber:'SN-9'};
 for(const permissions of [[],['disposalsCreate'],['disposalsRead']]){
  const markup=String(actions.returnQuickActions({can:key=>permissions.includes(key)},row));
  assert.doesNotMatch(markup,/data-disposal-return/);
  assert.match(markup,/data-copy-return="9"/);assert.match(markup,/data-detail="returns"/);
 }
 assert.doesNotMatch(String(actions.returnQuickActions({can:()=>true},{...row,isClosed:true})),/data-disposal-return/);
 actions.setLanguage('en');try{
  const markup=String(actions.returnQuickActions({can:()=>true},row));
  assert.match(markup,/aria-label="Copy serial number"/);assert.match(markup,/aria-label="Copy return number"/);
 }finally{actions.setLanguage('de');}
});
test('copying a return number keeps its menu label and accessible name when immediately reopened',async t=>{
 const previous={navigator:Object.getOwnPropertyDescriptor(globalThis,'navigator'),setTimeout:globalThis.setTimeout};
 Object.defineProperty(globalThis,'navigator',{value:{clipboard:{writeText:async()=>{}}},configurable:true});
 globalThis.setTimeout=()=>0;
 t.after(()=>{globalThis.setTimeout=previous.setTimeout;if(previous.navigator)Object.defineProperty(globalThis,'navigator',previous.navigator);else delete globalThis.navigator;});
 const original='<svg aria-hidden="true"></svg><span>Retourennummer kopieren</span>';
 const menuitem={dataset:{copyReturn:'9'},innerHTML:original,getAttribute:name=>name==='role'?'menuitem':name==='aria-label'?'Retourennummer kopieren':null};
 const root={querySelectorAll:selector=>selector==='[data-copy-return]'?[menuitem]:[]};
 actions.bindQuickActions({toast(){}},root,()=>[{id:9,returnNumber:'RET-009'}],{status(){},create(){}});
 await menuitem.onclick();assert.equal(menuitem.innerHTML,original);assert.equal(menuitem.getAttribute('aria-label'),'Retourennummer kopieren');
});
test('product menu keeps creation permission and active-state gates; both languages have accessible names',()=>{
 assert.equal(typeof actions.productQuickActions,'function');
 assert.match(String(actions.productQuickActions({can:()=>true},{id:3,name:'Gerät',active:true})),/data-return-product="3"/);
 assert.doesNotMatch(String(actions.productQuickActions({can:()=>true},{id:3,name:'Gerät',active:false})),/data-return-product/);
 assert.doesNotMatch(String(actions.productQuickActions({can:()=>false},{id:3,name:'Gerät',active:true})),/data-return-product/);
 actions.setLanguage('en');try{assert.match(String(actions.productQuickActions({can:()=>false},{id:3,name:'Device'})),/aria-label="More actions: Device"/);}finally{actions.setLanguage('de');}
});
test('menu keyboard navigation cycles items; Escape and outside touch dismiss it with correct focus',t=>{
 const previous={document:globalThis.document,window:globalThis.window};
 const doc=Object.assign(new EventTarget(),{activeElement:null,body:{append(){}}}),win=Object.assign(new EventTarget(),{innerWidth:360,innerHeight:700});
 globalThis.document=doc;globalThis.window=win;
 t.after(()=>{actions.closeRecordMenus();for(const key of ['document','window']){if(previous[key]===undefined)delete globalThis[key];else globalThis[key]=previous[key];}});
 const attrs=new Map(),entries=[0,1].map(index=>({index,focus(){doc.activeElement=this;}}));
 const popup=Object.assign(new EventTarget(),{style:{},hidden:true,nativeOpen:false,querySelectorAll:()=>entries,contains:node=>entries.includes(node),showPopover(){this.nativeOpen=true;},hidePopover(){this.nativeOpen=false;},matches(){return this.nativeOpen;},getBoundingClientRect:()=>({width:220,height:130})});
 const wrapper={querySelector:()=>popup,setAttribute(){},removeAttribute(){}};
 const trigger={isConnected:true,closest:()=>wrapper,setAttribute:(key,value)=>attrs.set(key,value),getBoundingClientRect:()=>({left:300,right:340,top:630,bottom:670}),contains:()=>false,focus(){doc.activeElement=this;}};
 const root={contains:node=>node===trigger,querySelectorAll:()=>[trigger]};
 actions.bindRecordMenus(root);
 const key=name=>({key:name,preventDefault(){},stopPropagation(){}});
 trigger.onkeydown(key('ArrowDown'));assert.equal(attrs.get('aria-expanded'),'true');assert.equal(doc.activeElement,entries[0]);assert.equal(popup.hidden,false);assert.equal(popup.style.top,'494px');
 popup.onkeydown(key('ArrowUp'));assert.equal(doc.activeElement,entries[1]);popup.onkeydown(key('ArrowDown'));assert.equal(doc.activeElement,entries[0]);
 popup.onkeydown(key('End'));assert.equal(doc.activeElement,entries[1]);popup.onkeydown(key('Home'));assert.equal(doc.activeElement,entries[0]);
 popup.onkeydown(key('Escape'));assert.equal(popup.hidden,true);assert.equal(attrs.get('aria-expanded'),'false');assert.equal(doc.activeElement,trigger);
 trigger.onkeydown(key('ArrowUp'));assert.equal(doc.activeElement,entries[1]);doc.dispatchEvent(new Event('pointerdown'));assert.equal(popup.hidden,true);assert.equal(attrs.get('aria-expanded'),'false');
});
test('action-menu placement flips above the trigger and clamps within a narrow viewport',()=>{
 assert.equal(typeof actions.recordMenuPosition,'function');
 assert.deepEqual(actions.recordMenuPosition({left:300,right:340,top:630,bottom:670},{width:220,height:130},{width:360,height:700}),{left:120,top:494});
 assert.deepEqual(actions.recordMenuPosition({left:0,right:40,top:5,bottom:45},{width:220,height:130},{width:240,height:300}),{left:12,top:51});
});
