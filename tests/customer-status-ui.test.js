import test from 'node:test';
import assert from 'node:assert/strict';
import {renderCustomerStatus,loadCustomerStatus} from '../dist/public/customer-status-public.js';
import {renderCustomerShareControls,createCommentSharingState} from '../dist/public/customer-status.js';
import {setLanguage} from '../dist/public/i18n.js';
function root(){const fields=new Map();return {querySelector(selector){if(!fields.has(selector))fields.set(selector,{textContent:'',hidden:false,dataset:{},children:[],getAttribute(key){return this[key]??null;},removeAttribute(key){delete this[key];},querySelector(){return {};},replaceChildren(...nodes){this.children=nodes;},setAttribute(key,value){this[key]=value;}});return fields.get(selector);},fields};}
const data={returnNumber:'RET-2026-42',productName:'<img src=x onerror=alert(1)>',status:'In Prüfung',statusTone:'checking',isClosed:false,updatedAt:'2026-10-28T12:00:00Z',publicNote:'Öffentlich <script> & Text'};
test('customer status rendering uses literal text and preserves only public information',()=>{const r=root();renderCustomerStatus(r,data,'de');assert.equal(r.querySelector('[data-customer-product]').textContent,data.productName);assert.equal(r.querySelector('[data-customer-note]').textContent,data.publicNote);assert.equal(r.querySelector('[data-customer-status]').textContent,'In Prüfung');assert.equal(r.querySelector('[data-customer-data]').hidden,false);assert.equal(r.querySelector('[data-customer-error]').hidden,true);assert.equal(r.querySelector('[data-customer-status]').dataset.tone,'checking');});
test('an invalid or expired link removes previously shown customer data rather than retaining a stale status',async()=>{const r=root();renderCustomerStatus(r,data,'en');await loadCustomerStatus({root:r,token:'a'.repeat(22),language:'en',fetcher:async()=>({ok:false,status:404})});assert.equal(r.querySelector('[data-customer-data]').hidden,true);assert.equal(r.querySelector('[data-customer-error]').hidden,false);for(const key of ['product','note','number','status','updated'])assert.equal(r.querySelector('[data-customer-'+key+']').textContent,'');assert.match(r.querySelector('[data-customer-error-copy]').textContent,/expired|available/i);});
test('public refresh omits cookies and caching and accepts only the short-link token shape',async()=>{const r=root();let requests=0;await loadCustomerStatus({root:r,token:'b'.repeat(22),language:'de',fetcher:async(path,options)=>{requests++;assert.equal(path,'/api/public/return-status/'+'b'.repeat(22));assert.equal(options.credentials,'omit');assert.equal(options.cache,'no-store');return {ok:true,json:async()=>data};}});assert.equal(requests,1);await loadCustomerStatus({root:r,token:'../api/returns',language:'de',fetcher:()=>{requests++;}});assert.equal(requests,1);});
test('inline sharing is independently permission gated for returns and disposal orders',()=>{try{for(const [language,label]of [['de','Kundenlink erstellen'],['en','Create customer link']]){setLanguage(language);for(const kind of ['returns','disposals']){assert.equal(String(renderCustomerShareControls({can:()=>false},kind)), '');const markup=String(renderCustomerShareControls({can:key=>key===kind+'Share'},kind));assert.ok(markup.includes(label));if(language==='en')assert.ok(!markup.includes('Auswahl wird erst'),'inline save guidance must be translated');assert.ok(markup.includes('data-customer-share'));assert.ok(!markup.includes('data-share-comment-choices'),'comments belong to the existing feed');assert.ok(!markup.includes('dialog-footer'));}}}finally{setLanguage('de');}});

