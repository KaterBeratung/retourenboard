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

test('calendar draws a date grid of dots instead of two face-like dashes',()=>{
 const markup=String(ui.icon('calendar'));
 assert.equal((markup.match(/class="icon-calendar-days"/g)||[]).length,2);
 assert.doesNotMatch(markup,/M8 14\.5h1\.5|M14\.5 14\.5H16/);
});

test('copy draws only the visible edge of the back sheet so no outlines cross, and keeps its animation hooks',()=>{
 const markup=String(ui.icon('copy'));
 assert.match(markup,/<path class="icon-copy-back" d="[^"]+"\/>/);
 assert.match(markup,/<rect class="icon-copy-front icon-surface"/);
 assert.equal((markup.match(/<rect\b/g)||[]).length,1,'only the front sheet is a closed shape');
 for(const name of ['filter','close'])assert.match(String(ui.icon(name)),new RegExp(`data-symbol="${name}"`));
 assert.match(String(ui.icon('filter')),/a\.75\.75/,'filter corners are rounded like the other symbols');
});

test('box keeps a calm top face: seam lines only, no tape line across the lid, lighter lid tone',()=>{
 const markup=String(ui.icon('box'));
 assert.match(markup,/class="icon-box-seam" pathLength="1" d="m3\.5 8\.25 8\.5 4\.75 8\.5-4\.75M12 13v8\.75"/);
 assert.doesNotMatch(markup,/M8 5\.75/);
 assert.equal((markup.match(/icon-facet/g)||[]).length,2);
});

test('box lid opens: both flaps hinge on their outer corners and swing apart',async()=>{
 const {readFile}=await import('node:fs/promises');
 const css=await readFile(new URL('../frontend/assets/motion.css',import.meta.url),'utf8');
 assert.match(css,/@keyframes board-symbol-flap\{/);
 assert.match(css,/\.icon-box-left\{--symbol-animation:board-symbol-flap;--symbol-angle:-26deg;[^}]*transform-origin:3\.5px 8\.25px\}/);
 assert.match(css,/\.icon-box-right\{--symbol-animation:board-symbol-flap;--symbol-angle:26deg;[^}]*transform-origin:20\.5px 8\.25px\}/);
});
