import {test} from 'node:test';import assert from 'node:assert/strict';
import {createScannerLauncher} from '../dist/public/scanner-loading.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function fixture(load){
 const content={firstElementChild:{}},dialog={open:true,firstElementChild:{}},modals=[dialog],button={tagName:'BUTTON',disabled:false,attrs:{},getAttribute(key){return this.attrs[key]??null;},setAttribute(key,value){this.attrs[key]=value;},removeAttribute(key){delete this.attrs[key];}},document={activeElement:button,querySelector(selector){return selector==='#content'?content:dialog;},querySelectorAll(){return modals;}};
 const ctx={unlocked:true,authGeneration:1,session:{user:{id:1},csrfToken:'same'},toast(message){this.error=String(message);}},state={href:'http://test/#returns'},opened=[];
 const scanner={openScanner(ctx,options){opened.push(options);return 'scanner';},stopScanner(){state.stopped=true;}},launcher=createScannerLauncher(load??(()=>Promise.resolve(scanner)),{document,href:()=>state.href});
 return {launcher,ctx,content,dialog,modals,button,state,scanner,opened};
}
test('scanner code is loaded only on demand and reused after a successful load',async()=>{
 let loads=0;const f=fixture(async()=>{loads++;return f.scanner;});assert.equal(loads,0);
 assert.equal(await f.launcher.open(f.ctx,{onScan(){}}),'scanner');assert.equal(loads,1);assert.equal(f.opened.length,1);
 await f.launcher.open(f.ctx,{onScan(){}});assert.equal(loads,1);assert.equal(f.opened.length,2);assert.equal(f.button.disabled,false);assert.equal(f.button.getAttribute('aria-busy'),null);
});
test('concurrent scanner clicks share their download and only the latest request opens',async()=>{
 const d=deferred();let loads=0;const f=fixture(()=>{loads++;return d.promise;}),first=f.launcher.open(f.ctx,{id:'first'}),last=f.launcher.open(f.ctx,{id:'last'});
 assert.equal(f.button.disabled,true);assert.equal(f.button.getAttribute('aria-busy'),'true');d.resolve(f.scanner);await Promise.all([first,last]);assert.equal(loads,1);assert.deepEqual(f.opened,[{id:'last'}]);assert.equal(f.button.disabled,false);
});
for(const change of ['account','route','content','dialog','stop'])test('a scanner download cannot open over a changed '+change,async()=>{
 const d=deferred(),f=fixture(()=>d.promise),pending=f.launcher.open(f.ctx,{onScan(){}});
 if(change==='account')f.ctx.authGeneration++;
 if(change==='route')f.state.href='http://test/#products';
 if(change==='content')f.content.firstElementChild={};
 if(change==='dialog')f.dialog.firstElementChild={};
 if(change==='stop')f.launcher.stop();
 d.resolve(f.scanner);await pending;assert.deepEqual(f.opened,[]);assert.equal(f.button.disabled,false);
});
test('a failed scanner download gives feedback, releases the button and permits a retry',async()=>{
 let count=0;const f=fixture(async()=>{if(!count++)throw Error('Offline');return f.scanner;});
 await f.launcher.open(f.ctx,{});assert.match(f.ctx.error,/Scanner/);assert.equal(f.button.disabled,false);
 await f.launcher.open(f.ctx,{});assert.equal(count,2);assert.equal(f.opened.length,1);
});
test('locked accounts do not start a scanner download',async()=>{
 let loaded=false;const f=fixture(async()=>{loaded=true;return f.scanner;});f.ctx.unlocked=false;await f.launcher.open(f.ctx,{});assert.equal(loaded,false);
});
test('a pending scanner cannot replace a newer print preview or unsaved-changes modal',async()=>{
 for(const className of ['return-label-dialog','unsaved-dialog']){
  const d=deferred(),f=fixture(()=>d.promise),pending=f.launcher.open(f.ctx,{});f.modals.push({open:true,className});d.resolve(f.scanner);await pending;
  assert.deepEqual(f.opened,[],'Keep the newer '+className+' in front');assert.equal(f.button.disabled,false);
 }
});
