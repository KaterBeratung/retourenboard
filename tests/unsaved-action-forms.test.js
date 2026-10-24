import test from 'node:test';
import assert from 'node:assert/strict';
import {markForm,bindUnsavedProtection} from '../dist/public/unsaved.js';

function fixture(t,mode){
  const previous=globalThis.document,previousFormData=globalThis.FormData,listeners={},form={dataset:mode?{formMode:mode}:{},values:{name:'Original'},closest:()=>null,status:null};
  let created=0;
  form.querySelector=selector=>selector==='.unsaved-status'?form.status:null;
  form.prepend=status=>{form.status=status;};
  globalThis.FormData=class extends Map{constructor(node){super(Object.entries(node.values));}};
  globalThis.document={querySelectorAll:()=>[form],addEventListener:(type,listener)=>listeners[type]=listener,createElement:()=>{created++;return {setAttribute(){}};}};
  t.after(()=>{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;globalThis.FormData=previousFormData;});
  return {form,listeners,get created(){return created;}};
}

test('entering credentials or consent in an action form does not produce unsaved changes',t=>{
  const f=fixture(t,'action');
  bindUnsavedProtection();
  for(const type of ['input','change'])f.listeners[type]({target:{closest:()=>f.form}});
  markForm(f.form,true);
  assert.equal(f.form.dataset.dirty,undefined);
  assert.equal(f.created,0);
});

test('editable settings still show unsaved changes and clear them after saving',t=>{
  const f=fixture(t);
  bindUnsavedProtection();
  f.form.values.name='Edited';
  f.listeners.input({target:{closest:()=>f.form}});
  assert.equal(f.form.dataset.dirty,'true');
  assert.equal(f.form.status.hidden,false);
  markForm(f.form,false);
  assert.equal(f.form.dataset.dirty,'false');
  assert.equal(f.form.status.hidden,true);
});
