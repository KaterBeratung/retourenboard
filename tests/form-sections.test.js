import test from 'node:test';
import assert from 'node:assert/strict';
import * as ui from '../dist/public/ui.js';
function element(){return {attrs:{},dataset:{},children:[],classList:{add(){}},setAttribute(k,v){this.attrs[k]=String(v);},getAttribute(k){return this.attrs[k]??null;},append(n){this.children.push(n);},focus(){this.focused=true;}};}
function fixture(t){
 const previous=globalThis.document;globalThis.document={documentElement:{dataset:{motion:'reduce'}},createElement:()=>element()};t.after(()=>{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;});
 const sections=['01 Produkt & Zuordnung','02 Eingang & Prüfung','03 Bearbeitung & Ergebnis'].map(label=>({...element(),hidden:false,draft:{value:'retained'},querySelector:()=>({textContent:label})}));
 const handlers={},form={...element(),querySelectorAll(s){return s==='[data-detail-tab]'?this.nav?.children??[]:s==='[data-detail-panel]'?sections:sections;},querySelector(s){return s==='input:invalid,select:invalid,textarea:invalid'?this.firstInvalid:s==='[data-form-navigation]'?this.nav:null;},addEventListener(type,fn,capture){(handlers[type]??=[]).push(fn);},firstInvalid:null};
 sections[0].before=n=>form.nav=n;
 const field=index=>({closest:s=>s==='[data-detail-panel]'?sections[index]:null});
 return {form,sections,handlers,field};
}
function bind(f){assert.equal(typeof ui.bindFormSections,'function');return ui.bindFormSections(f.form);}
test('form sections preserve all field nodes and drafts while showing one group',t=>{
 const f=fixture(t),draft=f.sections[2].draft,show=bind(f);assert.deepEqual(f.sections.map(s=>s.hidden),[false,true,true]);show(f.sections[2].dataset.detailPanel);assert.deepEqual(f.sections.map(s=>s.hidden),[true,true,false]);assert.equal(f.sections[2].draft,draft);assert.equal(draft.value,'retained');
});
test('native validation reveals the first invalid control even when later sections also reject input',t=>{
 const f=fixture(t),show=bind(f);show(f.sections[2].dataset.detailPanel);f.form.firstInvalid=f.field(0);
 for(const target of [f.field(0),f.field(1),f.field(2)])for(const handler of f.handlers.invalid??[])handler({target});
 assert.deepEqual(f.sections.map(s=>s.hidden),[false,true,true]);
});
test('a later invalid required field opens its own section and does not cancel validation',t=>{
 const f=fixture(t);bind(f);f.form.firstInvalid=f.field(1);let prevented=false;
 for(const handler of f.handlers.invalid??[])handler({target:f.form.firstInvalid,preventDefault(){prevented=true;}});
 assert.deepEqual(f.sections.map(s=>s.hidden),[true,false,true]);assert.equal(prevented,false);
});
test('rebinding the same form retains its current section and adds no duplicate invalid listener',t=>{
 const f=fixture(t),show=bind(f);show(f.sections[2].dataset.detailPanel);const nav=f.form.nav;const again=bind(f);assert.equal(f.form.nav,nav);assert.equal(again,show);assert.equal(f.handlers.invalid.length,1);assert.equal(f.sections[2].hidden,false);
});

test('binding a newly loaded form installs navigation without an outer admin page rebind',t=>{
 const f=fixture(t);f.form.dataset.formMode='action';ui.trackFormSave(f.form);assert.ok(f.form.nav,'a freshly loaded form needs its own section navigation');assert.deepEqual(f.sections.map(s=>s.hidden),[false,true,true]);
});

test('programmatic field feedback reveals its panel before focusing the preserved input',t=>{
 const f=fixture(t);bind(f);const panel=f.sections[2];let focused=false,scrolled=false;
 const control={closest:()=>panel,focus(){focused=!panel.hidden;},scrollIntoView(){scrolled=true;}};
 assert.equal(typeof ui.focusFormControl,'function');ui.focusFormControl(f.form,control,{block:'center',behavior:'auto'});
 assert.equal(panel.hidden,false);assert.equal(focused,true);assert.equal(scrolled,true);
});
test('completion requirement links open a hidden form section before focusing its field',async t=>{
 const f=fixture(t);bind(f);const panel=f.sections[2];let focused=false;
 const control={closest:()=>panel,focus(){focused=!panel.hidden;},scrollIntoView(){}};
 f.form.elements={namedItem:name=>name==='notes'?control:null};const button={dataset:{completionField:'notes'}};
 const {bindCompletionFields}=await import('../dist/public/return-completion.js');bindCompletionFields({querySelectorAll:()=>[button]},f.form);button.onclick();
 assert.equal(panel.hidden,false);assert.equal(focused,true);
});
