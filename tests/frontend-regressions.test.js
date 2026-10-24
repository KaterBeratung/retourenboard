import test from 'node:test';
import assert from 'node:assert/strict';
import {setLanguage} from '../dist/public/i18n.js';
const generations=await import('../dist/public/input-generation.js').catch(()=>({}));
const navigation=await import('../dist/public/unsaved.js').catch(()=>({}));
const status=await import('../dist/public/return-status.js').catch(()=>({}));
const audit=await import('../dist/public/admin-audit.js');

test('a pending file read cannot replace accepted newer text or expose its stale error',async()=>{
  assert.equal(typeof generations.createInputGeneration,'function');const gate=generations.createInputGeneration();let finish,fail,applied='new text',error=false;
  const read=gate.read(()=>new Promise(r=>finish=r),value=>applied=value,()=>error=true);gate.advance();finish('old file');await read;assert.equal(applied,'new text');
  const rejected=gate.read(()=>new Promise((_,r)=>fail=r),()=>{},()=>error=true);gate.advance();fail(new Error('old read'));await rejected;assert.equal(error,false);
});
test('a stale preview cannot reenable a button disabled by newer input',()=>{
  const gate=generations.createInputGeneration(),token=gate.current;let disabled=true;gate.advance();gate.withCurrent(token,()=>disabled=false);assert.equal(disabled,true);
});
test('dirty form navigation preserves input when discard is declined',()=>{
  assert.equal(typeof navigation.mayLeaveForm,'function');assert.equal(navigation.mayLeaveForm(true,()=>false),false);assert.equal(navigation.mayLeaveForm(true,()=>true),true);let asked=false;assert.equal(navigation.mayLeaveForm(false,()=>{asked=true;}),true);assert.equal(asked,false);
});
test('overdue markers are shared by return lists and remain escaped',()=>{
  assert.equal(typeof status.overdueMarker,'function');assert.equal(status.overdueMarker({overdue:false}), '');assert.match(status.overdueMarker({overdue:true,dueDate:'2026-10-06'}),/Überfällig/);assert.equal(status.overdueMarker({overdue:true,dueDate:'<script>'}).includes('<script>'),false);
});

test('overdue dates use the selected locale in the badge and tooltip and retain in-place language metadata',()=>{
 try{
  setLanguage('de');
  const markup=String(status.overdueMarker({overdue:true,dueDate:'2026-10-16'}));
  assert.match(markup.replace(/<!--.*?-->/g,''),/Überfällig · 16\.10\.2026/);
  assert.match(markup,/title="Frist: 16\.10\.2026"/);
  const pair=markup.match(/data-rb-i18n-title="([^"]+)"/)?.[1];
  assert.ok(pair,'The tooltip date must update without rerendering after a language switch');
  assert.match(JSON.parse(decodeURIComponent(pair))[1],/16\/10\/2026/);
  setLanguage('en');
  assert.match(String(status.overdueMarker({overdue:true,dueDate:'2026-10-16'})).replace(/<!--.*?-->/g,''),/16\/10\/2026/);
 }finally{setLanguage('de');}
});

test('overdue formatting preserves calendar dates and does not silently normalize invalid legacy dates',()=>{
 const leap=String(status.overdueMarker({overdue:true,dueDate:'2024-02-29'})).replace(/<!--.*?-->/g,'');
 assert.match(leap,/29\.02\.2024/);
 const invalid=String(status.overdueMarker({overdue:true,dueDate:'2026-02-30'})).replace(/<!--.*?-->/g,'');
 assert.match(invalid,/2026-02-30/);
 assert.doesNotMatch(invalid,/02\.03\.2026|Invalid Date/);
 assert.doesNotMatch(String(status.overdueMarker({overdue:true})),/Invalid Date| · /);
});
test('detail history routes retain the selected record filter',()=>{
  assert.equal(typeof status.auditLink,'function');const url=status.auditLink('returns',42),params=audit.auditQueryFromHash(url.slice(url.indexOf('#')));assert.equal(params.get('entity'),'returns');assert.equal(params.get('entityId'),'42');
});
