import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceModule} from './helpers/source-module.js';

const {extractPdfSerialCandidates}=await sourceModule("export * from './frontend/src/pdf-serial-scan.ts';");
function item(str,x,y,{height=7,width=str.length*3.7}={}){
  return {str,dir:'ltr',width,height,transform:[height,0,0,height,x,y],fontName:'fixture',hasEOL:true};
}
function values(items){return extractPdfSerialCandidates([{pageNumber:1,items}]).map(candidate=>candidate.value);}

test('one product sticker accepts a numeric serial with its original leading zeros',()=>{
  assert.deepEqual(values([item('Acme Desktop U5 16/256GB',20,700),item('00001234',20,690)]),['00001234']);
});
test('product stickers accept mixed case and few-letter serials without changing their spelling',()=>{
  assert.deepEqual(values([
    item('Acme Desktop U5 16/256GB',20,700),item('a1B2345',20,690),
    item('Acme Desktop U5 16/256GB',20,660),item('12D3456',20,650),
  ]),['a1B2345','12D3456']);
});
test('a product caption with an explicit product prefix gives its next serial useful context',()=>{
  assert.deepEqual(values([item('Product: Acme Desktop',20,700),item('00001234',20,690)]),['00001234']);
});
test('nearby sticker columns keep their two unlabelled serials separate',()=>{
  assert.deepEqual(values([
    item('Acme PC',20,700,{width:26}),item('Acme PC',66,700,{width:26}),
    item('01ABC23',20,690,{width:26}),item('02DEF45',66,690,{width:26}),
  ]),['01ABC23','02DEF45']);
});
test('common serial label spellings preserve exact numeric and mixed-case values',()=>{
  assert.deepEqual(values([
    item('S/Nr.: 00012345',20,700),item('Serien-Nr.: a1B2345',20,680),
    item('Serial-Nr.: 12D3456',20,660),item('SerialNumber: 00098765',20,640),
    item('ServiceTag: b2C3456',20,620),item('S-N: 00045678',20,600),
  ]),['00012345','a1B2345','12D3456','00098765','b2C3456','00045678']);
});
test('an explicit serial heading selects every aligned row until another field begins',()=>{
  assert.deepEqual(values([
    item('Serial numbers:',20,700),item('00001234',20,684),item('a1B2345',20,668),item('12D3456',20,652),
    item('EAN:',20,636),item('4006381333931',20,620),
  ]),['00001234','a1B2345','12D3456']);
});
test('an inline serial list can continue on following aligned lines',()=>{
  assert.deepEqual(values([
    item('Seriennummern: 00001234',20,700),item('00005678, a1B2345',20,684),
    item('Order: ORD98765',20,668),item('00009999',20,652),
  ]),['00001234','00005678','a1B2345']);
});
test('a wrapped serial-number heading reaches the value after its second line',()=>{
  assert.deepEqual(values([
    item('Serial',20,700),item('number:',20,690),item('00001234',20,680),
  ]),['00001234']);
});
test('serial table columns remain aligned even when PDF stream items arrive out of order',()=>{
  assert.deepEqual(values([
    item('00005678',20,660),item('Acme Desktop',180,660),item('Serial number',20,700,{width:48}),
    item('Product',180,700),item('00001234',20,680),item('Acme Desktop',180,680),
    item('Date',20,640),item('2026-10-13',20,620),
  ]),['00001234','00005678']);
});
test('visibly separated serial values do not become one horizontal run',()=>{
  assert.deepEqual(values([
    item('Serial numbers:',20,700),item('a1B2345',20,684,{width:26}),item('c2D3456',66,684,{width:26}),
    item('00001234',20,668),
  ]),['a1B2345','c2D3456','00001234']);
});
test('adjacent PDF fragments still assemble one exact labelled value',()=>{
  assert.deepEqual(values([
    item('Serial',20,700,{width:20}),item('Number:',43,700,{width:27}),
    item('00a',74,700,{width:11}),item('B9',85,700,{width:8}),
  ]),['00aB9']);
});
test('explicit columns deduplicate identical values while accumulating page references',()=>{
  const result=extractPdfSerialCandidates([
    {pageNumber:1,items:[item('Serial numbers:',20,700),item('00001234',20,684),item('a1B2345',20,668)]},
    {pageNumber:2,items:[item('S/N: 00001234',20,700),item('S/N: a1B2345',20,680)]},
  ]);
  assert.deepEqual(result,[
    {value:'00001234',pages:[1,2],source:'label'},
    {value:'a1B2345',pages:[1,2],source:'label'},
  ]);
});
test('numeric text without serial or sticker context stays ambiguous',()=>{
  assert.deepEqual(values([item('00001234',20,700),item('00005678',20,680),item('4006381333931',20,660)]),[]);
});
test('sticker context does not turn dates, capacities, model codes or field values into serials',()=>{
  assert.deepEqual(values([
    item('Acme Desktop U5 16/256GB',20,700),item('256GB',20,690),
    item('Acme Desktop U5 16/256GB',20,660),item('2026-10-13',20,650),
    item('Acme Desktop U5 16/256GB',20,620),item('XPS9310',20,610),
    item('Acme Desktop U5 16/256GB',20,580),item('EAN: 4006381333931',20,570),
    item('Model:',20,540),item('abc1234',20,530),
    item('Order:',20,500),item('00001234',20,490),
  ]),[]);
});
test('a separated label cannot claim another column or product prose as its serial',()=>{
  assert.deepEqual(values([
    item('SN:',20,700,{width:12}),item('00001234',200,700),
    item('Serial numbers:',20,660),item('Dell Optiplex U5 16/256GB',20,650),
    item('Serial number: see product label',20,620),
  ]),[]);
});