test('comment visibility keeps reviewed snapshots stable and new comments internal',()=>{
 const state=createCommentSharingState([{id:1,text:'Published copy',createdAt:'2026-10-28'}]);
 state.ingest([{id:1,text:'Internal edit',version:'new'},{id:2,text:'Reviewed @Team',version:'v2'}]);
 assert.equal(state.preview(1).text,'Published copy');state.toggle(1,false);state.toggle(1,true);assert.equal(state.preview(1).text,'Published copy','reselecting a published comment matches the saved public snapshot');assert.equal(state.has(2),false);
 assert.equal(state.toggle(2,true),true);state.ingest([{id:2,text:'Later edit',version:'v3'}]);
 assert.equal(state.preview(2).text,'Reviewed @Team');assert.deepEqual(state.payload(),{commentIds:[1,2],commentVersions:{2:'v2'}});
 state.toggle(2,false);state.toggle(2,true);assert.equal(state.preview(2).text,'Later edit');
 state.remove(1);assert.deepEqual(state.payload().commentIds,[2]);
});
test('comment selection cannot publish unloaded data and enforces the public count limit',()=>{
 const state=createCommentSharingState([]);assert.equal(state.toggle(99,true),false);
 const choices=Array.from({length:21},(_,i)=>({id:i+1,text:'Reviewed '+i,version:'v'+i}));state.ingest(choices);
 for(let i=1;i<=20;i++)assert.equal(state.toggle(i,true),true);
 assert.equal(state.toggle(21,true),false);state.toggle(1,false);assert.equal(state.toggle(21,true),true);assert.equal(state.size,20);
});

test('copying a customer link on HTTP keeps the fallback inside its active modal',async t=>{
 const {copyText}=await import('../dist/public/quick-actions.js');const original=globalThis.document,navigatorDescriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 const target={append(area){area.parent=this;}},body={append(area){area.parent=this;}},area={setAttribute(){},style:{},focus(){this.focused=this.parent===target;},select(){this.selected=this.focused;},remove(){this.removed=true;}};
 globalThis.document={activeElement:null,body,createElement:()=>area,execCommand:()=>Boolean(area.selected)};Object.defineProperty(globalThis,'navigator',{configurable:true,value:{}});
 t.after(()=>{if(original===undefined)delete globalThis.document;else globalThis.document=original;if(navigatorDescriptor)Object.defineProperty(globalThis,'navigator',navigatorDescriptor);else delete globalThis.navigator;});
 await copyText('http://example.test/s/synthetic-link',target);assert.equal(area.parent,target);assert.equal(area.removed,true);
});

function motionRoot(t,reduced=false){
 const original=globalThis.matchMedia;globalThis.matchMedia=()=>({matches:reduced});
 t.after(()=>{if(original===undefined)delete globalThis.matchMedia;else globalThis.matchMedia=original;});
 const r=root(),animations=[],writes=[];
 for(const selector of ['[data-customer-data]','[data-customer-status]','[data-customer-note-section]','[data-customer-refresh] svg']){
  const el=r.querySelector(selector);el.animate=(frames,options)=>{animations.push({selector,frames,options});return {cancel(){},finished:Promise.resolve()};};
 }
 const title=r.querySelector('[data-customer-status]');let value='';Object.defineProperty(title,'textContent',{get:()=>value,set:v=>{value=v;writes.push(v);}});
 return {...r,animations,writes};
}
test('customer status enters once and unchanged polling neither reanimates nor replaces status text',t=>{
 const r=motionRoot(t);renderCustomerStatus(r,data,'de');assert.equal(r.animations.length,1);assert.equal(r.animations[0].selector,'[data-customer-data]');
 renderCustomerStatus(r,{...data},'de');assert.equal(r.animations.length,1,'an unchanged poll remains visually quiet');assert.equal(r.writes.length,1,'unchanged live-region text is retained');
});
test('an actual status change is highlighted without replaying the entire customer page',t=>{
 const r=motionRoot(t);renderCustomerStatus(r,data,'de');r.animations.length=0;renderCustomerStatus(r,{...data,status:'Abgeschlossen',statusTone:'done',isClosed:true},'de');
 assert.deepEqual(r.animations.map(x=>x.selector),['[data-customer-status]']);assert.equal(r.querySelector('[data-customer-status]').textContent,'Abgeschlossen');
});
test('manual customer refresh animates the existing SVG while automatic polling stays quiet',async t=>{
 const r=motionRoot(t),fetcher=async()=>({ok:true,json:async()=>data});renderCustomerStatus(r,data,'de');r.animations.length=0;
 await loadCustomerStatus({root:r,token:'c'.repeat(22),fetcher,feedback:true});assert.deepEqual(r.animations.map(x=>x.selector),['[data-customer-refresh] svg']);
 r.animations.length=0;await loadCustomerStatus({root:r,token:'c'.repeat(22),fetcher});assert.equal(r.animations.length,0);
});
test('reduced motion and unavailable animation APIs keep customer status functional without motion',async t=>{
 const r=motionRoot(t,true),fetcher=async()=>({ok:true,json:async()=>data});await loadCustomerStatus({root:r,token:'d'.repeat(22),fetcher,feedback:true});renderCustomerStatus(r,{...data,status:'Abgeschlossen'},'de');assert.equal(r.animations.length,0);
 const plain=root();await loadCustomerStatus({root:plain,token:'d'.repeat(22),fetcher,feedback:true});assert.equal(plain.querySelector('[data-customer-data]').hidden,false);
});

