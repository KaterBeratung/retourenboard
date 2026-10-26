import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceModule} from './helpers/source-module.js';
const ui=await sourceModule("export * from './frontend/src/presentation.ts';export {readWhenIdle} from './frontend/src/design.ts';");

function interactionGuard(){
 const source=readFileSync(new URL('../dist/public/app.js',import.meta.url),'utf8');
 const start=source.indexOf('function isInteracting()'),end=source.indexOf('\nconst ctx =',start);
 assert.ok(start>=0&&end>start);
 const saved={open:true};
 const doc={activeElement:{matches:()=>false,closest:()=>({})},body:{classList:{contains:()=>false}},querySelector(selector){
  if(selector==='#dialog')return {open:false};
  return saved.open&&selector.split(',').includes('[data-saved-filters][open]')?saved:null;
 }};
 return {saved,isBusy:new Function('document',source.slice(start,end)+';return isInteracting;')(doc)};
}

test('an open saved-view menu defers a quiet inventory read while its summary has focus',async()=>{
 const f=interactionGuard();let reads=0;
 const read=async()=>{reads++;return {revision:2};};
 assert.equal(await ui.readWhenIdle(read,f.isBusy),undefined);
 assert.equal(reads,0,'Polling must preserve the open menu before requesting new inventory');
 f.saved.open=false;
 assert.deepEqual(await ui.readWhenIdle(read,f.isBusy),{revision:2});assert.equal(reads,1);
});

function menus(){
 const handlers=[];
 const first={open:true,contains:target=>target?.menu===first};
 const second={open:false,contains:target=>target?.menu===second};
 const doc={addEventListener(type,handler){assert.equal(type,'click');handlers.push(handler);},querySelectorAll:()=>[first,second].filter(menu=>menu.open)};
 assert.equal(typeof ui.bindWorkspaceMenuDismissal,'function');ui.bindWorkspaceMenuDismissal(doc);
 return {doc,first,second,handlers,click:target=>handlers.forEach(handler=>handler({target}))};
}

test('workspace menus preserve inside clicks and dismiss after clicking outside',()=>{
 const f=menus();f.click({menu:f.first});assert.equal(f.first.open,true);
 f.click({});assert.equal(f.first.open,false);
});

test('activating another workspace menu closes the previous one for mouse and keyboard clicks',()=>{
 const f=menus();f.click({menu:f.second});assert.equal(f.first.open,false);
 f.second.open=true;f.click({menu:f.second});assert.equal(f.second.open,true);
});

test('repeated workspace setup does not duplicate document handlers',()=>{
 const f=menus();ui.bindWorkspaceMenuDismissal(f.doc);assert.equal(f.handlers.length,1);
});
