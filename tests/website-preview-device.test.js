import test from 'node:test';
import assert from 'node:assert/strict';

const priorDocument=globalThis.document,priorWindow=globalThis.window;
globalThis.document={querySelector:()=>null,querySelectorAll:()=>[],getElementById:()=>null,addEventListener(){},createTreeWalker:()=>({nextNode:()=>null}),documentElement:{lang:'de',dataset:{},style:{}}};
globalThis.window={matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}})};
let site;
try{site=await import('../website/dist/site.js');}finally{globalThis.document=priorDocument;globalThis.window=priorWindow;}

test('device selection switches every example without losing the selected product tab',()=>{
 assert.equal(typeof site.bindPreviewDevice,'function');
 const group={hidden:true},panels=['desktop','mobile','desktop','mobile','desktop','mobile'].map(device=>({dataset:{previewDevicePanel:device},hidden:device==='mobile'}));
 const buttons=['desktop','mobile'].map(device=>({dataset:{previewDevice:device},attributes:{},addEventListener(event,callback){this[event]=callback;},setAttribute(name,value){this.attributes[name]=value;}}));
 const page={querySelector:()=>group,querySelectorAll:selector=>selector==='[data-preview-device]'?buttons:panels};
 site.bindPreviewDevice(page);assert.equal(group.hidden,false);buttons[1].click();
 assert.deepEqual(panels.map(panel=>panel.hidden),[true,false,true,false,true,false]);assert.equal(buttons[1].attributes['aria-pressed'],'true');assert.equal(buttons[0].attributes['aria-pressed'],'false');
 buttons[0].click();assert.deepEqual(panels.map(panel=>panel.hidden),[false,true,false,true,false,true]);
});

test('pages without device controls keep their existing content untouched',()=>{
 assert.equal(typeof site.bindPreviewDevice,'function');assert.doesNotThrow(()=>site.bindPreviewDevice({querySelector:()=>null}));
});
