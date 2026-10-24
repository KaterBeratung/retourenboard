import test from 'node:test';
import assert from 'node:assert/strict';
import {renderAdmin,bindAdmin} from '../dist/public/admin.js';
import {MASTER_KINDS} from '../dist/shared/model.js';
import {addTranslations,setLanguage} from '../dist/public/i18n.js';
import {english} from '../dist/public/i18n-catalog.js';
addTranslations(english);
function context(t){const old=globalThis.location;globalThis.location={hash:'#masterdata'};t.after(()=>{globalThis.location=old;setLanguage('de');});return {canAdminSection:()=>true,masterdata:Object.fromEntries(Object.keys(MASTER_KINDS).map(key=>[key,[]]))};}

test('compact masterdata picker exposes every category with active counts and translated labels',t=>{
 const ctx=context(t);ctx.masterdata.suppliers=[{id:1,name:'active',active:true},{id:2,name:'old',active:false}];
 const de=String(renderAdmin(ctx)).replace(/<!--[\s\S]*?-->/g,'');assert.match(de,/data-master-picker/);assert.match(de,/<option value="suppliers"[^>]*>Lieferanten · 1<\/option>/);
 for(const key of Object.keys(MASTER_KINDS))assert.match(de,new RegExp('<option value="'+key+'"'));
 setLanguage('en');assert.match(String(renderAdmin(ctx)).replace(/<!--[\s\S]*?-->/g,''),/<option value="suppliers"[^>]*>Suppliers · 1<\/option>/);
});

test('mobile masterdata selection renders the chosen list and keeps keyboard focus without saving',t=>{
 const ctx=context(t);ctx.masterdata.statuses=[{id:9,name:'Custom status',active:true}];let saves=0;ctx.api=()=>{saves++;};
 const picker={value:'statuses',focus(options){this.focused=true;this.options=options;}},root={innerHTML:'',querySelectorAll:()=>[],querySelector:selector=>selector==='[data-master-picker]'?picker:null};
 bindAdmin(ctx,root);assert.equal(typeof picker.onchange,'function');picker.onchange();
 assert.match(root.innerHTML,/Custom status/);assert.match(root.innerHTML,/<option value="statuses" selected/);assert.equal(picker.focused,true);assert.deepEqual(picker.options,{preventScroll:true});assert.equal(saves,0);
 const previous=root.innerHTML;picker.value='unknown';picker.onchange();assert.equal(root.innerHTML,previous);
});

test('compact masterdata cards identify only genuinely empty optional values',t=>{
 const ctx=context(t),picker={value:'suppliers',focus(){}},root={innerHTML:'',querySelectorAll:()=>[],querySelector:s=>s==='[data-master-picker]'?picker:null};
 ctx.masterdata.suppliers=[{id:1,name:'No details',active:true,notes:'  '},{id:2,name:'Real details',active:true,code:'ABC',notes:'—'}];
 bindAdmin(ctx,root);picker.onchange();const markup=root.innerHTML.replace(/<!--[\s\S]*?-->/g,'');
 assert.match(markup,/<table class="masterdata-table"/);
 const rows=markup.match(/<tr><td><strong>.*?<\/tr>/g);assert.equal(rows.length,2);
 assert.equal((rows[0].match(/data-mobile-empty/g)||[]).length,2);
 assert.doesNotMatch(rows[1],/data-mobile-empty/);assert.match(rows[1],/ABC/);assert.match(rows[1],/class="master-notes">—/);
});
