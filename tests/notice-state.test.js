import test from 'node:test';import assert from 'node:assert/strict';
import {readNotice} from '../dist/public/notices.js';
function source(kind,text,extra={}){
 const form={dataset:{dirty:'true'}},node={id:kind==='toast'?'toast-region':'',textContent:text,isConnected:true,hidden:false,classList:{contains:name=>name==='visible'},matches:selector=>selector==='.unsaved-status,[data-unsaved]'?kind==='unsaved':false,querySelectorAll:()=>[],closest:selector=>selector==='form'?form:null,...extra};return {node,form};
}
test('form errors become readable alert notices, while hidden or detached errors disappear',()=>{
 const {node}=source('error','Bitte zuerst ein Produkt auswählen.');assert.deepEqual(readNotice(node),{kind:'error',message:'Bitte zuerst ein Produkt auswählen.',actions:[]});node.hidden=true;assert.equal(readNotice(node),null);node.hidden=false;node.isConnected=false;assert.equal(readNotice(node),null);
});
test('unsaved notices follow actual dirty state and respect forms that suppress draft notices',()=>{
 const {node,form}=source('unsaved','Ungespeicherte Änderungen');assert.equal(readNotice(node).kind,'unsaved');form.dataset.dirty='false';assert.equal(readNotice(node),null);form.dataset.dirty='true';form.dataset.unsavedNotice='hidden';assert.equal(readNotice(node),null);
});
test('toasts preserve their actual undo button, excluding its text from the message',()=>{
 const button={textContent:'Rückgängig',disabled:false},caption={textContent:'Status geändert.',querySelectorAll:()=>[{remove(){caption.textContent='Status geändert.';}}]}, {node}=source('toast','Status geändert. Rückgängig',{querySelectorAll:()=>[button],cloneNode:()=>caption});const notice=readNotice(node);assert.equal(notice.kind,'success');assert.equal(notice.message,'Status geändert.');assert.equal(notice.actions[0],button);node.classList.contains=()=>false;assert.equal(readNotice(node),null);
});
test('closed dialog errors and warnings behind a hidden section do not survive navigation',()=>{
 for(const ancestor of ['[hidden]','dialog:not([open])']){const {node}=source('error','Old error',{closest:selector=>selector===ancestor?{}:null});assert.equal(readNotice(node),null);}
});
