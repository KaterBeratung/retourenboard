import test from 'node:test';
import assert from 'node:assert/strict';
import {BinaryBitmap,HybridBinarizer,RGBLuminanceSource,MultiFormatReader} from '@zxing/library';
import {renderReturnLabelPreview} from '../dist/public/return-labels.js';
import {renderDisposalLabelPreview} from '../dist/public/disposal-labels.js';

// Rasterize the actual printable SVG rectangles, then decode independently.
function readCode(svg){
 const [width,height]=svg.match(/viewBox="0 0 (\d+) (\d+)"/).slice(1).map(Number),scale=3,w=width*scale,h=height*scale,pixels=new Uint8ClampedArray(w*h).fill(255);
 for(const rect of svg.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"\/>/g)){
  const [x,y,rw,rh]=rect.slice(1).map(Number);for(let dy=y*scale;dy<(y+rh)*scale;dy++)for(let dx=x*scale;dx<(x+rw)*scale;dx++)pixels[dy*w+dx]=0;
 }
 return new MultiFormatReader().decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels,w,h)))).getText();
}
const row={id:1,returnNumber:'RET-2026-000001',serialNumber:'00aBc-0012',replacementSerialNumber:'000045678912',qrDataUrl:'data:image/png;base64,aGVsbG8='};
function codes(markup){return [...String(markup).matchAll(/<svg\b[^>]*class="label-identifier-code[^]*?<\/svg>/g)].map(m=>m[0]);}
test('printed original and replacement codes decode to exact identifiers with case and leading zeros',()=>{
 const printed=codes(renderReturnLabelPreview(row));
 assert.deepEqual(printed.map(readCode),['00aBc-0012','000045678912','00aBc-0012','000045678912'],'Main label and additional compact stickers must keep the same device association');
});
test('long and Unicode serials remain fully scannable without unsupported Code 128 substitutions',()=>{
 for(const serial of ['SN-Ä-測試-001','A'.repeat(250)]){const printed=codes(renderReturnLabelPreview({...row,serialNumber:serial,replacementSerialNumber:''}));assert.ok(printed.length);assert.equal(readCode(printed[0]),serial);}
});
test('disposal labels encode the device serial, independently of their order QR code',()=>{
 const printed=codes(renderDisposalLabelPreview({disposalNumber:'DIS-2026-000001',serialNumber:'00HDD-001',mode:'destroy',status:'planned',kind:'order',qrDataUrl:row.qrDataUrl}));assert.ok(printed.length);assert.equal(readCode(printed[0]),'00HDD-001');
});
test('empty or unsafe identifiers do not generate fake scannable values',()=>{
 for(const serial of ['', 'SN\u0000BAD'])assert.equal(codes(renderReturnLabelPreview({...row,serialNumber:serial,replacementSerialNumber:''})).length,0);
 const markup=String(renderReturnLabelPreview({...row,serialNumber:'<img onerror="bad">',replacementSerialNumber:''}));assert.doesNotMatch(markup,/<img onerror/);assert.ok(codes(markup).length);assert.equal(readCode(codes(markup)[0]),'<img onerror="bad">');
});
