import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {sourceModule} from './helpers/source-module.js';

const preview=existsSync(new URL('../frontend/src/scan-preview.ts',import.meta.url))?await sourceModule("export * from './frontend/src/scan-preview.ts';"):{};
const ocr=await sourceModule("export * from './frontend/src/serial-ocr.ts';");
const pdf=await sourceModule("export * from './frontend/src/pdf-serial-scan.ts';");
test('crop bounds remain inside the original and reject an empty or invalid selection',()=>{
  assert.equal(typeof preview.normalizeScanRegion,'function');
  assert.deepEqual(preview.normalizeScanRegion({left:.8,top:-.2,width:.7,height:.6}),{left:.8,top:0,width:.2,height:.6});
  assert.equal(preview.normalizeScanRegion({left:0,top:0,width:0,height:.6}),null);
  assert.equal(preview.normalizeScanRegion({left:NaN,top:0,width:1,height:1}),null);
});
test('high resolution previews and crop scans retain detail within the existing pixel budget',()=>{
  assert.equal(typeof preview.scanCanvasSize,'function');
  assert.deepEqual(preview.scanCanvasSize(800,600),{width:800,height:600});
  const bounded=preview.scanCanvasSize(12000,10000);
  assert.ok(bounded.width<=3200&&bounded.height<=3200&&bounded.width*bounded.height<=8_000_000);
});
test('OCR locations project back through the selected crop without changing exact serial text',()=>{
  assert.equal(typeof preview.mapScanBounds,'function');
  assert.deepEqual(preview.mapScanBounds({left:20,top:10,width:40,height:20},200,100,{left:.2,top:.1,width:.5,height:.5}),{left:.25,top:.15,width:.1,height:.1});
});
test('OCR highlights only exact observed words and omits fabricated plain text coordinates',async()=>{
  const worker={setParameters:async()=>{},terminate(){},recognize:async()=>({data:{confidence:89,blocks:[{paragraphs:[{lines:[{text:'SN: 00aBc12',confidence:84,bbox:{x0:10,y0:20,x1:170,y1:40},words:[{text:'SN:',bbox:{x0:10,y0:20,x1:40,y1:40}},{text:'00aBc12',bbox:{x0:50,y0:20,x1:150,y1:40}}]}]}]}]}})};
  const session=ocr.createSerialOcrSession({createWorker:async()=>worker,includeBounds:true});
  assert.deepEqual(await session.read({width:200,height:100}),[{value:'00aBc12',confidence:84,bounds:[{left:50,top:20,width:100,height:20}]}]);session.stop();
  worker.recognize=async()=>({data:{text:'SN: 00aBc12',confidence:80}});
  const plain=ocr.createSerialOcrSession({createWorker:async()=>worker,includeBounds:true});
  assert.deepEqual(await plain.read({width:200,height:100}),[{value:'00aBc12',confidence:80}]);plain.stop();
});
test('PDF positions mark an entire exact serial item and never estimate a mixed label substring',()=>{
  const item=(str,x,width)=>({str,width,height:10,transform:[10,0,0,10,x,100]});
  const candidates=pdf.extractPdfSerialCandidates([{pageNumber:2,items:[item('SN:',10,20),item('00ABC12',35,50),item('SN: 00DEF34',180,85)]}],true);
  assert.deepEqual(candidates.map(row=>row.value),['00ABC12','00DEF34']);
  assert.deepEqual(candidates[0].locations,[{pageNumber:2,pdf:true,bounds:{left:35,top:98,width:50,height:10}}]);
  assert.equal(candidates[1].locations,undefined);
});
test('rotated, sheared and mirrored PDF text retains exact candidates without an invented highlight',()=>{
  for(const linear of [[0,10,-10,0],[10,2,0,10],[10,0,2,10],[-10,0,0,-10],[10,0,0,-10]]){
    const items=[{str:'SN:',width:20,height:10,transform:[10,0,0,10,170,100]},{str:'00ABC12',width:50,height:10,transform:[...linear,200,100]}];
    assert.deepEqual(pdf.extractPdfSerialCandidates([{pageNumber:3,items}],true),[{value:'00ABC12',pages:[3],source:'label'}]);
  }
});
const file={name:'original.pdf',type:'application/pdf',size:200,arrayBuffer:async()=>new TextEncoder().encode('%PDF-1.7\nfixture').buffer};
test('PDF original preview renders the selected page within bounds and frees it after delivery',async()=>{
  assert.equal(typeof pdf.createPdfPreviewSession,'function');
  const canvas={width:0,height:0,getContext:()=>({})};let selected,delivered,destroyed=0;
  const lib={GlobalWorkerOptions:{},getDocument:()=>({promise:Promise.resolve({numPages:3,getPage:async n=>{selected=n;return {getViewport:({scale})=>({width:595*scale,height:842*scale}),render:()=>({promise:Promise.resolve(),cancel(){}}),cleanup(){}};}}),destroy(){destroyed++;}})};
  const session=pdf.createPdfPreviewSession({loadPdfJs:async()=>lib,createCanvas:()=>canvas,onPreview:(image,page,total,viewport)=>{delivered={width:image.width,height:image.height,page,total,viewport};}});
  assert.equal(await session.read(file,2),true);assert.equal(selected,2);assert.equal(delivered.page,2);assert.equal(delivered.total,3);
  assert.ok(delivered.width<=3200&&delivered.height<=3200&&delivered.width*delivered.height<=8_000_000);assert.equal(canvas.width,0);assert.equal(canvas.height,0);assert.equal(destroyed,1);
});
test('PDF preview cancellation suppresses late pages and cancels the pending render',async()=>{
  assert.equal(typeof pdf.createPdfPreviewSession,'function');
  let resolve,cancelled=0,delivered=0,destroyed=0;
  const lib={GlobalWorkerOptions:{},getDocument:()=>({promise:Promise.resolve({numPages:1,getPage:async()=>({getViewport:({scale})=>({width:100*scale,height:100*scale}),render:()=>({promise:new Promise(yes=>resolve=yes),cancel(){cancelled++;}})})}),destroy(){destroyed++;}})};
  const session=pdf.createPdfPreviewSession({loadPdfJs:async()=>lib,createCanvas:()=>({width:0,height:0,getContext:()=>({})}),onPreview:()=>delivered++});
  const pending=session.read(file,1);await new Promise(setImmediate);session.stop();resolve();
  assert.equal(await pending,false);assert.equal(delivered,0);assert.equal(cancelled,1);assert.equal(destroyed,1);
});
test('closing a PDF preview settles its caller while local byte decoding is still pending',async()=>{
  let loads=0;
  const session=pdf.createPdfPreviewSession({loadPdfJs:async()=>{loads++;throw new Error('must not load');},onPreview:()=>assert.fail('cancelled preview')});
  const pending=session.read({...file,arrayBuffer:()=>new Promise(()=>{})});session.stop();
  assert.equal(await Promise.race([pending,new Promise(resolve=>setImmediate(()=>resolve('still pending')))]),false);
  assert.equal(loads,0);
});
function imageHeader(kind,width,height){
  const bytes=new Uint8Array(54),view=new DataView(bytes.buffer),word=(offset,text)=>bytes.set(new TextEncoder().encode(text),offset);
  if(kind==='png'){bytes.set([137,80,78,71,13,10,26,10]);view.setUint32(8,13);word(12,'IHDR');view.setUint32(16,width);view.setUint32(20,height);}
  if(kind==='jpeg'){bytes.set([255,216,255,192,0,17,8]);view.setUint16(7,height);view.setUint16(9,width);}
  if(kind==='webp'){word(0,'RIFF');view.setUint32(4,46,true);word(8,'WEBP');word(12,'VP8X');view.setUint32(16,10,true);for(let n=0;n<3;n++){bytes[24+n]=(width-1)>>>8*n;bytes[27+n]=(height-1)>>>8*n;}}
  if(kind==='bmp'){word(0,'BM');view.setUint32(14,40,true);view.setInt32(18,width,true);view.setInt32(22,-height,true);}
  if(kind==='avif'||kind==='heic'){view.setUint32(0,20);word(4,'ftyp');word(8,kind);word(16,'mif1');view.setUint32(20,20);word(24,'ispe');view.setUint32(32,width);view.setUint32(36,height);}
  return bytes;
}
const photoFile=(bytes,type='image/png')=>({name:'photo',type,size:bytes.length,slice:()=>({arrayBuffer:async()=>bytes.buffer})});
test('compressed image dimensions are checked for every supported container before decoding',()=>{
  assert.equal(typeof preview.readScanImageDimensions,'function');
  for(const kind of ['png','jpeg','webp','bmp','avif','heic'])assert.deepEqual(preview.readScanImageDimensions(imageHeader(kind,800,600)),{width:800,height:600});
  assert.equal(preview.readScanImageDimensions(new Uint8Array([1,2,3])),null);
});
test('a small compressed 256MP photo is rejected before creating a decoder or object URL',async()=>{
  assert.equal(typeof preview.createScanPhotoSession,'function');let decodes=0,urls=0;
  const session=preview.createScanPhotoSession({createImage:()=>{decodes++;throw Error('must not decode');},createObjectURL:()=>{urls++;return 'blob:test';},revokeObjectURL(){}});
  await assert.rejects(session.read(photoFile(imageHeader('png',16000,16000))),error=>error.code==='dimensions');assert.equal(decodes,0);assert.equal(urls,0);
});
test('every AVIF and HEIF extent must respect source edge and pixel bounds even when its area is smaller',async()=>{
  for(const kind of ['avif','heic'])for(const [width,height] of [[24000,1],[1,24000],[9000,9000]]){
    const bytes=new Uint8Array(60);bytes.set(imageHeader(kind,8000,6000));const view=new DataView(bytes.buffer);
    view.setUint32(40,20);bytes.set(new TextEncoder().encode('ispe'),44);view.setUint32(48,0);view.setUint32(52,width);view.setUint32(56,height);
    let decodes=0;const session=preview.createScanPhotoSession({createImage:()=>{decodes++;throw Error('must not decode');},createObjectURL:()=>assert.fail('must not allocate a URL'),revokeObjectURL(){}});
    await assert.rejects(session.read(photoFile(bytes,'image/'+kind)),error=>error.code==='dimensions');assert.equal(decodes,0);
  }
});
test('an ordinary 48MP phone photo retains only bounded pixels and releases its full decoder',async()=>{
  assert.equal(typeof preview.createScanPhotoSession,'function');const image={naturalWidth:8000,naturalHeight:6000,src:'',decode:async()=>{}},draws=[],revoked=[];
  const session=preview.createScanPhotoSession({createImage:()=>image,createObjectURL:()=> 'blob:phone',revokeObjectURL:url=>revoked.push(url),createCanvas:()=>({width:0,height:0,getContext:()=>({fillRect(){},drawImage(...args){draws.push(args);}})})});
  const result=await session.read(photoFile(imageHeader('jpeg',8000,6000),'image/jpeg'));
  assert.equal(result.width,3200);assert.equal(result.height,2400);assert.equal(image.src,'');assert.deepEqual(revoked,['blob:phone']);
  const crop=await session.read(photoFile(imageHeader('jpeg',8000,6000),'image/jpeg'),{left:.25,top:.25,width:.25,height:.25});
  assert.equal(crop.width,2000);assert.equal(crop.height,1500);assert.deepEqual(draws[1].slice(1,5),[2000,1500,2000,1500]);assert.equal(image.src,'');
});
test('another photo and navigation settle pending image decodes and revoke their URLs immediately',async()=>{
  assert.equal(typeof preview.createScanPhotoSession,'function');let finish;const pending={naturalWidth:800,naturalHeight:600,src:'',decode:()=>new Promise(resolve=>finish=resolve)},fresh={...pending,decode:async()=>{}},revoked=[];let created=0;
  const session=preview.createScanPhotoSession({createImage:()=>++created===1?pending:fresh,createObjectURL:()=>`blob:${created}`,revokeObjectURL:url=>revoked.push(url),createCanvas:()=>({width:0,height:0,getContext:()=>({fillRect(){},drawImage(){}})})});
  const file=photoFile(imageHeader('png',800,600)),old=session.read(file);await new Promise(setImmediate);
  const latest=await session.read(file);assert.equal(await old,null);assert.equal(pending.src,'');assert.equal(latest.width,800);assert.ok(revoked.includes('blob:1'));finish();
  fresh.decode=()=>new Promise(()=>{});const closing=session.read(file);await new Promise(setImmediate);session.stop();
  assert.equal(await Promise.race([closing,new Promise(resolve=>setImmediate(()=>resolve('still pending')))]),null);assert.equal(fresh.src,'');
});
