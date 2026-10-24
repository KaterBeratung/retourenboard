import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';

// PDF.js owns slow parsing/rendering; keep our real dialog, parser and lifecycle.
const compiled=await build({stdin:{contents:"export * from './frontend/src/scan-labels.ts'; export {setLanguage} from './frontend/src/i18n.js';",resolveDir:fileURLToPath(new URL('../',import.meta.url))},bundle:true,write:false,platform:'node',format:'esm',target:'node22',external:['/vendor/ocr/*'],plugins:[{name:'pdf-library-boundary',setup(builder){builder.onResolve({filter:/^\.\.\/shared\/model\.js$/},()=>({path:fileURLToPath(new URL('../backend/src/shared/model.js',import.meta.url))}));builder.onResolve({filter:/^\/vendor\/pdfjs\/pdf\.min\.mjs$/},()=>({path:'pdf-library',namespace:'test-pdf'}));builder.onLoad({filter:/.*/,namespace:'test-pdf'},()=>({contents:"export const GlobalWorkerOptions={}; export function getDocument(options){return globalThis.__pdfDocumentFixture(options);}"}));}}]});
const scanner=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text+'\n//# sourceURL=pdf-serial-dialog-source.mjs\n').toString('base64'));
const textItem=value=>({str:'SN: '+value,transform:[10,0,0,10,20,700],width:100,height:10,hasEOL:true});
function setup(t){
  const nodes={},listeners={},originalForm={open:true,innerHTML:'<form>unsaved serial, product and notes</form>'};
  for(const name of ['video','value','status','start','stop','camera-idle','close','use','photo','photo-pick','pdf','pdf-pick','pdf-status','pdf-results','pdf-list','pdf-count','pdf-info','pdf-name','pdf-cancel'])nodes[`[data-scan-${name}]`]={value:'',hidden:false,disabled:false,textContent:'',innerHTML:'',srcObject:null,pause(){},focus(){},click(){this.clicked=true;},addEventListener(event,fn){this[event]=fn;},setAttribute(){},removeAttribute(){}};
  const dialog={open:false,attrs:{},events:{},classList:{add(){},remove(){}},setAttribute(key,value){this.attrs[key]=value;},querySelector:selector=>nodes[selector],querySelectorAll:()=>[],showModal(){this.open=true;},close(){this.open=false;this.events.close?.();},remove(){this.removed=true;},addEventListener(event,fn){this.events[event]=fn;}};
  const old={document:globalThis.document,window:globalThis.window,navigator:Object.getOwnPropertyDescriptor(globalThis,'navigator'),secure:globalThis.isSecureContext,fixture:globalThis.__pdfDocumentFixture};
  globalThis.document={createElement:()=>dialog,querySelector:()=>originalForm,body:{append(){}},addEventListener(event,fn){listeners[event]=fn;},removeEventListener(){},hidden:false};
  globalThis.window={addEventListener(event,fn){listeners[event]=fn;},removeEventListener(){}};Object.defineProperty(globalThis,'navigator',{value:{mediaDevices:{getUserMedia:async()=>{throw new Error('automatic camera');}}},configurable:true});globalThis.isSecureContext=true;
  const values=[],ctx={unlocked:true,authGeneration:1,session:{user:{id:1}}};
  t.after(()=>{scanner.stopScanner();globalThis.document=old.document;globalThis.window=old.window;globalThis.isSecureContext=old.secure;globalThis.__pdfDocumentFixture=old.fixture;if(old.navigator)Object.defineProperty(globalThis,'navigator',old.navigator);else delete globalThis.navigator;scanner.setLanguage('de');});
  const choose=()=>{const input=nodes['[data-scan-pdf]'];input.value='C:\\fakepath\\test-labels.pdf';input.files=[{name:'test-labels.pdf',type:'application/pdf',size:200,arrayBuffer:async()=>new TextEncoder().encode('%PDF-1.7\nfixture').buffer}];assert.equal(typeof input.onchange,'function');return input.onchange({target:input});};
  const select=index=>nodes['[data-scan-pdf-list]'].onclick({target:{closest:selector=>selector==='[data-scan-pdf-candidate]'?{dataset:{scanPdfCandidate:String(index)}}:null}});
  return {dialog,nodes,listeners,originalForm,values,ctx,choose,select,open:()=>scanner.openScanner(ctx,{onScan:value=>values.push(value)})};
}
test('PDF results require one explicit button selection and preserve the underlying unsaved form',async t=>{
  const d=setup(t);globalThis.__pdfDocumentFixture=()=>({promise:Promise.resolve({numPages:1,getPage:async()=>({getTextContent:async()=>({items:[textItem('00ABC12'),{...textItem('00DEF34'),transform:[10,0,0,10,20,680]}]}),cleanup(){}})}),destroy(){}});
  d.open();await d.choose();assert.deepEqual(d.values,[]);assert.equal(d.dialog.open,true);assert.equal(d.originalForm.innerHTML,'<form>unsaved serial, product and notes</form>');
  assert.equal(d.nodes['[data-scan-pdf-results]'].hidden,false);assert.match(d.nodes['[data-scan-pdf-list]'].innerHTML,/<button/);assert.doesNotMatch(d.nodes['[data-scan-pdf-list]'].innerHTML,/<a\b/);assert.match(d.nodes['[data-scan-pdf-count]'].textContent,/2/);
  d.select(1);await Promise.resolve();assert.deepEqual(d.values,['00DEF34']);assert.equal(d.dialog.open,false);assert.equal(d.originalForm.open,true);
});
test('closing during PDF reading ignores late extraction and destroys the loading task',async t=>{
  const d=setup(t);let resolveText,destroyed=0;globalThis.__pdfDocumentFixture=()=>({promise:Promise.resolve({numPages:1,getPage:async()=>({getTextContent:()=>new Promise(resolve=>resolveText=resolve),cleanup(){}})}),destroy(){destroyed++;}});
  d.open();const reading=d.choose();await new Promise(setImmediate);d.nodes['[data-scan-close]'].onclick();resolveText({items:[textItem('OLD1234')]});await reading;assert.deepEqual(d.values,[]);assert.equal(destroyed,1);assert.equal(d.dialog.open,false);assert.equal(d.nodes['[data-scan-pdf-results]'].hidden,true);
});
test('PDF status and candidate information use English and password failure permits another file',async t=>{
  scanner.setLanguage('en');const d=setup(t);globalThis.__pdfDocumentFixture=()=>({promise:Promise.reject(Object.assign(new Error('password'),{name:'PasswordException'})),destroy(){}});
  d.open();await d.choose();assert.match(d.nodes['[data-scan-pdf-status]'].textContent,/password/i);assert.equal(d.dialog.open,true);assert.deepEqual(d.values,[]);
  globalThis.__pdfDocumentFixture=()=>({promise:Promise.resolve({numPages:1,getPage:async()=>({getTextContent:async()=>({items:[textItem('00001234')]}),cleanup(){}})}),destroy(){}});
  await d.choose();assert.match(d.nodes['[data-scan-pdf-info]'].textContent,/choose|select/i);assert.match(d.nodes['[data-scan-pdf-list]'].innerHTML,/Page 1/);assert.deepEqual(d.values,[]);
});
test('cancelling PDF processing resets its input immediately so the same file can be selected again',async t=>{
  const d=setup(t);let resolveText;globalThis.__pdfDocumentFixture=()=>({promise:Promise.resolve({numPages:1,getPage:async()=>({getTextContent:()=>new Promise(resolve=>resolveText=resolve),cleanup(){}})}),destroy(){}});
  d.open();const reading=d.choose();await new Promise(setImmediate);d.nodes['[data-scan-pdf-cancel]'].onclick();assert.equal(d.nodes['[data-scan-pdf]'].value,'');resolveText({items:[textItem('OLD1234')]});await reading;assert.deepEqual(d.values,[]);assert.equal(d.dialog.open,true);
});
