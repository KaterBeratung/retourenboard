import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceModule} from './helpers/source-module.js';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const preview=await sourceModule("export * from './frontend/src/scan-preview.ts';");
test('multiple candidate selection starts empty and transfers only explicitly reviewed exact values',()=>{
  assert.equal(typeof preview.createScanCandidateSelection,'function');
  const selection=preview.createScanCandidateSelection();selection.replace([{value:'00AbC12'},{value:'00000045'},{value:'0000XYZ'}]);
  assert.deepEqual(selection.values(),[]);selection.choose(2,true);selection.choose(0,true);
  assert.deepEqual(selection.values(),['00AbC12','0000XYZ']);selection.choose(0,false);assert.deepEqual(selection.values(),['0000XYZ']);
});
test('replacing or clearing candidates drops old choices and ignores stale or invalid indexes',()=>{
  assert.equal(typeof preview.createScanCandidateSelection,'function');
  const selection=preview.createScanCandidateSelection();selection.replace([{value:'OLD1'},{value:'OLD2'}]);selection.choose(1,true);
  selection.replace([{value:'NEW1'}]);assert.deepEqual(selection.values(),[]);
  for(const index of [1,-1,NaN,.5,500])selection.choose(index,true);assert.deepEqual(selection.values(),[]);
  selection.choose(0,true);selection.clear();assert.deepEqual(selection.values(),[]);
});
test('selected values never truncate overlong serials and returned arrays cannot mutate review state',()=>{
  assert.equal(typeof preview.createScanCandidateSelection,'function');
  const selection=preview.createScanCandidateSelection(),overlong='0'.repeat(251);selection.replace([{value:overlong},{value:'Case-001'},{value:'Case-001'}]);
  selection.choose(0,true);selection.choose(1,true);selection.choose(2,true);
  const result=selection.values();assert.deepEqual(result,[overlong,'Case-001']);result.length=0;assert.deepEqual(selection.values(),[overlong,'Case-001']);
});
// PDF.js and browser DOM/media APIs are the boundaries. The scanner dialog,
// parsing, candidate selection and callback/authentication logic stay real.
const compiled=await build({stdin:{contents:"export {openScanner,stopScanner} from './frontend/src/scan-labels.ts';",resolveDir:fileURLToPath(new URL('../',import.meta.url))},bundle:true,write:false,platform:'node',format:'esm',external:['/vendor/ocr/*'],plugins:[
  {name:'pdf-library-fixture',setup(builder){builder.onResolve({filter:/^\/vendor\/pdfjs\/pdf\.min\.mjs$/},args=>({path:args.path,namespace:'pdf-fixture'}));builder.onLoad({filter:/.*/,namespace:'pdf-fixture'},()=>({contents:'export const GlobalWorkerOptions={};export const getDocument=()=>globalThis.__scanMultiplePdf.getDocument();',loader:'js'}));}},
  {name:'shared-source-layout',setup(builder){builder.onResolve({filter:/^\.\.\/shared\//},args=>args.importer.includes('frontend')?{path:fileURLToPath(new URL('../backend/src/shared/'+args.path.slice('../shared/'.length),import.meta.url))}:null);}},
]});
const scanner=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text+'\n//# sourceURL=scan-multiple-controller-test.mjs\n').toString('base64'));
function scannerDom(t){
  const old={document:globalThis.document,window:globalThis.window,pdf:globalThis.__scanMultiplePdf,navigator:Object.getOwnPropertyDescriptor(globalThis,'navigator')},nodes={};
  const names=['video','value','status','start','stop','camera-idle','close','use','photo','pdf','pdf-status','pdf-results','pdf-list','pdf-cancel','pdf-name','pdf-count','pdf-info','values-use','selected-count','original','original-stage','original-marks','original-status','crop-controls','crop-frame','original-page','page-number','page-total'];
  for(const name of names)nodes[`[data-scan-${name}]`]={value:'',hidden:false,disabled:false,dataset:{},classList:{add(){},remove(){}},pause(){},focus(){},scrollIntoView(){},addEventListener(event,fn){this[event]=fn;}};
  const context={drawImage(){},fillRect(){},getImageData(){throw Error('No barcode pixels in this text fixture');}},canvas=()=>({width:0,height:0,getContext:()=>context});nodes['[data-scan-original-canvas]']=canvas();
  const dialog={open:false,events:{},classList:{add(){},remove(){}},setAttribute(){},showModal(){this.open=true;},close(){this.open=false;this.events.close?.();},remove(){this.removed=true;},addEventListener(event,fn){this.events[event]=fn;},querySelector(selector){if(selector==='[data-scan-values-use]'&&!this.innerHTML.includes('data-scan-values-use'))return null;return nodes[selector]??null;},querySelectorAll(){return [];}};
  globalThis.document={createElement:kind=>kind==='canvas'?canvas():dialog,body:{append(){}},addEventListener(){},removeEventListener(){},hidden:false};globalThis.window={addEventListener(){},removeEventListener(){}};
  Object.defineProperty(globalThis,'navigator',{value:{mediaDevices:{}},configurable:true});
  const item=(str,y)=>({str,width:100,height:10,transform:[10,0,0,10,20,y]});
  globalThis.__scanMultiplePdf={getDocument:()=>({promise:Promise.resolve({numPages:1,getPage:async()=>({getTextContent:async()=>({items:[item('SN: 00AbC12',100),item('SN: 00004567',80)]}),getViewport:({scale})=>({width:100*scale,height:100*scale}),render:()=>({promise:Promise.resolve(),cancel(){}}),cleanup(){}})}),destroy(){}})};
  t.after(()=>{scanner.stopScanner();for(const key of ['document','window']){if(old[key]===undefined)delete globalThis[key];else globalThis[key]=old[key];}if(old.pdf===undefined)delete globalThis.__scanMultiplePdf;else globalThis.__scanMultiplePdf=old.pdf;if(old.navigator)Object.defineProperty(globalThis,'navigator',old.navigator);else delete globalThis.navigator;});
  const choose=index=>{const input={dataset:{scanChoice:String(index)},checked:true,closest(){return this;}};nodes['[data-scan-pdf-list]'].onchange({target:input});};
  async function read(){const input=nodes['[data-scan-pdf]'];input.files=[{name:'codes.pdf',type:'application/pdf',size:100,arrayBuffer:async()=>new TextEncoder().encode('%PDF-1.7\nfixture').buffer}];await input.onchange({target:input});}
  return {dialog,nodes,choose,read};
}
test('an opting-in scanner transfers checked PDF values only after an explicit batch click',async t=>{
  const d=scannerDom(t),single=[],batch=[],ctx={unlocked:true,authGeneration:1,session:{user:{id:1}}};
  scanner.openScanner(ctx,{onScan:value=>single.push(value),onValues:values=>batch.push(values)});await d.read();
  assert.deepEqual(batch,[]);assert.equal(d.nodes['[data-scan-values-use]'].disabled,true);assert.doesNotMatch(d.nodes['[data-scan-pdf-list]'].innerHTML,/data-scan-choice="\d+"[^>]*checked/);
  d.choose(1);assert.equal(d.nodes['[data-scan-values-use]'].disabled,false);assert.deepEqual(batch,[]);
  d.nodes['[data-scan-values-use]'].onclick();await Promise.resolve();assert.deepEqual(batch,[['00004567']]);assert.deepEqual(single,[]);assert.equal(d.dialog.removed,true);
});
test('batch adoption is suppressed when authentication changes before its deferred callback',async t=>{
  const d=scannerDom(t),batch=[],ctx={unlocked:true,authGeneration:1,session:{user:{id:1}}};scanner.openScanner(ctx,{onScan(){},onValues:values=>batch.push(values)});await d.read();d.choose(0);
  d.nodes['[data-scan-values-use]'].onclick();ctx.authGeneration++;await Promise.resolve();assert.deepEqual(batch,[]);assert.equal(d.dialog.removed,true);
});
test('legacy scanner callers keep a single PDF pick and have no batch control',async t=>{
  const d=scannerDom(t),values=[],ctx={unlocked:true,authGeneration:1,session:{user:{id:1}}};scanner.openScanner(ctx,{onScan:value=>values.push(value)});await d.read();
  assert.doesNotMatch(d.dialog.innerHTML,/data-scan-values-use/);assert.doesNotMatch(d.nodes['[data-scan-pdf-list]'].innerHTML,/data-scan-choice/);
  const button={dataset:{scanPdfCandidate:'0'},closest:selector=>selector==='[data-scan-pdf-candidate]'?button:null};d.nodes['[data-scan-pdf-list]'].onclick({target:button});await Promise.resolve();assert.deepEqual(values,['00AbC12']);
});
