import test from 'node:test';
import assert from 'node:assert/strict';
import {openDialog} from '../dist/public/ui.js';
test('editing inside an open side panel retains the dialog and focuses its new controls',t=>{
 const original=globalThis.document;let closes=0,opens=0,focused=0;
 const close={focus(){focused++;}};
 const dialog={open:true,className:'detail-drawer',close(){closes++;this.open=false;},showModal(){opens++;this.open=true;},querySelector(){return close;},querySelectorAll(){return [];}};
 globalThis.document={querySelector(){return dialog;}};t.after(()=>globalThis.document=original);
 openDialog({title:'Edit return',drawer:true,body:'<form>Saved filter context stays outside</form>'});
 assert.equal(closes,0);assert.equal(opens,0);assert.equal(dialog.open,true);assert.equal(focused,1);
});
