import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceModule} from './helpers/source-module.js';

// Exercise the shared renderer used by desktop rows and mobile cards without
// mounting the application's navigation, polling or authentication lifecycle.
const source=readFileSync('frontend/src/app.ts','utf8');
const renderer=source.match(/^function returnSelect\(item\)\{.*$/m)?.[0];
assert.ok(renderer);
const {render,setLanguage,addTranslations}=await sourceModule(`
 import {html,t,setLanguage,addTranslations} from './frontend/src/i18n.js';
 import {h} from './frontend/src/ui.js';
 let selected=false;
 const returnSelection={has:()=>selected};
 ${renderer}
 export function render(number,checked){selected=checked;return String(returnSelect({id:7,returnNumber:number}));}
 export {setLanguage,addTranslations};
`);
addTranslations({'Retoure auswählen:':'Select return:'});
for(const language of ['de','en'])for(const selected of [false,true]){
 test(`return selection preserves its label and state (${language}, ${selected})`,()=>{
  setLanguage(language);
  const output=render('RET-2026-000007',selected);
  assert.match(output,new RegExp(`aria-label="${language==='en'?'Select return':'Retoure auswählen'}: RET-2026-000007"`));
  assert.equal(output.includes(' checked'),selected);
  assert.match(output,/data-select-return="7"/);
 });
 for(const payload of ['"><span data-injected>probe</span><input aria-label="',"\" autofocus onfocus='probe' data-label=\"",'<img src=x> & \"quote\"']){
  test(`return selection keeps stored markup inside its attribute (${language}, ${selected}, ${payload})`,()=>{
   setLanguage(language);
   const output=render(payload,selected);
   assert.deepEqual(output.match(/<\/?[a-z][^>]*>/gi)?.map(tag=>tag.match(/^<\/?[a-z]+/i)[0]),['<label','<input','</label']);
   const label=output.match(/aria-label="([^"]*)"/)[1];
   const decoded=label.replace(/&(amp|lt|gt|quot|#39);/g,(_,entity)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"}[entity]));
   assert.equal(decoded,`${language==='en'?'Select return':'Retoure auswählen'}: ${payload}`);
   assert.equal(output.includes(' checked'),selected);
  });
 }
}
