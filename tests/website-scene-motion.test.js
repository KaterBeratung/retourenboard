import test from 'node:test';import assert from 'node:assert/strict';
const previousDocument=globalThis.document,previousWindow=globalThis.window;
globalThis.document={querySelector:()=>null,querySelectorAll:()=>[],getElementById:()=>null,addEventListener(){},createTreeWalker:()=>({nextNode:()=>null}),documentElement:{lang:'de',dataset:{},style:{}}};
globalThis.window={matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}})};
let site;try{site=await import('../website/dist/site.js');}finally{globalThis.document=previousDocument;globalThis.window=previousWindow;}
function fixture(reduced=false,stored=new Map(),blocked=false){
 assert.equal(typeof site.bindSceneMotion,'function');const events={},attributes={},button={hidden:false,setAttribute:(name,value)=>attributes[name]=value,addEventListener:(name,fn)=>events[name]=fn};
 const stage={},page={hidden:false,documentElement:{dataset:{}},querySelector:selector=>selector==='#scene-motion'?button:stage,addEventListener:(name,fn)=>events[name]=fn};
 const query={matches:reduced,addEventListener:(name,fn)=>events.system=fn};let observe;
 class Observer{constructor(callback){observe=callback;}observe(node){assert.equal(node,stage);}}
 const effective=site.bindSceneMotion(page,query,Observer,()=>{if(blocked)throw Error('Storage blocked');return {getItem:key=>stored.get(key)??null,setItem:(key,value)=>stored.set(key,value)};});return {page,query,events,button,attributes,effective,stored,intersection:visible=>observe([{target:stage,isIntersecting:visible}])};
}
test('visitors can pause and resume the decorative scene without changing content',()=>{
 const f=fixture();assert.equal(f.page.documentElement.dataset.sceneMotion,'play');assert.equal(f.attributes['aria-pressed'],'true');f.events.click();assert.equal(f.page.documentElement.dataset.sceneMotion,'pause');assert.equal(f.attributes['aria-pressed'],'false');f.events.click();assert.equal(f.page.documentElement.dataset.sceneMotion,'play');
});
test('reduced motion stops the scene and does not erase a manual pause',()=>{
 const f=fixture(true);assert.equal(f.page.documentElement.dataset.sceneMotion,'pause');assert.equal(f.button.hidden,false);f.query.matches=false;f.events.system();assert.equal(f.page.documentElement.dataset.sceneMotion,'play');assert.equal(f.button.hidden,false);f.events.click();f.query.matches=true;f.events.system();f.query.matches=false;f.events.system();assert.equal(f.page.documentElement.dataset.sceneMotion,'pause');
});
test('a visitor can explicitly start motion despite the system setting and keep the choice on reload',()=>{
 const f=fixture(true);assert.equal(f.button.hidden,false);f.events.click();
 assert.equal(f.page.documentElement.dataset.sceneMotion,'play');assert.equal(f.page.documentElement.dataset.siteMotion,'normal');assert.equal(f.attributes['aria-pressed'],'true');
 const again=fixture(true,f.stored);assert.equal(again.page.documentElement.dataset.sceneMotion,'play');
 again.events.click();assert.equal(again.page.documentElement.dataset.siteMotion,'reduce');assert.equal(fixture(false,f.stored).page.documentElement.dataset.sceneMotion,'pause');
});
test('section reveals follow the visitor choice while hidden tabs only pause the decorative scene',()=>{
 const f=fixture(true);assert.ok(f.effective);let updates=0;f.effective.addEventListener('change',()=>updates++);
 assert.equal(f.effective.matches,true);f.events.click();assert.equal(f.effective.matches,false);assert.equal(updates,1);
 f.page.hidden=true;f.events.visibilitychange();assert.equal(f.page.documentElement.dataset.sceneMotion,'pause');assert.equal(f.effective.matches,false);assert.equal(updates,1);
 f.page.hidden=false;f.events.visibilitychange();f.events.click();assert.equal(f.effective.matches,true);assert.equal(updates,2);
});
test('invalid or unavailable visitor storage leaves system behavior and manual controls usable',()=>{
 for(const f of [fixture(true,new Map([['retourenboard.website.motion','invalid']])),fixture(true,new Map(),true)]){
  assert.equal(f.page.documentElement.dataset.sceneMotion,'pause');assert.doesNotThrow(()=>f.events.click());assert.equal(f.page.documentElement.dataset.sceneMotion,'play');
 }
});
test('scene animation rests while offscreen or hidden and only resumes when both become visible',()=>{
 const f=fixture();f.intersection(false);assert.equal(f.page.documentElement.dataset.sceneMotion,'pause');f.page.hidden=true;f.events.visibilitychange();f.intersection(true);assert.equal(f.page.documentElement.dataset.sceneMotion,'pause');f.page.hidden=false;f.events.visibilitychange();assert.equal(f.page.documentElement.dataset.sceneMotion,'play');
});