test('rapid manual refreshes let the current icon rotation finish instead of snapping back',async t=>{
 const r=motionRoot(t),fetcher=async()=>({ok:true,json:async()=>data});renderCustomerStatus(r,data,'de');let rotations=0;
 r.querySelector('[data-customer-refresh] svg').animate=()=>{rotations++;return {cancel(){},finished:new Promise(()=>{})};};
 await loadCustomerStatus({root:r,token:'e'.repeat(22),fetcher,feedback:true});await loadCustomerStatus({root:r,token:'e'.repeat(22),fetcher,feedback:true});assert.equal(rotations,1);
});

test('optional customer facts can be absent without leaving stale private values or failing refresh',async()=>{
 const r=root();renderCustomerStatus(r,data);
 const minimal={returnNumber:'RET-2026-42',status:'In Prüfung',statusTone:'checking',isClosed:false};
 await loadCustomerStatus({root:r,token:'f'.repeat(22),fetcher:async()=>({ok:true,json:async()=>minimal})});
 assert.equal(r.querySelector('[data-customer-data]').hidden,false);assert.equal(r.querySelector('[data-customer-product]').textContent,'');assert.equal(r.querySelector('[data-customer-product-section]').hidden,true);assert.equal(r.querySelector('[data-customer-updated-section]').hidden,true);assert.equal(r.querySelector('[data-customer-note-section]').hidden,true);
});

test('public comments use literal text, stay quiet on unchanged polling, and clear on invalidation',async()=>{
 const r=root(),make=()=>({children:[],textContent:'',append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){this.children=nodes;}});r.ownerDocument={createElement:make};const list=r.querySelector('[data-customer-comments]');list.replaceChildren=function(...nodes){this.children=nodes;this.paints=(this.paints??0)+1;};
 const shared={...data,comments:[{text:'<img src=x onerror=alert(1)> & Nachricht',createdAt:'2026-10-28T12:00:00Z'}]};renderCustomerStatus(r,shared);
 assert.equal(r.querySelector('[data-customer-comments-section]').hidden,false);assert.equal(list.children[0].children[0].textContent,shared.comments[0].text);const paints=list.paints;
 renderCustomerStatus(r,structuredClone(shared));assert.equal(list.paints,paints);
 await loadCustomerStatus({root:r,token:'f'.repeat(22),fetcher:async()=>({ok:false,status:404})});assert.equal(r.querySelector('[data-customer-comments-section]').hidden,true);assert.equal(list.children.length,0);
});

test('neutralizing mentions in a maximum-length comment does not hide the public status',async()=>{
 const r=root();r.ownerDocument={createElement:()=>({children:[],append(...nodes){this.children.push(...nodes);}})};
 const expanded={...data,comments:[{text:'x'.repeat(3995)+' @Team',createdAt:'2026-10-28T12:00:00Z'}]};
 await loadCustomerStatus({root:r,token:'g'.repeat(22),fetcher:async()=>({ok:true,json:async()=>expanded})});assert.equal(r.querySelector('[data-customer-data]').hidden,false);assert.equal(r.querySelector('[data-customer-comments]').children[0].children[0].textContent.length,4001);
});

