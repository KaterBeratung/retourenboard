import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {t} from '../dist/public/i18n.js';

// Exercise the shipped commit handler at its DOM/network boundary.
function commitBoundary(){
  const source=readFileSync(new URL('../dist/public/import.js',import.meta.url),'utf8');
  const start=source.indexOf("    $('commit-button').onclick = async () => {");
  const end=source.indexOf('\n    };',start)+7;
  assert.ok(start>=0&&end>start,'The actual shipped import handler must be present');
  let nodes={'commit-button':{disabled:false},'preview-button':{disabled:false},'csv-file':{}},generation=1;
  const originalFile=nodes['csv-file'];
  const dialog={open:true,closes:0,close(){this.closes++;this.open=false;}};
  const effects={reloads:0,clears:0,errors:[],toasts:[]};
  let resolve,reject;
  const ctx={api:()=>new Promise((yes,no)=>{resolve=yes;reject=no;}),reload:async()=>effects.reloads++,toast:message=>effects.toasts.push(String(message))};
  const inputGeneration={get current(){return generation;}};
  const get=id=>nodes[id];
  const handler=new Function('$','dialog','ctx','preview','importSession','clearPreview','showError','active','inputGeneration','parsed','t',source.slice(start,end)+";return $('commit-button').onclick;")(
    get,dialog,ctx,{rows:[{}]},{getCommitPayload:()=>({previewToken:'accepted'})},()=>{effects.clears++;generation++;},error=>effects.errors.push(error.message),()=>dialog.open&&nodes['csv-file']===originalFile,inputGeneration,{rows:[{}]},t
  );
  return {handler,dialog,effects,finish:()=>resolve({created:1,updated:0,skipped:0}),fail:()=>reject(new Error('Import fehlgeschlagen.')),
    replaceDialog(){nodes={'commit-button':{disabled:false},'preview-button':{disabled:true},'csv-file':{}};dialog.open=true;},
    changeInput(){generation++;nodes['preview-button'].disabled=true;},get previewButton(){return nodes['preview-button'];}};
}

test('a successful active import closes and refreshes once',async()=>{
  const f=commitBoundary(),pending=f.handler();f.finish();await pending;
  assert.equal(f.dialog.closes,1);assert.equal(f.effects.reloads,1);assert.match(f.effects.toasts[0],/Import abgeschlossen: 1 neu/);
});

test('a late import success keeps a newer dialog open and reports its result',async()=>{
  const f=commitBoundary(),pending=f.handler();f.replaceDialog();f.finish();await pending;
  assert.equal(f.dialog.open,true);assert.equal(f.dialog.closes,0);assert.equal(f.effects.reloads,0);
  assert.equal(f.previewButton.disabled,true);assert.match(f.effects.toasts[0],/Import abgeschlossen/);
});

test('an active failed import can be checked again without changing its input',async()=>{
  const f=commitBoundary(),pending=f.handler();f.fail();await pending;
  assert.equal(f.dialog.open,true);assert.equal(f.effects.clears,1);assert.deepEqual(f.effects.errors,['Import fehlgeschlagen.']);
  assert.equal(f.previewButton.disabled,false);
});

test('a late import failure cannot replace a newer dialog error or button state',async()=>{
  const f=commitBoundary(),pending=f.handler();f.replaceDialog();f.fail();await pending;
  assert.equal(f.dialog.open,true);assert.equal(f.effects.clears,0);assert.deepEqual(f.effects.errors,[]);assert.equal(f.previewButton.disabled,true);
  assert.match(f.effects.toasts[0],/Import fehlgeschlagen/);
});

test('completing an older import preserves newly changed invalid input',async()=>{
  const f=commitBoundary(),pending=f.handler();f.changeInput();f.finish();await pending;
  assert.equal(f.dialog.open,true);assert.equal(f.effects.reloads,0);assert.equal(f.previewButton.disabled,true);
});
