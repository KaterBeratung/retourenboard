import test from 'node:test';
import assert from 'node:assert/strict';
import {bindUnsavedProtection,canLeaveForms,markForm} from '../dist/public/unsaved.js';
import {trackFormSave} from '../dist/public/ui.js';

// Exercise production listeners and save tracking; replace only the DOM boundary.
function fixture(t,initial={}) {
  const original={document:globalThis.document,FormData:globalThis.FormData,MutationObserver:globalThis.MutationObserver};
  const listeners={},mounted=[],observers=[];
  globalThis.FormData=class {
    constructor(form){this.entries=form.controls.filter(c=>c.name&&!c.disabled&&(!['checkbox','radio'].includes(c.type)||c.checked)).flatMap(c=>c.type==='file'?(c.files.length?c.files:[new File([],'')]).map(file=>[c.name,file]):c.values?c.values.map(value=>[c.name,value]):[[c.name,c.value]]);}
    [Symbol.iterator](){return this.entries[Symbol.iterator]();}
  };
  globalThis.document={
    addEventListener:(type,fn)=>listeners[type]=fn,
    querySelectorAll:selector=>mounted.filter(form=>selector==='form'||form.dataset.dirty==='true'),
    createElement:()=>({setAttribute(){},hidden:false}),
  };
  globalThis.MutationObserver=class {constructor(fn){observers.push(fn);}observe(){}};
  const create=values=>{
    const handlers={},form={dataset:{},nodeType:1,isConnected:true,controls:Object.entries(values).map(([name,value])=>typeof value==='boolean'?{name,type:'checkbox',checked:value,value:'on'}:{name,type:'text',value}),status:null,closest:()=>null,matches:selector=>selector==='form',querySelectorAll:()=>[]};
    form.querySelector=selector=>selector==='.unsaved-status'?form.status:null;
    form.prepend=status=>form.status=status;
    form.addEventListener=(type,fn)=>(handlers[type]??=[]).push(fn);
    form.emit=type=>{const event={target:{closest:()=>form},defaultPrevented:false};for(const fn of handlers[type]??[])fn(event);listeners[type]?.(event);};
    return form;
  };
  const form=create(initial);mounted.push(form);bindUnsavedProtection();
  t.after(()=>{for(const [key,value]of Object.entries(original)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}});
  return {form,create,mount(form){mounted.push(form);for(const fn of observers)fn([{addedNodes:[form]}]);}};
}
function dirty(form,expected){assert.equal(form.dataset.dirty,String(expected));assert.equal(Boolean(form.status&&!form.status.hidden),expected);}

for(const initial of [false,true])test(`restoring an initially ${initial?'enabled':'disabled'} switch removes the unsaved warning`,async t=>{
  const {form}=fixture(t,{required:initial});
  form.controls[0].checked=!initial;form.emit('input');dirty(form,true);
  form.controls[0].checked=initial;form.emit('change');dirty(form,false);
  assert.equal(await canLeaveForms(),true);
});

test('all edited fields must match the baseline before the form becomes clean',t=>{
  const {form}=fixture(t,{name:'RET',protocol:'https',enabled:true});
  form.controls[0].value='NEW';form.emit('input');
  form.controls[1].value='http';form.emit('change');dirty(form,true);
  form.controls[0].value='RET';form.emit('input');dirty(form,true);
  form.controls[1].value='https';form.emit('change');dirty(form,false);
});

test('message drafts track unsent text and files without rendering a save-status notice',t=>{
  const {form}=fixture(t,{text:'',chatAttachmentDraft:''});form.dataset.unsavedNotice='hidden';
  form.controls[0].value='Noch nicht gesendet';form.emit('input');
  assert.equal(form.dataset.dirty,'true');assert.equal(form.status,null);
  form.controls[0].value='';form.controls[1].value='1';form.emit('change');
  assert.equal(form.dataset.dirty,'true');assert.equal(form.status,null);
  form.controls[1].value='';form.emit('change');assert.equal(form.dataset.dirty,'false');assert.equal(form.status,null);
});

test('successful saves establish a new baseline for subsequent edits',t=>{
  const {form}=fixture(t,{enabled:false});const start=trackFormSave(form);
  form.controls[0].checked=true;form.emit('input');dirty(form,true);
  assert.equal(start()(),true);dirty(form,false);
  form.controls[0].checked=false;form.emit('change');dirty(form,true);
  form.controls[0].checked=true;form.emit('change');dirty(form,false);
});

test('a completed pending save compares later edits against what was actually submitted',t=>{
  const {form}=fixture(t,{name:'Original'});const start=trackFormSave(form);
  form.controls[0].value='Submitted';form.emit('input');const committed=start();
  form.controls[0].value='Original';form.emit('input');dirty(form,false);
  assert.equal(committed(),false);dirty(form,true);
  form.controls[0].value='Submitted';form.emit('input');dirty(form,false);
});

test('newly mounted forms capture values set programmatically before the first interaction',t=>{
  const f=fixture(t),form=f.create({text:''});form.controls[0].value='Existing message';f.mount(form);
  form.controls[0].value='Edited message';form.emit('input');dirty(form,true);
  form.controls[0].value='Existing message';form.emit('input');dirty(form,false);
});

test('removing a selected upload restores an empty form even though FormData creates new empty files',t=>{
  const {form}=fixture(t);form.controls.push({name:'attachment',type:'file',files:[]});markForm(form,false);
  form.controls[0].files=[new File(['test'],'proof.pdf',{type:'application/pdf'})];form.emit('change');dirty(form,true);
  form.controls[0].files=[];form.emit('change');dirty(form,false);
});

test('server settings update their existing save status without duplicating a warning',t=>{
  const {form}=fixture(t,{protocol:'https'}),inline={textContent:'',dataset:{}};
  form.querySelector=selector=>selector==='[data-unsaved]'?inline:null;
  const start=trackFormSave(form);
  form.controls[0].value='http';form.emit('change');assert.equal(form.dataset.dirty,'true');assert.equal(inline.textContent,'Ungespeicherte Änderungen');
  form.controls[0].value='https';form.emit('change');assert.equal(form.dataset.dirty,'false');assert.equal(inline.textContent,'Alle Änderungen gespeichert.');
  assert.equal(form.status,null);
  assert.equal(start()(),true);
});
