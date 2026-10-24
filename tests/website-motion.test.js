import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

async function controller(){
 const previousDocument=globalThis.document,previousWindow=globalThis.window;
 globalThis.document={querySelector:()=>null,querySelectorAll:()=>[],getElementById:()=>null,addEventListener(){},createTreeWalker:()=>({nextNode:()=>null}),documentElement:{lang:'de',dataset:{},style:{}}};
 globalThis.window={matchMedia:()=>({matches:false,addEventListener(){}})};
 let site;
 try{site=await import(pathToFileURL(resolve('website/dist/site.js')).href);}finally{if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;if(previousWindow===undefined)delete globalThis.window;else globalThis.window=previousWindow;}
 assert.equal(typeof site.revealOnScroll,'function');return site.revealOnScroll;
}
function motion(matches=false){let listener;return {matches,addEventListener(type,fn){listener=fn;},removeEventListener(){listener=undefined;},reduce(){this.matches=true;listener?.();},allow(){this.matches=false;listener?.();}};}
function observer(){let instance;class Observer{constructor(callback){this.callback=callback;this.disconnected=false;instance=this;}observe(){}unobserve(){}disconnect(){this.disconnected=true;}}return {Observer,get instance(){return instance;}};}

test('marketing content remains visible with reduced motion or without an observer',async()=>{
 const reveal=await controller(),elements=[{dataset:{}},{dataset:{}}];
 reveal(elements,motion(true),observer().Observer);assert.ok(elements.every(el=>el.dataset.revealState!=='pending'));
 reveal(elements,motion(false),undefined);assert.ok(elements.every(el=>el.dataset.revealState!=='pending'));
});
test('visible content is revealed once and switching to reduced motion exposes all remaining sections',async()=>{
 const reveal=await controller(),elements=[{dataset:{}},{dataset:{}}],query=motion(),o=observer();
 reveal(elements,query,o.Observer);assert.ok(elements.every(el=>el.dataset.revealState==='pending'));
 o.instance.callback([{target:elements[0],isIntersecting:true}]);assert.equal(elements[0].dataset.revealState,'visible');
 query.reduce();assert.ok(elements.every(el=>el.dataset.revealState==='visible'));assert.equal(o.instance.disconnected,true);
});
test('an observer failure cannot leave the marketing page blank',async()=>{
 const reveal=await controller(),elements=[{dataset:{}},{dataset:{}}];
 class BrokenObserver{observe(){throw Error('Observer unavailable');}disconnect(){}unobserve(){}}
 assert.doesNotThrow(()=>reveal(elements,motion(),BrokenObserver));assert.ok(elements.every(el=>el.dataset.revealState!=='pending'));
});
test('enabling motion after reduced initialization activates scroll reveals without replaying completed sections',async()=>{
 const reveal=await controller(),elements=[{dataset:{}},{dataset:{}}],query=motion(true),o=observer();
 reveal(elements,query,o.Observer);assert.ok(elements.every(el=>el.dataset.revealState!=='pending'));
 query.allow();assert.equal(elements[0].dataset.revealState,'pending');
 o.instance.callback([{target:elements[0],isIntersecting:true}]);query.reduce();query.allow();
 assert.equal(elements[0].dataset.revealState,'visible');assert.equal(elements[1].dataset.revealState,'pending');
});
