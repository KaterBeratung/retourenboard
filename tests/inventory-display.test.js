import test from 'node:test';
import assert from 'node:assert/strict';
import {BUILTIN_MASTERDATA} from '../dist/shared/model.js';
import {english} from '../dist/public/i18n-catalog.js';
import {addTranslations,setLanguage} from '../dist/public/i18n.js';
import {masterLabel,masterValue,money,currencyNotice} from '../dist/public/inventory-display.js';
import * as display from '../dist/public/inventory-display.js';

test('return detail sections highlight serial numbers, preserve user text and include legacy quantities only when needed',()=>{
 assert.equal(typeof display.returnDetailContent,'function');
 const item={id:3,returnNumber:'RET-003',productName:'<Monitor>',serialNumber:'SN<&3',quantity:1,reason:'Eigener Grund',notes:'<script>evil</script>',createdAt:'2026-10-12T12:00:00Z'};
 const clean=value=>String(value).replace(/<!--.*?-->/g,'');
 const markup=clean(display.returnDetailContent({},item));
 assert.match(markup,/data-copy-serial="3"/);
 assert.ok(markup.indexOf('return-serial-focus')<markup.indexOf('detail-processing'));
 assert.match(markup,/SN&lt;&amp;3/);assert.match(markup,/&lt;script&gt;evil&lt;\/script&gt;/);
 assert.doesNotMatch(markup,/<script>|<dt>Menge<\/dt>/);
 assert.match(clean(display.returnDetailContent({}, {...item,quantity:4})),/<dt>Menge<\/dt><dd>4<\/dd>/);
});

addTranslations(english);
test('built-in master labels translate without changing IDs or stored names',()=>{
 try{
  for(const entry of BUILTIN_MASTERDATA){
   const item={...entry,builtinKey:entry.key};
   setLanguage('en');
   assert.equal(String(masterLabel(item)),english[entry.name],entry.key);
   setLanguage('de');assert.equal(String(masterLabel(item)),entry.name);
   assert.equal(item.name,entry.name);assert.equal(item.id,entry.id);
  }
 }finally{setLanguage('de');}
});
test('custom, renamed and unrelated values stay opaque, even if their names match',()=>{
 setLanguage('en');
 try{
  assert.equal(String(masterLabel({id:99,kind:'statuses',name:'Abgeschlossen',builtinKey:''})),'Abgeschlossen');
  assert.equal(String(masterLabel({id:12,kind:'statuses',name:'Mein Eingang',builtinKey:'statuses.received'})),'Mein Eingang');
  assert.equal(String(masterLabel({id:50,kind:'suppliers',name:'Defekt',builtinKey:'reasons.defective'})),'Defekt');
  const entry=BUILTIN_MASTERDATA.find(x=>x.key==='reasons.other');
  const masters={reasons:[{...entry,builtinKey:entry.key}]};
  const ret={reasonId:entry.id,reason:'Sonstiges'};
  assert.equal(String(masterValue(masters,ret,'reason')),'Other');
  assert.equal(String(masterValue(masters,{...ret,reasonId:88},'reason')),'Sonstiges');
  assert.equal(String(masterValue(masters,{notes:'Sonstiges'},'notes')),'Sonstiges');
 }finally{setLanguage('de');}
});
test('currency display converts totals from original EUR and never mutates amounts',()=>{
 const settings={base:'EUR',display:'USD',rate:1.12345,date:'2026-10-07',stale:false,status:'current'};
 const product={priceCents:2995};
 setLanguage('en');
 try{
  assert.equal(String(money(product.priceCents,settings)),'US$33.65');
  assert.equal(String(money(product.priceCents)),'€29.95');
  assert.equal(String(money(0,settings)),'US$0.00');
  assert.equal(String(money(product.priceCents*3,settings)),'US$100.94');
  assert.equal(product.priceCents,2995);
  setLanguage('de');assert.equal(String(money(product.priceCents,settings)),'33,65\u00a0$');
 }finally{setLanguage('de');}
});
test('missing or invalid exchange rates retain EUR instead of relabeling amounts as USD',()=>{
 for(const rate of [null,0,-1,NaN,Infinity,'1.1'])assert.equal(String(money(1000,{display:'USD',rate})),'10,00\u00a0€');
 const cached={display:'USD',rate:1.12,date:'2026-10-01',stale:true,status:'cached'};
 assert.match(currencyNotice(cached),/Gespeicherter Kurs/);
 assert.match(currencyNotice({display:'USD',rate:null,status:'unavailable'}),/EUR/);
 assert.equal(currencyNotice({display:'EUR'}),'');
});
