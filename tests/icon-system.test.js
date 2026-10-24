import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceModule} from './helpers/source-module.js';
const ui=await sourceModule("export {icon} from './frontend/src/ui.ts'; export {recordActionMenu} from './frontend/src/record-action-menu.ts'; export {chatFileControls} from './frontend/src/chat-files.ts';");

test('shared icons expose stable semantic identifiers for motion without becoming keyboard targets',()=>{
 for(const name of ['dashboard','return','box','barcode','settings','chat','user','paperclip','more','arrowLeft','chevronDown']){
  const markup=String(ui.icon(name));
  assert.match(markup,new RegExp(`data-symbol="${name}"`));
  assert.match(markup,/viewBox="0 0 24 24"/);assert.match(markup,/aria-hidden="true"/);assert.match(markup,/focusable="false"/);
  assert.doesNotMatch(markup,/<(?:script|image|use|foreignObject)\b|\b(?:href|onload|onerror)=/i);
 }
});

test('unknown and prototype icon keys use the same safe local fallback without reflecting caller text',()=>{
 const fallback=String(ui.icon('box'));
 for(const name of [undefined,null,Symbol('bad'),'missing','__proto__','constructor','toString','"><script>alert(1)</script>'])assert.equal(String(ui.icon(name)),fallback);
});

test('attachment and row-menu controls use shared icons while retaining their accessible control labels',()=>{
 const files=String(ui.chatFileControls({uploadMaxMb:10})),menu=String(ui.recordActionMenu('Gerät <123>','<button role="menuitem">Details</button>'));
 assert.match(files,/data-symbol="paperclip"/);assert.match(files,/data-chat-file-pick/);assert.match(files,/Dateien anhängen/);
 assert.match(menu,/data-symbol="more"/);assert.match(menu,/aria-haspopup="menu"/);assert.match(menu,/aria-expanded="false"/);assert.match(menu,/Gerät &lt;123&gt;/);
});