test('customer refresh keeps its visible DE/EN label stable while a real startup request is pending',async()=>{
 const originals=new Map(['document','location','matchMedia','fetch','setInterval','navigator'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 try{
  for(const language of ['de','en']){
   const r=root(),button=r.querySelector('[data-customer-refresh]'),label=r.querySelector('[data-copy="refresh"]'),requests=[];
   label.textContent='Aktualisieren';button.querySelector=()=>label;r.querySelectorAll=()=>[];
   const values={document:{querySelector:()=>r,documentElement:{dataset:{},lang:language},addEventListener(){}},location:{pathname:'/s/'+'h'.repeat(22)},navigator:{language},matchMedia:()=>({matches:false}),fetch:()=>new Promise(resolve=>requests.push(resolve)),setInterval:()=>0};
   for(const [key,value]of Object.entries(values))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
   await import('../dist/public/customer-status-public.js?refresh-stability-'+language);
   requests[0]({ok:true,json:async()=>data});await new Promise(setImmediate);
   const expected=language==='de'?'Aktualisieren':'Refresh';assert.equal(label.textContent,expected);
   button.onclick();const during={label:label.textContent,busy:button['aria-busy'],name:button['aria-label']};
   requests[1]({ok:true,json:async()=>data});await new Promise(setImmediate);
   assert.equal(during.label,expected,'the loading state must not resize the visible label in '+language);
   assert.equal(during.busy,'true');assert.equal(during.name,language==='de'?'Wird aktualisiert …':'Refreshing …');
   assert.equal(button.disabled,false);assert.equal(button['aria-busy'],'false');assert.equal(button['aria-label'],expected);assert.equal(label.textContent,expected);
  }
 }finally{for(const [key,descriptor]of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
});

test('customer progress follows return semantics instead of guessing from translated status names',async()=>{
 const module=await import('../dist/public/customer-status-public.js');assert.equal(typeof module.customerProgressPhase,'function');
 for(const [statusTone,isClosed,want]of [['received',false,0],['checking',false,1],['working',false,1],['neutral',false,null],['warning',false,null],['danger',false,null],['done',false,null],['neutral',true,2],['received',true,2]]){
  assert.equal(module.customerProgressPhase({...data,status:'Frei benannter Status',statusTone,isClosed}),want,statusTone+'/'+isClosed);
 }
 assert.equal(module.customerProgressPhase(null),null);
});

test('customer progress marks the current step accessibly and clears stale completion on reopen or invalid links',()=>{
 const r=root();renderCustomerStatus(r,{...data,statusTone:'working'});
 const progress=r.querySelector('[data-customer-progress]'),received=r.querySelector('[data-customer-step="received"]'),processing=r.querySelector('[data-customer-step="processing"]'),completed=r.querySelector('[data-customer-step="completed"]');
 assert.equal(progress.hidden,false);assert.equal(received.dataset.state,'complete');assert.equal(processing.dataset.state,'current');assert.equal(processing['aria-current'],'step');assert.equal(completed.dataset.state,'upcoming');
 renderCustomerStatus(r,{...data,isClosed:true,statusTone:'done'},'en');assert.equal(completed.dataset.state,'complete');assert.equal(completed['aria-current'],'step');assert.equal(processing['aria-current'],undefined);assert.equal(progress['aria-label'],'Return progress');
 renderCustomerStatus(r,{...data,isClosed:false,statusTone:'received'});assert.equal(received.dataset.state,'current');assert.equal(processing.dataset.state,'upcoming');assert.equal(completed.dataset.state,'upcoming');assert.equal(completed['aria-current'],undefined);
 renderCustomerStatus(r,{...data,statusTone:'warning'});assert.equal(progress.hidden,true);
 renderCustomerStatus(r,null);assert.equal(progress.hidden,true);for(const step of [received,processing,completed])assert.equal(step['aria-current'],undefined);
});

const disposal={recordKind:'disposal',disposalNumber:'DIS-2026-42',productName:'Device',status:'Freigegeben',statusKey:'approved',statusTone:'checking',isClosed:false};
test('disposal public view uses its own endpoint, number and localized workflow',async()=>{
 const r=root();await loadCustomerStatus({root:r,kind:'disposals',token:'j'.repeat(22),language:'en',fetcher:async(path)=>{assert.equal(path,'/api/public/disposal-status/'+'j'.repeat(22));return {ok:true,json:async()=>disposal};}});
 assert.equal(r.querySelector('[data-customer-number]').textContent,disposal.disposalNumber);assert.equal(r.querySelector('[data-customer-status]').textContent,'Approved');assert.equal(r.querySelector('[data-copy="numberLabel"]').textContent,'Order number');assert.equal(r.querySelector('[data-copy="progressReceived"]').textContent,'Planned');
 await loadCustomerStatus({root:r,kind:'disposals',token:'j'.repeat(22),language:'en',fetcher:async()=>({ok:true,json:async()=>data})});assert.equal(r.querySelector('[data-customer-data]').hidden,true,'a return payload must not appear on an order URL');
});
test('disposal progress never shows a cancelled order as successfully completed',async()=>{
 const {customerProgressPhase}=await import('../dist/public/customer-status-public.js');
 for(const [statusKey,isClosed,want]of [['planned',false,0],['approved',false,1],['completed',true,2],['cancelled',true,null]])assert.equal(customerProgressPhase({...disposal,statusKey,isClosed}),want);
});
