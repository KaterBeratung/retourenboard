import test from 'node:test';
import assert from 'node:assert/strict';

const previousDocument=globalThis.document,previousWindow=globalThis.window;
globalThis.document={querySelector:()=>null,querySelectorAll:()=>[],getElementById:()=>null,addEventListener(){},createTreeWalker:()=>({nextNode:()=>null}),documentElement:{lang:'de',dataset:{},style:{}}};
globalThis.window={matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}})};
let site;
try{site=await import('../website/dist/site.js');}finally{globalThis.document=previousDocument;globalThis.window=previousWindow;}

function fixture({dark=false,saved=null,blocked=false,control=true}={}){
 assert.equal(typeof site.bindThemeToggle,'function');
 const events={},values={},writes=[],meta={setAttribute(name,value){this[name]=value;}},button={hidden:true,setAttribute(name,value){values[name]=value;},addEventListener(name,listener){events[name]=listener;}};
 const page={documentElement:{dataset:{},style:{}},querySelector:selector=>selector==='#theme-toggle'?(control?button:null):meta};
 const query={matches:dark,addEventListener(name,listener){events.system=listener;}};
 const storage=()=>{if(blocked)throw Error('Storage blocked');return {getItem:()=>saved,setItem:(key,value)=>writes.push([key,value])};};
 site.bindThemeToggle(page,query,storage);
 return {page,query,events,values,writes,meta,button};
}

test('website theme follows the system until the visitor selects a theme',()=>{
 const f=fixture();assert.equal(f.page.documentElement.dataset.theme,'light');assert.equal(f.values['aria-pressed'],'false');assert.equal(f.button.hidden,false);
 f.query.matches=true;f.events.system();assert.equal(f.page.documentElement.dataset.theme,'dark');assert.equal(f.page.documentElement.style.colorScheme,'dark');assert.equal(f.values['aria-pressed'],'true');
 f.events.click();assert.equal(f.page.documentElement.dataset.theme,'light');assert.deepEqual(f.writes,[['retourenboard.website.theme','light']]);
 f.events.system();assert.equal(f.page.documentElement.dataset.theme,'light');
});

test('saved website theme takes precedence over the system and updates browser chrome',()=>{
 const f=fixture({saved:'dark'});assert.equal(f.page.documentElement.dataset.theme,'dark');assert.equal(f.meta.content,'#0a131d');
 f.events.click();assert.equal(f.page.documentElement.dataset.theme,'light');assert.equal(f.meta.content,'#edf2f5');
});

test('blocked storage and unsupported saved themes leave the website theme switch usable',()=>{
 for(const options of [{blocked:true,dark:true},{saved:'unexpected',dark:true}]){
  const f=fixture(options);assert.equal(f.page.documentElement.dataset.theme,'dark');assert.doesNotThrow(()=>f.events.click());assert.equal(f.page.documentElement.dataset.theme,'light');
 }
});

test('legal pages apply saved and system themes even without a visible theme toggle',()=>{
 const saved=fixture({saved:'dark',control:false});assert.equal(saved.page.documentElement.dataset.theme,'dark');assert.equal(saved.meta.content,'#0a131d');
 const system=fixture({control:false});system.query.matches=true;system.events.system();assert.equal(system.page.documentElement.dataset.theme,'dark');
});
