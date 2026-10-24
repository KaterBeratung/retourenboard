import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import QRCode from 'qrcode';

// Bundle the actual local ZXing decoder with this source module; no browser,
// native BarcodeDetector, network or mocked decoding participates in these tests.
let scanner={};
if(existsSync(new URL('../frontend/src/barcode-image.ts',import.meta.url))){
  const built=await build({entryPoints:[fileURLToPath(new URL('../frontend/src/barcode-image.ts',import.meta.url))],bundle:true,write:false,platform:'node',format:'esm',target:'node22'});
  scanner=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
}
function image(width,height,background=255){
  const data=new Uint8ClampedArray(width*height*4);
  for(let i=0;i<data.length;i+=4){data[i]=data[i+1]=data[i+2]=background;data[i+3]=255;}
  return {data,width,height};
}
function put(target,source,left,top){
  for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++){
    const to=((top+y)*target.width+left+x)*4,from=(y*source.width+x)*4;
    target.data.set(source.data.subarray(from,from+4),to);
  }
  return target;
}
function qr(value,scale=4){
  const code=QRCode.create(value,{errorCorrectionLevel:'M'}),margin=4,result=image((code.modules.size+margin*2)*scale,(code.modules.size+margin*2)*scale);
  for(let y=0;y<code.modules.size;y++)for(let x=0;x<code.modules.size;x++)if(code.modules.get(y,x))for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++){
    const p=(((y+margin)*scale+dy)*result.width+(x+margin)*scale+dx)*4;result.data[p]=result.data[p+1]=result.data[p+2]=0;
  }
  return result;
}
function bars(bits,scale=3,height=90){
  const result=image(bits.length*scale,height);
  for(let y=8;y<height-8;y++)for(let x=0;x<result.width;x++)if(bits[Math.floor(x/scale)]==='1'){
    const p=(y*result.width+x)*4;result.data[p]=result.data[p+1]=result.data[p+2]=0;
  }
  return result;
}
function code39(value,scale=2){
  // Standard narrow/wide patterns, independently rendered with quiet zones.
  const alphabet='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%*';
  const patterns=[0x034,0x121,0x061,0x160,0x031,0x130,0x070,0x025,0x124,0x064,0x109,0x049,0x148,0x019,0x118,0x058,0x00d,0x10c,0x04c,0x01c,0x103,0x043,0x142,0x013,0x112,0x052,0x007,0x106,0x046,0x016,0x181,0x0c1,0x1c0,0x091,0x190,0x0d0,0x085,0x184,0x0c4,0x0a8,0x0a2,0x08a,0x02a,0x094];
  let bits='0'.repeat(12);
  for(const character of '*'+value+'*'){
    const pattern=patterns[alphabet.indexOf(character)];
    assert.notEqual(pattern,undefined,'fixture supports Code 39 characters');
    for(let bar=0;bar<9;bar++)bits+=(bar%2===0?'1':'0').repeat(pattern&(1<<(8-bar))?3:1);
    bits+='0';
  }
  return bars(bits+'0'.repeat(12),scale);
}
function ean(){
  const L=['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
  const G=['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
  const digits='4006381333931',parity='LGLLGG';
  return bars('0'.repeat(11)+'101'+[...digits.slice(1,7)].map((d,i)=>(parity[i]==='L'?L:G)[+d]).join('')+'01010'+[...digits.slice(7)].map(d=>L[+d].replace(/[01]/g,b=>b==='0'?'1':'0')).join('')+'101'+'0'.repeat(11));
}
function rotate(source){
  const result=image(source.height,source.width);
  for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++)result.data.set(source.data.subarray((y*source.width+x)*4,(y*source.width+x)*4+4),(x*result.width+source.height-y-1)*4);
  return result;
}
async function decode(pixels,options){assert.equal(typeof scanner.decodeBarcodeImage,'function');return scanner.decodeBarcodeImage(pixels,options);}
function frame(pixels,options){assert.equal(typeof scanner.decodeBarcodeFrame,'function');return scanner.decodeBarcodeFrame(pixels,options)?.getText()??null;}
const noDelay=async()=>{};

test('real RGBA QR and EAN pixels preserve barcode values including case and leading zeros',async()=>{
  assert.deepEqual(await decode(qr('00aBc012'),{yieldTask:noDelay}),['00aBc012']);
  assert.deepEqual(await decode(ean(),{yieldTask:noDelay}),['4006381333931']);
});
test('90 and 270 degree linear barcode photographs decode without losing their original resolution',async()=>{
  const value=code39('00ABC-012');
  assert.deepEqual(await decode(rotate(value),{yieldTask:noDelay}),['00ABC-012']);
  assert.deepEqual(await decode(rotate(rotate(rotate(value))),{yieldTask:noDelay}),['00ABC-012']);
});
test('one photograph returns separate QR, EAN and rotated linear labels rather than only its first code',async()=>{
  const sheet=image(1600,1200);
  put(sheet,qr('00aBc012'),100,100);put(sheet,ean(),1000,110);
  put(sheet,rotate(code39('SN-0042')),200,600);put(sheet,qr('RET-SECOND'),1050,700);put(sheet,qr('00aBc012'),700,450);
  assert.deepEqual((await decode(sheet,{yieldTask:noDelay})).sort(),['00aBc012','4006381333931','RET-SECOND','SN-0042'].sort());
});
test('adjacent linear labels on the same row all remain discoverable',async()=>{
  const sheet=image(1800,600);
  for(const [i,value] of ['SN-A','SN-B','SN-C','SN-D'].entries())put(sheet,code39(value),30+i*440,250);
  assert.deepEqual((await decode(sheet,{yieldTask:noDelay})).sort(),['SN-A','SN-B','SN-C','SN-D']);
});
test('a high resolution sticker page returns every one of its 30 distinct barcode labels',async()=>{
  const sheet=image(2800,2000),expected=[];
  for(let i=0;i<30;i++){
    const value='00SN-'+String(i+1).padStart(2,'0');expected.push(value);
    put(sheet,qr(value,3),80+(i%6)*450,90+Math.floor(i/6)*380);
  }
  assert.deepEqual((await decode(sheet,{yieldTask:noDelay})).sort(),expected.sort());
});
test('a page of 30 rotated linear labels does not spend its attempt budget rediscovering one stripe',async()=>{
  const sheet=image(2800,2000),expected=[];
  for(let i=0;i<30;i++){
    const value='SN'+String(i+1).padStart(2,'0');expected.push(value);
    put(sheet,rotate(code39(value)),80+(i%6)*450,90+Math.floor(i/6)*380);
  }
  assert.deepEqual((await decode(sheet,{yieldTask:noDelay})).sort(),expected.sort());
});
test('local thresholding handles uneven illumination and an inverted barcode',async()=>{
  const uneven=qr('LIGHT-001',5);
  for(let y=0;y<uneven.height;y++)for(let x=0;x<uneven.width;x++){
    const p=(y*uneven.width+x)*4,lit=uneven.data[p]===0?25:110+Math.floor(140*x/uneven.width);
    uneven.data[p]=uneven.data[p+1]=uneven.data[p+2]=lit;
  }
  assert.deepEqual(await decode(uneven,{yieldTask:noDelay}),['LIGHT-001']);
  const inverted=rotate(code39('DARK-001'));
  for(let p=0;p<inverted.data.length;p+=4)for(let c=0;c<3;c++)inverted.data[p+c]=255-inverted.data[p+c];
  assert.deepEqual(await decode(inverted,{yieldTask:noDelay}),['DARK-001']);
});
test('camera decodes the central UI frame and excludes a readable outside distraction',()=>{
  const shot=image(1280,720);put(shot,qr('OUTSIDE',3),5,5);put(shot,qr('IN-FRAME',4),570,290);
  assert.equal(frame(shot),'IN-FRAME');
  const outsideOnly=image(1280,720);put(outsideOnly,qr('OUTSIDE',3),5,5);assert.equal(frame(outsideOnly),null);
});
test('portrait camera pixels first honor the visible cover crop before the UI frame',()=>{
  const shot=image(720,1280);put(shot,qr('COVER-HIDDEN',4),290,120);put(shot,qr('VISIBLE',3),300,590);
  assert.equal(frame(shot),'VISIBLE');
  const hiddenOnly=image(720,1280);put(hiddenOnly,qr('COVER-HIDDEN',4),290,120);assert.equal(frame(hiddenOnly),null);
  const squarePreview=image(1280,720);put(squarePreview,qr('COVER-SIDE',3),60,310);put(squarePreview,qr('SQUARE',3),590,310);
  assert.equal(frame(squarePreview,{aspectRatio:1}),'SQUARE');
});
test('camera capture shares the exact inward-rounded visible frame rectangle with the decoder',()=>{
  assert.equal(typeof scanner.cameraFrameRegion,'function');
  assert.deepEqual(scanner.cameraFrameRegion(720,1280),{left:87,top:519,width:546,height:242});
  assert.deepEqual(scanner.cameraFrameRegion(1280,720,1),{left:367,top:144,width:546,height:432});
  assert.equal(scanner.cameraFrameRegion(0,720),null);assert.equal(scanner.cameraFrameRegion(720,NaN),null);
});
test('cancelled processing suppresses partial codes and yields so a newer file can replace it',async()=>{
  let current=true,yields=0;
  const values=await decode(qr('STALE-001'),{isCurrent:()=>current,yieldTask:async()=>{yields++;current=false;}});
  assert.deepEqual(values,[]);assert.ok(yields>0);
  assert.deepEqual(await decode(qr('ALREADY-CANCELLED'),{isCurrent:()=>false,yieldTask:()=>{throw new Error('must not yield');}}),[]);
});
test('cancellation after the first successful pixel decode discards its partial result',async()=>{
  let current=true,done=0;
  const values=await decode(qr('OLD-RESULT'),{isCurrent:()=>current,onProgress:n=>done=n,yieldTask:async()=>{if(done>0)current=false;}});
  assert.ok(done>0);assert.deepEqual(values,[]);
});
test('a small code on a 7.2 megapixel page keeps its narrow original modules',async()=>{
  const sheet=image(3200,2260);put(sheet,qr('SMALL-ORIGINAL-PIXELS',2),1400,1100);
  assert.deepEqual(await decode(sheet,{yieldTask:noDelay}),['SMALL-ORIGINAL-PIXELS']);
});
test('transparent image pixels cannot introduce an invisible barcode',async()=>{
  const hidden=qr('INVISIBLE');for(let p=3;p<hidden.data.length;p+=4)hidden.data[p]=0;
  assert.deepEqual(await decode(hidden,{yieldTask:noDelay}),[]);
});
test('result limits and monotonic progress bound multi-label image processing',async()=>{
  const shot=image(800,600);put(shot,qr('FIRST'),40,40);put(shot,qr('SECOND'),500,40);put(shot,qr('THIRD'),350,400);
  const progress=[],values=await decode(shot,{maxResults:2,yieldTask:noDelay,onProgress:(done,total)=>progress.push({done,total})});
  assert.equal(values.length,2);assert.equal(new Set(values).size,2);assert.ok(values.every(value=>['FIRST','SECOND','THIRD'].includes(value)));
  assert.ok(progress.length>1);assert.ok(progress.every((p,i)=>p.done>=0&&p.done<=p.total&&p.total<=160&&(i===0||p.done>=progress[i-1].done)));assert.equal(progress.at(-1).done,progress.at(-1).total);
});
test('invalid payloads and malformed or oversized image data produce no usable code',async()=>{
  for(const value of ['BAD\u0000CODE','LINE\nBREAK','x'.repeat(501)])assert.deepEqual(await decode(qr(value),{yieldTask:noDelay}),[]);
  for(const bad of [{data:new Uint8ClampedArray(0),width:100,height:100},{data:new Uint8ClampedArray(4),width:1.5,height:1},{data:new Uint8ClampedArray(4),width:3200,height:2600},{data:new Uint8ClampedArray(4),width:-1,height:1}]){
    assert.deepEqual(await decode(bad,{yieldTask:()=>{throw new Error('bad image should not start processing');}}),[]);assert.equal(frame(bad),null);
  }
});
