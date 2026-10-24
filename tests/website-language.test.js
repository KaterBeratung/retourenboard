import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const originalDocument=globalThis.document, originalWindow=globalThis.window;
globalThis.document={querySelector:()=>null,querySelectorAll:()=>[],getElementById:()=>null,addEventListener(){},createTreeWalker:()=>({nextNode:()=>null}),documentElement:{lang:'de',dataset:{},style:{}}};
globalThis.window={matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}})};
let module;
try { module=await import('../website/dist/site.js'); }
finally { globalThis.document=originalDocument;globalThis.window=originalWindow; }

function page(){
 const texts=[{textContent:' Retouren rein. ',parentElement:{closest:()=>null}},{textContent:'bash retourenboard-install.sh --test',parentElement:{closest:()=>null}}];
 const metadata={values:{'aria-label':'Hauptnavigation'},getAttribute(name){return this.values[name]??null;},setAttribute(name,value){this.values[name]=value;}};
 const label={textContent:'EN'},button={hidden:true,values:{},setAttribute(name,value){this.values[name]=value;},querySelector:()=>label,addEventListener(name,listener){this[name]=listener;}};
 const doc={documentElement:{lang:'de',dataset:{},style:{}},createTreeWalker(){let i=0;return {nextNode:()=>texts[i++]??null};},querySelectorAll:()=>[metadata],querySelector:()=>button};
 return {doc,texts,metadata,button,label};
}

test('website language changes text and accessibility metadata in place and survives a reload',()=>{
 assert.equal(typeof module.createLanguageController,'function');
 const fixture=page(),saved=new Map();
 const storage={getItem:key=>saved.get(key)??null,setItem:(key,value)=>saved.set(key,value)};
 const controller=module.createLanguageController(fixture.doc,()=>storage);
 assert.equal(fixture.doc.documentElement.lang,'de');
 fixture.button.click();
 assert.equal(fixture.doc.documentElement.lang,'en');
 assert.equal(fixture.texts[0].textContent,' Returns in. ');
 assert.equal(fixture.texts[1].textContent,'bash retourenboard-install.sh --test');
 assert.equal(fixture.metadata.values['aria-label'],'Main navigation');
 assert.equal(fixture.label.textContent,'DE');
 assert.equal(fixture.button.values['aria-label'],'Switch to German');
 assert.equal(fixture.button.lang,'en');
 assert.equal(fixture.label.lang,'de');
 assert.equal(fixture.button.hidden,false);
 const next=page();module.createLanguageController(next.doc,()=>storage);
 assert.equal(next.doc.documentElement.lang,'en');
 controller.setLanguage('de');
 assert.equal(fixture.texts[0].textContent,' Retouren rein. ');
 assert.equal(fixture.metadata.values['aria-label'],'Hauptnavigation');
});

test('blocked storage or an unsupported saved locale does not prevent language switching',()=>{
 assert.equal(typeof module.createLanguageController,'function');
 for(const storage of [()=>{throw new Error('Storage denied');},()=>({getItem:()=> 'fr',setItem(){throw new Error('Storage denied');}})]){
  const fixture=page(),controller=module.createLanguageController(fixture.doc,storage);
  assert.equal(fixture.doc.documentElement.lang,'de');
  controller.setLanguage('en');
  assert.equal(fixture.texts[0].textContent,' Returns in. ');
 }
});

test('interactive notices use the current language while identifiers and commands remain intact',()=>{
 assert.equal(typeof module.translateText,'function');
 assert.equal(module.translateText('In Prüfung','en'),'Under review');
 assert.equal(module.translateText('Befehl kopiert.','en'),'Command copied.');
 assert.equal(module.translateText('Befehl kopiert.','de'),'Befehl kopiert.');
 assert.equal(module.translateText('SN-DEMO-0042','en'),'SN-DEMO-0042');
 assert.equal(module.translateText('constructor','en'),'constructor');
});

test('all static marketing copy has an English translation or is an intentional name or identifier',()=>{
 const html=['index.html','privacy-banner.html','datenschutz.html','impressum.html'].map(name=>readFileSync(new URL('../website/src/'+name,import.meta.url),'utf8')).join('\n');
 const neutral=new Set(['retourenboard','retourenboard.','Team','Administrator','Installation','Bash','GitHub','Lena','Max','@Max','Nordlicht Handel','KH-104 · Nordlicht Handel','retourenboard-install.sh','bash retourenboard-install.sh --test','--test','--local','JPG / JPEG','PDF · JPG','Version @@VERSION@@','EN','↙ Export','⟳ Updates']);
 const copy=[...new Set([...html.matchAll(/>([^<]+)</g)].map(m=>m[1].trim()).filter(Boolean))];
 const missing=copy.filter(text=>/[a-zA-ZäöüÄÖÜß]/.test(text)&&!Object.hasOwn(module.englishText,text)&&!neutral.has(text)&&!/^(@@[A-Z_]+@@\s*)+$/.test(text)&&!/^([A-Z]{1,4}|RET-\d+-\d+|SN-DEMO-\d+)$/.test(text));
 assert.deepEqual(missing,[],'New website text must also be available in English');
});
