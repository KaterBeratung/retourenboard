import test from 'node:test';
import assert from 'node:assert/strict';
import {canLeaveForms} from '../dist/public/unsaved.js';

test('confirmed discard notifies connected forms before resetting their dirty state',async t=>{
 const previous={document:globalThis.document,FormData:globalThis.FormData};let buttons;
 globalThis.FormData=class{*[Symbol.iterator](){}};
 const events=[],status={hidden:false},form={isConnected:true,dataset:{dirty:'true'},closest:()=>null,querySelector:s=>s==='.unsaved-status'?status:null,dispatchEvent(event){events.push([event.type,this.dataset.dirty]);return true;}};
 const disconnected={...form,isConnected:false,dispatchEvent(){throw Error('Detached form received a discard');}};
 globalThis.document={activeElement:null,body:{append(){}},querySelectorAll:()=>[form,disconnected],createElement(){buttons={'[data-stay]':{focus(){}},'[data-discard]':{}};return {setAttribute(){},querySelector:s=>buttons[s],close(){},remove(){},showModal(){}};}};
 t.after(()=>Object.assign(globalThis,previous));
 const pending=canLeaveForms();assert.deepEqual(events,[]);buttons['[data-discard]'].onclick();assert.equal(await pending,true);assert.deepEqual(events,[['form-discard','true']]);assert.equal(form.dataset.dirty,'false');
});
