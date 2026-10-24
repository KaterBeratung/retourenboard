import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {getEventListeners} from 'node:events';

const builderPath=new URL('../scripts/build-ocr.mjs',import.meta.url);
const builder=existsSync(builderPath)?await import(builderPath):null;
const tick=()=>new Promise(setImmediate);
let protocol;
class BrowserWorker{
  constructor(url){this.url=url;this.messages=[];this.terminated=0;protocol.workers.push(this);}
  postMessage(packet){
    this.messages.push(packet);
    if(packet.action===protocol.pending)return;
    queueMicrotask(()=>{
      if(this.terminated)return;
      this.onmessage?.({data:{workerId:packet.workerId,jobId:packet.jobId,action:packet.action,status:packet.action===protocol.failure?'reject':'resolve',data:packet.action===protocol.failure?'local OCR initialization failed':{text:'SN: 00ABC12',blocks:null,confidence:90}}});
    });
  }
  terminate(){this.terminated++;}
}
const originals={Worker:globalThis.Worker,window:globalThis.window,document:globalThis.document,self:globalThis.self};
globalThis.Worker=BrowserWorker;globalThis.window={location:{href:'https://retourenboard.test/'}};globalThis.document={};globalThis.self=globalThis;
const generated=builder?await builder.buildLocalOcr({write:false}):null;
const source=generated?.outputFiles[0].text??readFileSync(new URL('../public/vendor/ocr/tesseract.esm.min.js',import.meta.url),'utf8');
const imported=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const sdk=builder?imported:imported.default??imported;
test.after(()=>{for(const [key,value] of Object.entries(originals)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}});
function setup(){protocol={workers:[],pending:null,failure:null};return protocol;}
function options(signal){return {workerPath:'/vendor/ocr/worker.min.js',corePath:'/vendor/ocr/core',langPath:'/vendor/ocr/lang',workerBlobURL:false,cacheMethod:'none',gzip:true,logger:()=>{},errorHandler:()=>{},signal};}
async function outcome(promise){return Promise.race([promise.then(value=>({value}),error=>({error})),tick().then(()=>({pending:true}))]);}

for(const stage of ['loadLanguage','initialize'])test(`the generated browser SDK rejects ${stage} errors and immediately terminates its native worker`,async()=>{
  const state=setup();state.failure=stage;
  const result=await outcome(sdk.createWorker(['eng','deu'],1,options()));
  try{
    assert.equal(result.pending,undefined,'worker creation must settle after a language/engine failure');assert.equal(result.error,'local OCR initialization failed');
    assert.equal(state.workers.length,1);assert.equal(state.workers[0].terminated,1);
  }finally{for(const worker of state.workers)if(!worker.terminated)worker.terminate();}
});
test('aborting model loading rejects creation and releases the raw worker before initialization returns',async()=>{
  const state=setup();state.pending='loadLanguage';const controller=new AbortController();
  const pending=sdk.createWorker(['eng','deu'],1,options(controller.signal));await tick();controller.abort();
  const result=await outcome(pending);
  try{assert.equal(state.workers[0].terminated,1);assert.equal(result.error?.name,'AbortError');assert.equal(result.pending,undefined);}
  finally{for(const worker of state.workers)if(!worker.terminated)worker.terminate();}
});
test('an already aborted signal cannot spawn a native worker or load language data',async()=>{
  const state=setup();const controller=new AbortController();controller.abort();const result=await outcome(sdk.createWorker(['eng','deu'],1,options(controller.signal)));
  try{assert.equal(result.error?.name,'AbortError');assert.equal(state.workers.length,0);}
  finally{for(const worker of state.workers)if(!worker.terminated)worker.terminate();}
});
test('aborting recognition rejects the outstanding job and terminates its raw browser worker',async()=>{
  const state=setup(),controller=new AbortController();const worker=await sdk.createWorker(['eng','deu'],1,options(controller.signal));state.pending='recognize';
  const pending=worker.recognize(new Uint8Array([1,2,3]));await tick();controller.abort();const result=await outcome(pending);
  try{assert.equal(result.error?.name,'AbortError');assert.equal(state.workers[0].terminated,1);}
  finally{await worker.terminate();}
});
test('manual termination removes the abort hook so a later abort cannot terminate the raw worker twice',async()=>{
  const state=setup(),controller=new AbortController();const worker=await sdk.createWorker(['eng','deu'],1,options(controller.signal));
  assert.equal(getEventListeners(controller.signal,'abort').length,1);await worker.terminate();assert.equal(getEventListeners(controller.signal,'abort').length,0);controller.abort();
  assert.equal(state.workers[0].terminated,1);
});
test('the guarded OCR builder refuses a different Tesseract version',async()=>{
  assert.equal(typeof builder?.buildLocalOcr,'function');
  const root=mkdtempSync(join(tmpdir(),'retourenboard-ocr-version-'));
  try{const directory=join(root,'node_modules/tesseract.js');mkdirSync(directory,{recursive:true});writeFileSync(join(directory,'package.json'),JSON.stringify({version:'7.0.1'}));
    await assert.rejects(builder.buildLocalOcr({root,write:false}),/7\.0\.0/);
  }finally{rmSync(root,{recursive:true,force:true});}
});
test('the guarded OCR builder refuses unexpected upstream creation code before producing a bundle',async()=>{
  assert.equal(typeof builder?.buildLocalOcr,'function');
  const root=mkdtempSync(join(tmpdir(),'retourenboard-ocr-source-'));
  try{const directory=join(root,'node_modules/tesseract.js');mkdirSync(join(directory,'src'),{recursive:true});writeFileSync(join(directory,'package.json'),JSON.stringify({version:'7.0.0'}));writeFileSync(join(directory,'src/createWorker.js'),'unexpected upstream worker code');
    await assert.rejects(builder.buildLocalOcr({root,write:false}),/upstream|source|Quellcode/i);
  }finally{rmSync(root,{recursive:true,force:true});}
});
