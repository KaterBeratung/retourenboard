import test from 'node:test';import assert from 'node:assert/strict';
import {parseDesignRoute,internalNavigationUrl} from '../dist/public/design.js';
test('disposal links share the mounted shell from workspace and admin',()=>{assert.equal(parseDesignRoute('#disposals').view,'disposals');assert.equal(parseDesignRoute('#disposals?record=DIS-2026-000001',true).view,'disposals');assert.equal(internalNavigationUrl('/#disposals?returnId=1','http://localhost/admin'),'/#disposals?returnId=1');});

import {renderDisposalLabelPreview} from '../dist/public/disposal-labels.js';
import {renderDeviceForm} from '../dist/public/disposal-forms.js';
import {renderDisposals,renderDisposalRows,disposalNextStep} from '../dist/public/disposals.js';
import {setLanguage} from '../dist/public/i18n.js';
const ctx={authGeneration:1,products:[],returns:[],can:key=>!['disposalsApprove','disposalsComplete'].includes(key)};
const row={id:1,disposalNumber:'DIS-2026-000001',productName:'SSD <script>',serialNumber:'SN-001',sku:'DRIVE-1',mode:'destroy',status:'planned',revision:1,createdAt:'2026-10-15T12:00:00Z',details:{},qrDataUrl:'data:image/png;base64,AAAA'};
test('the disposal page has a short translated heading',()=>{try{for(const [language,label]of [['de','Entsorgung'],['en','Disposal']]){setLanguage(language);assert.match(String(renderDisposals(ctx)).replace(/<!--[\s\S]*?-->/g,''),new RegExp('<h1>'+label+'<'));}}finally{setLanguage('de');}});
test('catalog selection is permanently visible and optional for standalone disposal devices',()=>{
 const markup=String(renderDeviceForm(ctx));assert.doesNotMatch(markup,/<details[^>]*data-disposal-catalog/);assert.match(markup,/<section[^>]*data-disposal-catalog/);
 assert.doesNotMatch(markup,/<b>\*<\/b>/);assert.match(markup,/data-product-search/);
});
test('required device labels translate without including the decorative required marker',()=>{setLanguage('en');try{const markup=String(renderDeviceForm(ctx)).replace(/<!--[\s\S]*?-->/g,'');assert.match(markup,/<span>Action \*<\/span>/);assert.match(markup,/Serial number \/ device ID \*<\/label>/);}finally{setLanguage('de');}});
test('device forms support standalone devices and rows expose the next permitted step without HTML injection',()=>{assert.match(renderDeviceForm(ctx),/name="productName"/);assert.match(renderDeviceForm(ctx),/name="serialNumber"/);assert.equal(disposalNextStep(ctx,row),'Auf Freigabe warten');const markup=String(renderDisposalRows(ctx,[row]));assert.ok(markup.includes('&lt;script&gt;'));assert.ok(!markup.includes('<script>'));});
test('open disposal labels cannot claim completion and every supported size uses the canonical logo',()=>{for(const size of ['a4','103x164','62x29','auto']){const markup=String(renderDisposalLabelPreview({...row,kind:'order'},{size}));assert.ok(markup.includes('Zur Vernichtung'));assert.ok(markup.includes('src="/favicon.svg"'));assert.ok(markup.includes('data-label-size="'+size+'"'));assert.ok(!markup.includes('Vernichtungsnachweis</span>'));}assert.throws(()=>renderDisposalLabelPreview({...row,kind:'certificate'}),/erst nach/);});
test('completed records preserve method performer date and revision in printable proof in both languages',()=>{try{for(const language of ['de','en']){setLanguage(language);const done={...row,kind:'certificate',status:'completed',revision:3,details:{method:'Zerkleinert',performedBy:'Operator',completedOn:'2026-10-15',approvedByName:'Admin',approvedAt:'2026-10-15T11:00:00Z',documentedByName:'Admin',documentedAt:'2026-10-15T12:00:00Z'}};const markup=String(renderDisposalLabelPreview(done));for(const value of ['Zerkleinert','Operator',language==='de'?'15.10.2026':'15/10/2026','DIS-2026-000001','SN-001'])assert.ok(markup.includes(value),value);assert.ok(markup.includes(language==='de'?'Vernichtungsnachweis':'Destruction record'));assert.ok(!markup.includes('2026-10-15'),'calendar dates are presented in the selected language');}}finally{setLanguage('de');}});


test('disposal view exposes the shared column and density settings without changing the search hooks',()=>{
 const markup=String(renderDisposals(ctx));
 assert.match(markup,/data-table-settings/);assert.match(markup,/data-table-density="compact"/);
 assert.match(markup,/data-column-choice="serial"/);assert.match(markup,/data-disposal-search/);
});

test('desktop and mobile disposal records preserve identifiers and permission-gated print actions',()=>{
 const item={...row,serialNumber:'SN <device>',status:'completed'};
 const restricted={...ctx,can:key=>key==='disposalsRead'};
 for(const [context,printable] of [[restricted,false],[ctx,true]]){
  const parts=String(renderDisposalRows(context,[item])).split('<div class="mobile-records">');
  assert.equal(parts.length,2,'both table and record cards are rendered');
  for(const part of parts){
   assert.match(part,/DIS-2026-000001/);assert.match(part,/SN &lt;device&gt;/);assert.match(part,/SSD &lt;script&gt;/);
   assert.doesNotMatch(part,/<script>/);assert.match(part,/data-disposal-open="1"/);
   assert.equal(part.includes('data-disposal-print='),printable);
  }
 }
});
test('disposal phone cards keep their actions behind a menu while the desktop table keeps the icon row',()=>{
 const item={...row,status:'completed'};
 const [table,cards]=String(renderDisposalRows(ctx,[item])).split('<div class="mobile-records">');
 assert.match(table,/class="icon-btn" type="button" data-disposal-print="1"/);
 assert.doesNotMatch(table,/data-record-menu/);
 assert.match(cards,/data-record-menu-trigger/);assert.match(cards,/aria-label="Weitere Aktionen: DIS-2026-000001"/);
 assert.match(cards,/role="menuitem"[^>]*data-disposal-print="1"/);assert.match(cards,/role="menuitem"[^>]*data-disposal-open="1"/);
 assert.doesNotMatch(cards,/class="icon-btn" type="button" data-disposal-(print|open)/);
 const restricted=String(renderDisposalRows({...ctx,can:key=>key==='disposalsRead'},[item])).split('<div class="mobile-records">')[1];
 assert.doesNotMatch(restricted,/data-disposal-print/);assert.match(restricted,/data-disposal-open="1"/);
});
