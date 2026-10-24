import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {sourceModule} from './helpers/source-module.js';

const scanner=existsSync(new URL('../frontend/src/pdf-serial-scan.ts',import.meta.url))
  ?await sourceModule("export * from './frontend/src/pdf-serial-scan.ts';") :{};
function item(str,x,y,{height=7,width=str.length*3.7,hasEOL=false}={}){
  return {str,dir:'ltr',width,height,transform:[height,0,0,height,x,y],fontName:'fixture',hasEOL};
}
function extract(pages){assert.equal(typeof scanner.extractPdfSerialCandidates,'function');return scanner.extractPdfSerialCandidates(pages);}
function session(options){assert.equal(typeof scanner.createPdfSerialSession,'function');return scanner.createPdfSerialSession(options);}
const pdfFile=(overrides={})=>({name:'labels.pdf',type:'application/pdf',size:200,arrayBuffer:async()=>new TextEncoder().encode('%PDF-1.7\nfixture').buffer,...overrides});
const page=(items=[])=>({getTextContent:async()=>({items}),cleanup(){}});
function renderer(pages){
  const state={destroyed:0,arguments:null};
  const lib={GlobalWorkerOptions:{},getDocument(options){state.arguments=options;return {promise:Promise.resolve({numPages:pages.length,getPage:async n=>pages[n-1]}),destroy(){state.destroyed++;return Promise.resolve();}};}};
  return {lib,state};
}

