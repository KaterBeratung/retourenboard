import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {createWorker as createNodeWorker} from 'tesseract.js';
import {sourceModule} from './helpers/source-module.js';

const ocr=existsSync(new URL('../frontend/src/serial-ocr.ts',import.meta.url))
  ?await sourceModule("export * from './frontend/src/serial-ocr.ts';") :{};
function session(options){assert.equal(typeof ocr.createSerialOcrSession,'function');return ocr.createSerialOcrSession(options);}
const canvas={width:800,height:500};
const tick=()=>new Promise(setImmediate);
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function line(text,y,confidence=91,x=30){return {text,confidence,bbox:{x0:x,y0:y,x1:x+text.length*14,y1:y+24},words:[]};}
function page(lines,text=lines.map(l=>l.text).join('\n')){return {jobId:'fixture',data:{text,confidence:83,blocks:[{text,confidence:83,bbox:{x0:0,y0:0,x1:800,y1:500},paragraphs:[{text,confidence:83,lines}]}]}};}
function worker(recognize=async()=>page([line('SN: 00ABC12',40)])){
  const state={terminated:0,parameters:[],reads:0};
  const instance={async setParameters(parameters){state.parameters.push(parameters);},async recognize(image,options,output){state.reads++;return recognize(image,options,output);},terminate(){state.terminated++;return Promise.resolve();}};
  return {instance,state};
}