test('positioned sticker text yields all 30 serials in reading order, excluding product and specifications',()=>{
  const expected=['01ABC23','02ABC23','03ABC23','04ABC23','05ABC23','06ABC23','07ABC23','08ABC23','09ABC23','10ABC23','11ABC23','12ABC23','13ABC23','14ABC23','15ABC23','16ABC23','17ABC23','18ABC23','19ABC23','20ABC23','21ABC23','22ABC23','23ABC23','24ABC23','25ABC23','26ABC23','27ABC23','28ABC23','29ABC23','30ABC23'];
  const items=expected.flatMap((value,index)=>{const x=30+(index%4)*137.25,y=775-Math.floor(index/4)*59.25;return [item('Acme Desktop U5 16/256GB',x,y,{hasEOL:true,width:82}),item(value,x,y-6.75),item(' ',x+28,y-6.75,{height:0,width:145})];});
  // A PDF's stream ordering need not match its visible reading order.
  assert.deepEqual(extract([{pageNumber:1,items:items.reverse()}]).map(c=>c.value),expected);
});
test('explicit labels accept numeric serials and preserve leading zeros while deduplicating page references',()=>{
  const result=extract([{pageNumber:1,items:[item('Seriennummer: 00001234',20,700),item('Serial number:',20,680),item('SN-A001',20,670)]},{pageNumber:2,items:[item('S/N: 00001234',20,700),item('Service Tag: B1C2D34',20,680)]}]);
  assert.deepEqual(result.map(c=>({value:c.value,pages:c.pages,source:c.source})),[{value:'00001234',pages:[1,2],source:'label'},{value:'SN-A001',pages:[1],source:'label'},{value:'B1C2D34',pages:[2],source:'label'}]);
});
test('separate inline fragments and columns remain distinct candidates',()=>{
  const result=extract([{pageNumber:3,items:[item('Serial',20,700,{width:20}),item('number:',43,700,{width:27}),item('00A1234',74,700),item('SN:',200,700,{width:12}),item('00B5678',216,700)]}]);
  assert.deepEqual(result.map(c=>c.value),['00A1234','00B5678']);
});
test('model, order, date and EAN fields cannot become unlabelled serial candidates',()=>{
  const result=extract([{pageNumber:1,items:[item('Model:',20,700),item('XPS9310',20,690),item('Order:',20,660),item('ORD1234',20,650),item('Datum: 2026-10-13',20,620),item('EAN: 4006381333931',20,600),item('16/256GB',20,580),item('256GB',20,560),item('Dell',20,540),item('Optiplex',20,520),item('U5',20,500)]}]);
  assert.deepEqual(result,[]);
});
test('an ambiguous standalone serial list keeps both candidates and a repeated model is excluded',()=>{
  const result=extract([{pageNumber:1,items:[item('00ABC12',20,700),item('00DEF34',20,680),item('XPS9310',200,700),item('XPS9310',200,680)]}]);
  assert.deepEqual(result.map(c=>c.value),['00ABC12','00DEF34']);
});
test('no serial is inferred from prose, dates or a lone unidentified model code',()=>{
  assert.deepEqual(extract([{pageNumber:1,items:[item('Please return the product to us.',20,700),item('2026-10-13',20,680),item('XPS9310',20,660)]}]),[]);
});
test('plural serial headings support explicit lists without suggesting the heading word',()=>{
  const result=extract([{pageNumber:1,items:[item('Serial numbers: 00001234, 00ABC12',20,700),item('Seriennummern: 00DEF34',20,680),item('Serial No.: 00GHI56',20,660)]}]);
  assert.deepEqual(result.map(c=>c.value),['00001234','00ABC12','00DEF34','00GHI56']);
});
test('a serial heading above product prose does not select brand, model or specification tokens',()=>{
  const result=extract([{pageNumber:1,items:[item('Serial numbers',20,700),item('Dell Optiplex U5 16/256GB',20,690),item('Serial number: see product label',20,650),item('Seriennummer: 00ABC12 Produkt: Dell',20,620)]}]);
  assert.deepEqual(result.map(c=>c.value),['00ABC12']);
});
test('PDF processing loads bytes locally and releases its document after returning every candidate',async()=>{
  const r=renderer([page([item('SN: 00001234',20,700),item('SN: 00ABC12',20,680)])]);
  const s=session({loadPdfJs:async()=>r.lib});const result=await s.read(pdfFile());
  assert.deepEqual(result.candidates.map(c=>c.value),['00001234','00ABC12']);assert.equal(result.pagesRead,1);assert.equal(result.hasText,true);
  assert.ok(r.state.arguments.data instanceof Uint8Array);assert.equal(r.state.arguments.url,undefined);assert.equal(r.state.arguments.isEvalSupported,false);assert.equal(r.state.arguments.enableXfa,false);assert.match(r.state.arguments.cMapUrl,/^\/vendor\/pdfjs\//);assert.equal(r.state.destroyed,1);
});
test('size and type checks prevent PDF library load and report actionable error codes',async()=>{
  let loads=0;const s=session({loadPdfJs:async()=>{loads++;throw new Error('must not load');}});
  await assert.rejects(s.read(pdfFile({size:20*1024*1024+1})),e=>e.code==='size');
  await assert.rejects(s.read(pdfFile({type:'image/png',name:'photo.png'})),e=>e.code==='type');
  assert.equal(loads,0);
});
test('password and corrupted documents are distinguished and destroyed',async()=>{
  for(const [name,code] of [['PasswordException','password'],['InvalidPDFException','invalid']]){
    let destroyed=0;const s=session({loadPdfJs:async()=>({GlobalWorkerOptions:{},getDocument:()=>({promise:Promise.reject(Object.assign(new Error(name),{name})),destroy(){destroyed++;}})})});
    await assert.rejects(s.read(pdfFile()),e=>e.code===code);assert.equal(destroyed,1);
  }
});
test('close and a new file destroy pending documents and suppress stale results',async()=>{
  let ready,loads=0,destroyed=0;const lib={GlobalWorkerOptions:{},getDocument(){const first=++loads===1;return {promise:first?new Promise(resolve=>ready=resolve):Promise.resolve({numPages:1,getPage:async()=>page([item('SN: CURRENT1',20,700)])}),destroy(){destroyed++;}};}};
  const s=session({loadPdfJs:async()=>lib});const stale=s.read(pdfFile());await new Promise(setImmediate);
  const latest=await s.read(pdfFile());ready({numPages:1,getPage:async()=>page([item('SN: STALE1',20,700)])});
  assert.equal(await stale,null);assert.deepEqual(latest.candidates.map(c=>c.value),['CURRENT1']);assert.equal(destroyed,2);
  const r=renderer([page([item('SN: CLOSED1',20,700)])]);let finishRead;const closed=session({loadPdfJs:async()=>r.lib});const pending=closed.read(pdfFile({arrayBuffer:()=>new Promise(resolve=>finishRead=resolve)}));closed.stop();finishRead(new TextEncoder().encode('%PDF-1.7').buffer);assert.equal(await pending,null);assert.equal(r.state.arguments,null);
});
test('authentication changes prevent a late extraction result from being delivered',async()=>{
  let resolveText,current=true;const r=renderer([{getTextContent:()=>new Promise(resolve=>resolveText=resolve),cleanup(){}}]);
  const s=session({loadPdfJs:async()=>r.lib,isCurrent:()=>current});const pending=s.read(pdfFile());await new Promise(setImmediate);current=false;resolveText({items:[item('SN: OLD1234',20,700)]});assert.equal(await pending,null);assert.equal(r.state.destroyed,1);
});
test('image-only PDFs use bounded barcode rendering and report the code as a barcode candidate',async()=>{
  const canvas={width:0,height:0,getContext:()=>({})};let rendering;
  const p={...page(),getViewport:({scale})=>({width:10000*scale,height:8000*scale}),render(options){rendering={width:canvas.width,height:canvas.height,options};return {promise:Promise.resolve(),cancel(){}};}};
  const r=renderer([p]),s=session({loadPdfJs:async()=>r.lib,createCanvas:()=>canvas,decodeBarcode:()=> '0012345678905'});const result=await s.read(pdfFile());
  assert.deepEqual(result.candidates,[{value:'0012345678905',pages:[1],source:'barcode'}]);assert.equal(result.hasText,false);assert.ok(rendering.width<=3200&&rendering.height<=3200&&rendering.width*rendering.height<=8_000_000);assert.equal(canvas.width,0);assert.equal(canvas.height,0);
});
test('a normal 300 dpi scanned PDF keeps its source image while bounding the rendered canvas',async()=>{
  // PDF.js drops (rather than resizes) source images above maxImageSize.
  const sourcePixels=2480*3508,canvas={width:0,height:0,hasImage:false,getContext:()=>({})};let outputWidth,outputHeight;
  const lib={GlobalWorkerOptions:{},getDocument(options){return {promise:Promise.resolve({numPages:1,getPage:async()=>({...page(),getViewport:({scale})=>({width:595*scale,height:842*scale}),render(){canvas.hasImage=options.maxImageSize===undefined||options.maxImageSize===-1||options.maxImageSize>=sourcePixels;outputWidth=canvas.width;outputHeight=canvas.height;return {promise:Promise.resolve(),cancel(){}};}})}),destroy(){}};}};
  const result=await session({loadPdfJs:async()=>lib,createCanvas:()=>canvas,decodeBarcode:()=>canvas.hasImage?'SN-300DPI':null}).read(pdfFile());
  assert.deepEqual(result.candidates,[{value:'SN-300DPI',pages:[1],source:'barcode'}]);assert.ok(outputWidth<=3200&&outputHeight<=3200&&outputWidth*outputHeight<=8_000_000);
});
test('closing during barcode rendering cancels the render and cannot decode late pixels',async()=>{
  let finish,cancelled=0,decoded=0;const p={...page(),getViewport:({scale})=>({width:100*scale,height:100*scale}),render(){return {promise:new Promise(resolve=>finish=resolve),cancel(){cancelled++;}};}};
  const r=renderer([p]),s=session({loadPdfJs:async()=>r.lib,createCanvas:()=>({width:0,height:0,getContext:()=>({})}),decodeBarcode(){decoded++;return 'STALE';}});const pending=s.read(pdfFile());await new Promise(setImmediate);s.stop();finish();assert.equal(await pending,null);assert.equal(cancelled,1);assert.equal(decoded,0);assert.equal(r.state.destroyed,1);
});
test('large documents process only the first 20 pages and expose partial processing',async()=>{
  let reads=0;const r=renderer(Array.from({length:22},()=>({getTextContent:async()=>{reads++;return {items:[]};},cleanup(){}})));
  const result=await session({loadPdfJs:async()=>r.lib}).read(pdfFile());assert.equal(reads,20);assert.equal(result.pagesRead,20);assert.equal(result.totalPages,22);assert.equal(result.truncated,true);assert.deepEqual(result.candidates,[]);
});
function imagePage(items=[]){return {...page(items),getViewport:({scale})=>({width:595*scale,height:842*scale}),render(){return {promise:Promise.resolve(),cancel(){}};}};}
test('header text cannot suppress barcode detection in a scanned PDF',async()=>{
 const canvas={width:0,height:0,getContext:()=>({})},r=renderer([imagePage([item('Warehouse copy',20,800)])]);
 const result=await session({loadPdfJs:async()=>r.lib,createCanvas:()=>canvas,decodeBarcode:()=> '0000-SN-99'}).read(pdfFile());
 assert.deepEqual(result.candidates,[{value:'0000-SN-99',pages:[1],source:'barcode'}]);
});
test('mixed text and multiple image barcodes are combined without duplicates or changing serial values',async()=>{
 const canvas={width:0,height:0,getContext:()=>({})},r=renderer([imagePage([item('SN: 00ABC12',20,700)])]);
 const result=await session({loadPdfJs:async()=>r.lib,createCanvas:()=>canvas,decodeBarcode:async()=>['00ABC12','00004567','sN-002']}).read(pdfFile());
 assert.deepEqual(result.candidates,[{value:'00ABC12',pages:[1],source:'label'},{value:'00004567',pages:[1],source:'barcode'},{value:'sN-002',pages:[1],source:'barcode'}]);
 assert.equal(canvas.width,0);assert.equal(r.state.destroyed,1);
});
test('closing while asynchronous barcode analysis is pending cannot deliver a stale PDF result',async()=>{
 let finish;const canvas={width:0,height:0,getContext:()=>({})},r=renderer([imagePage()]);
 const s=session({loadPdfJs:async()=>r.lib,createCanvas:()=>canvas,decodeBarcode:()=>new Promise(resolve=>finish=resolve)});
 const pending=s.read(pdfFile());await new Promise(setImmediate);s.stop();finish(['STALE1']);
 assert.equal(await pending,null);assert.equal(canvas.width,0);assert.equal(r.state.destroyed,1);
});
test('printed serials in scanned PDF pages are read locally as reviewable OCR candidates',async()=>{
 const canvas={width:0,height:0,getContext:()=>({})},r=renderer([imagePage([item('Copy',20,800)])]);
 const result=await session({loadPdfJs:async()=>r.lib,createCanvas:()=>canvas,recognizeText:async()=>[{value:'0000abc123',confidence:72}]}).read(pdfFile());
 assert.deepEqual(result.candidates,[{value:'0000abc123',pages:[1],source:'ocr',confidence:72}]);
});