test('OCR loads only when a canvas is read and supplies every worker asset from the local server',async()=>{
  let creates=0;const w=worker();
  const s=session({createWorker:async(langs,oem,options)=>{
    creates++;assert.deepEqual(langs,['eng','deu']);assert.equal(oem,1);
    assert.equal(options.workerPath,'/vendor/ocr/worker.min.js');assert.equal(options.corePath,'/vendor/ocr/core');assert.equal(options.langPath,'/vendor/ocr/lang');
    assert.equal(options.workerBlobURL,false);assert.equal(options.cacheMethod,'none');assert.equal(options.gzip,true);
    return w.instance;
  }});
  assert.equal(creates,0);assert.deepEqual(await s.read(canvas),[{value:'00ABC12',confidence:91}]);s.stop();assert.equal(w.state.terminated,1);
});
test('structured OCR keeps exact case and leading zeros, associates line confidence, and excludes model and prose',async()=>{
  const w=worker(async()=>page([line('SN: 00aBc12',40,52),line('Serial number: 00001234',100,98),line('Model: XPS9310',170,99),line('16/256GB',220,98),line('Please return the product to us.',280,95),line('Serial number: see product label',330,95)]));
  const s=session({createWorker:async()=>w.instance});
  assert.deepEqual(await s.read(canvas),[{value:'00aBc12',confidence:52},{value:'00001234',confidence:98}]);s.stop();
});
test('OCR word positions retain separate sticker columns instead of merging their serial labels',async()=>{
  const l=line('SN: 00ABC12 SN: 00DEF34',40,86);l.words=[{text:'SN:',confidence:90,bbox:{x0:30,y0:40,x1:70,y1:64}},{text:'00ABC12',confidence:90,bbox:{x0:78,y0:40,x1:176,y1:64}},{text:'SN:',confidence:80,bbox:{x0:400,y0:40,x1:440,y1:64}},{text:'00DEF34',confidence:80,bbox:{x0:448,y0:40,x1:546,y1:64}}];
  const w=worker(async()=>page([l]));const s=session({createWorker:async()=>w.instance});
  assert.deepEqual(await s.read(canvas),[{value:'00ABC12',confidence:86},{value:'00DEF34',confidence:86}]);s.stop();
});
test('plain text fallback uses the serial parser and never turns arbitrary uppercase prose into serials',async()=>{
  const w=worker(async()=>({data:{text:'SN: 00ABC12\nTHANK YOU\nModel: XPS9310\nSerial number: 00004567',confidence:73,blocks:null}}));const s=session({createWorker:async()=>w.instance});
  assert.deepEqual(await s.read(canvas),[{value:'00ABC12',confidence:73},{value:'00004567',confidence:73}]);s.stop();
});
test('sequential PDF pages reuse one configured worker and ask for structured text in one OCR pass',async()=>{
  let creates=0;const w=worker(async(image,options,output)=>{assert.equal(image,canvas);assert.deepEqual(options,{});assert.deepEqual(output,{blocks:true,text:true});return page([line('SN: 00ABC12',40)]);});
  const s=session({createWorker:async()=>{creates++;return w.instance;}});
  await s.read(canvas);await s.read(canvas);assert.equal(creates,1);assert.equal(w.state.reads,2);
  assert.equal(w.state.parameters.length,1);assert.equal(w.state.parameters[0].tessedit_pageseg_mode,'11');assert.equal(w.state.parameters[0].user_defined_dpi,'300');assert.equal(w.state.parameters[0].preserve_interword_spaces,'1');s.stop();
});
test('stop immediately settles a read waiting for worker creation and terminates that late worker',async()=>{
  const ready=deferred(),w=worker();const s=session({createWorker:()=>ready.promise});const pending=s.read(canvas);await tick();s.stop();
  assert.equal(await Promise.race([pending,tick().then(()=> 'still pending')]),null);
  ready.resolve(w.instance);await tick();assert.equal(w.state.terminated,1);assert.equal(w.state.reads,0);s.stop();assert.equal(w.state.terminated,1);
});
test('stop aborts the worker creation signal immediately while the SDK has not returned a worker handle',async()=>{
  const ready=deferred();let signal;const w=worker();
  const s=session({createWorker:(langs,oem,options)=>{signal=options.signal;return ready.promise;}});const pending=s.read(canvas);await tick();
  assert.ok(signal instanceof AbortSignal);assert.equal(signal.aborted,false);s.stop();assert.equal(signal.aborted,true);assert.equal(await pending,null);
  ready.resolve(w.instance);await tick();assert.equal(w.state.terminated,1);
});
test('stop settles pending recognition even if termination does not settle the OCR library promise',async()=>{
  const result=deferred(),w=worker(()=>result.promise),progress=[];let options;
  const s=session({createWorker:async(langs,oem,provided)=>{options=provided;return w.instance;},onProgress:n=>progress.push(n)});
  const pending=s.read(canvas);await tick();options.logger({status:'recognizing text',progress:.5});assert.ok(progress.includes(.5));s.stop();
  assert.equal(await Promise.race([pending,tick().then(()=> 'still pending')]),null);const before=progress.length;
  options.logger({status:'recognizing text',progress:1});result.resolve(page([line('SN: STALE123',40)]));await tick();
  assert.equal(progress.length,before);assert.equal(w.state.terminated,1);
});
test('a newer image cancels an overlapping read and cannot reuse the busy worker or deliver its late result',async()=>{
  const oldResult=deferred(),old=worker(()=>oldResult.promise),fresh=worker(async()=>page([line('SN: 00NEW12',40)]));let creates=0;
  const s=session({createWorker:async()=>++creates===1?old.instance:fresh.instance});const pending=s.read(canvas);await tick();
  assert.deepEqual(await s.read(canvas),[{value:'00NEW12',confidence:91}]);assert.equal(await pending,null);assert.equal(old.state.terminated,1);
  oldResult.resolve(page([line('SN: STALE123',40)]));await tick();assert.equal(fresh.state.terminated,0);s.stop();assert.equal(fresh.state.terminated,1);
});
test('auth or navigation invalidation suppresses recognition results and destroys the worker',async()=>{
  let current=true;const result=deferred(),w=worker(()=>result.promise);const s=session({createWorker:async()=>w.instance,isCurrent:()=>current});
  const pending=s.read(canvas);await tick();current=false;result.resolve(page([line('SN: STALE123',40)]));assert.equal(await pending,null);assert.equal(w.state.terminated,1);
});
test('a session already invalidated does not initialize OCR or produce progress',async()=>{
  let creates=0,updates=0;const s=session({createWorker:async()=>{creates++;return worker().instance;},isCurrent:()=>false,onProgress:()=>updates++});
  assert.equal(await s.read(canvas),null);assert.equal(creates,0);assert.equal(updates,0);
});
test('a current OCR failure rejects and releases the worker so a later retry starts cleanly',async()=>{
  const failed=worker(async()=>{throw new Error('recognition failed');}),fresh=worker();let creates=0;
  const s=session({createWorker:async()=>++creates===1?failed.instance:fresh.instance});await assert.rejects(s.read(canvas),/recognition failed/);assert.equal(failed.state.terminated,1);
  assert.deepEqual(await s.read(canvas),[{value:'00ABC12',confidence:91}]);assert.equal(creates,2);s.stop();
});
test('a duplicate serial keeps the lowest observed line confidence without changing its value',async()=>{
  const w=worker(async()=>page([line('SN: 00ABC12',40,97),line('SN: 00ABC12',100,35)]));const s=session({createWorker:async()=>w.instance});
  assert.deepEqual(await s.read(canvas),[{value:'00ABC12',confidence:35}]);s.stop();
});
test('confidence belongs to the exact serial token, not to another serial containing its prefix',async()=>{
  const w=worker(async()=>page([line('SN: 00ABC12',40,97),line('SN: 00ABC1234',100,35)]));const s=session({createWorker:async()=>w.instance});
  assert.deepEqual(await s.read(canvas),[{value:'00ABC12',confidence:97},{value:'00ABC1234',confidence:35}]);s.stop();
});
test('worker error notifications retain the read rejection without throwing an uncaught message callback error',async()=>{
  let options;const w=worker(async()=>{const error=new Error('OCR model unavailable');options.errorHandler(error);throw error;});
  const s=session({createWorker:async(langs,oem,provided)=>{options=provided;return w.instance;}});
  await assert.rejects(s.read(canvas),/OCR model unavailable/);assert.equal(w.state.terminated,1);
});
test('the real local OCR engine reads printed serials without barcodes and preserves leading zeros',async()=>{
  // A synthetic Arial label rendered onto a white bitmap. The compressed PGM
  // is self-contained and contains no user document, barcode, or product photo.
  const image=gunzipSync(Buffer.from('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','base64'));
  const s=session({createWorker:(languages,oem,options)=>createNodeWorker(languages,oem,{
    ...options,
    workerPath:fileURLToPath(new URL('../node_modules/tesseract.js/src/worker-script/node/index.js',import.meta.url)),
    langPath:fileURLToPath(new URL('../public/vendor/ocr/lang/',import.meta.url)),
    errorHandler:()=>{},
  })});
  try{
    const result=await s.read(image);assert.deepEqual(result.map(candidate=>candidate.value),['00ABC12','00004567']);
    assert.ok(result.every(candidate=>candidate.confidence>=70&&candidate.confidence<=100));
  }finally{s.stop();}
});
