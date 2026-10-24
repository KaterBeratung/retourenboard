import test from 'node:test';
import assert from 'node:assert/strict';
import {setLanguage} from '../dist/public/i18n.js';
const drafts=await import(process.env.RETURN_DRAFTS_MODULE||'../dist/public/return-drafts.js').catch(()=>({}));

function storage(){const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key),values};}
function setup(){assert.equal(typeof drafts.createReturnDraftStore,'function');const local=storage();let time=Date.parse('2026-10-13T10:00:00Z');return {local,store:drafts.createReturnDraftStore(local,()=>time),advance:ms=>time+=ms};}
function context(extra={}){return {authGeneration:1,session:{user:{id:7}},can:()=>true,products:[{id:1,active:true},{id:2,active:false}],masterdata:{suppliers:[{id:21,active:true}],reasons:[{id:3,active:true}],conditions:[{id:4,active:true}],statuses:[{id:5,active:true},{id:6,active:false}],resolutions:[{id:18,active:true}]},returnAssignees:[{id:8,displayName:'Person',active:true}],returns:[],...extra};}

test('drafts persist only supported bounded text fields and isolate accounts',()=>{
 const {store,local}=setup();const saved=store.write(7,{serialNumber:'SN-001',productId:'1',notes:'text',csrfToken:'secret',password:'secret',image:new File(['bytes'],'private.jpg'),priceCents:'900'});
 assert.deepEqual(saved.fields,{serialNumber:'SN-001',productId:'1',notes:'text'});
 assert.deepEqual(store.read(7).fields,{serialNumber:'SN-001',productId:'1',notes:'text'});
 assert.equal(store.read(8),null);assert.doesNotMatch([...local.values.values()].join(''),/secret|bytes|private.jpg|priceCents/);
 assert.equal(store.write(null,{notes:'anonymous'}),null);
 assert.equal(store.write(7,{notes:'x'.repeat(5001)},{expectedRevision:saved.revision}),null);
 assert.equal(store.read(7).revision,saved.revision);
});
test('malformed, wrong-account, future and expired records are ignored without throwing',()=>{
 for(const change of [raw=>'not JSON',raw=>'x'.repeat(30000),raw=>JSON.stringify({...JSON.parse(raw),accountId:'8'}),raw=>JSON.stringify({...JSON.parse(raw),updatedAt:Date.parse('2026-10-14T10:00:00Z')}),raw=>JSON.stringify({...JSON.parse(raw),fields:{notes:{secret:'value'}}})]){
  const {store,local}=setup();store.write(7,{notes:'draft'});const key=[...local.values.keys()][0];local.setItem(key,change(local.getItem(key)));assert.equal(store.read(7),null);
 }
 const {store,advance}=setup();store.write(7,{notes:'draft'});advance(25*60*60*1000);assert.equal(store.read(7),null);
 const failing={getItem(){throw Error('blocked');},setItem(){throw Error('full');},removeItem(){throw Error('blocked');}};
 const blocked=drafts.createReturnDraftStore(failing);assert.equal(blocked.read(7),null);assert.equal(blocked.write(7,{notes:'keep'}),null);assert.equal(blocked.clear(7,'revision'),false);
});
test('captured revision clears cannot remove or overwrite a newer draft',()=>{
 const {store}=setup(),first=store.write(7,{serialNumber:'FIRST'});
 const second=store.write(7,{serialNumber:'SECOND'},{expectedRevision:first.revision});
 assert.ok(second);assert.equal(store.clear(7,first.revision),false);assert.equal(store.write(7,{serialNumber:'STALE'},{expectedRevision:first.revision}),null);
 assert.equal(store.read(7).fields.serialNumber,'SECOND');assert.equal(store.clear(7,second.revision),true);assert.equal(store.read(7),null);
});
test('restoration validates current references and excludes historical product prices',()=>{
 const {store}=setup(),draft=store.write(7,{productId:'2',supplierId:'999',reasonId:'3',conditionId:'4',statusId:'6',resolutionId:'18',assignedUserId:'999',serialNumber:'SN',receiptDate:'2026-02-30',notes:'Keep this',price:'1200'});
 assert.equal(typeof drafts.validateReturnDraft,'function');const restored=drafts.validateReturnDraft(context(),draft);
 assert.equal(restored.changed,true);assert.equal(restored.item.productId,'');assert.equal(restored.item.supplierId,'');assert.equal(restored.item.statusId,'');assert.equal(restored.item.assignedUserId,'');assert.equal(restored.item.receiptDate,'');
 assert.equal(restored.item.reasonId,3);assert.equal(restored.item.notes,'Keep this');assert.equal(restored.item.price,undefined);
 assert.equal(drafts.validateReturnDraft(context({can:()=>false}),draft),null);
});
test('saved-return drafts recover the existing record only with edit rights and retain protected status',()=>{
 const {store}=setup(),draft=store.write(7,{productId:'1',statusId:'5',serialNumber:'NEW'},{returnId:91});
 const ctx=context({returns:[{id:91,productId:1,statusId:6,serialNumber:'OLD',priceCents:99999}],can:key=>key!=='returnsStatus'}),restored=drafts.validateReturnDraft(ctx,draft);
 assert.equal(restored.item.id,91);assert.equal(restored.item.statusId,6);assert.equal(restored.item.serialNumber,'NEW');assert.equal(restored.item.priceCents,undefined);
 assert.equal(drafts.validateReturnDraft(context(),draft),null);
 assert.equal(drafts.validateReturnDraft({...ctx,can:key=>key!=='returnsEdit'},draft),null);
});
test('saved-record recovery preserves an unchanged historical assignee absent from the active list',()=>{
 const {store}=setup(),draft=store.write(7,{productId:'1',assignedUserId:'8',serialNumber:'NEW'},{returnId:91}),ctx=context({returnAssignees:[],returns:[{id:91,productId:1,assignedUserId:8,assignedDisplayName:'Archived person'}]});
 const restored=drafts.validateReturnDraft(ctx,draft);assert.equal(restored.item.assignedUserId,8);assert.equal(restored.changed,false);
 const changed={...draft,fields:{...draft.fields,assignedUserId:'9'}};assert.equal(drafts.validateReturnDraft(ctx,changed).item.assignedUserId,'');
});

test('exchange serial relevance uses semantic resolution metadata and always keeps entered values visible',()=>{
 assert.equal(typeof drafts.replacementSerialRelevant,'function');
 assert.equal(drafts.replacementSerialRelevant({builtinKey:'resolutions.exchange',name:'Austausch'}),true);
 assert.equal(drafts.replacementSerialRelevant({code:'exchange',name:'Custom wording'}),true);
 assert.equal(drafts.replacementSerialRelevant({defaultValue:'exchange',name:'Different wording'}),true);
 assert.equal(drafts.replacementSerialRelevant({builtinKey:'resolutions.refund',name:'Erstattung'}),false);
 assert.equal(drafts.replacementSerialRelevant({name:'Austausch'}),false);
 assert.equal(drafts.replacementSerialRelevant({builtinKey:'resolutions.refund'},'KEEP-SN'),true);
 assert.equal(drafts.replacementSerialRelevant({builtinKey:'resolutions.refund'},' '),true);
});

function controller(extra={}){
 assert.equal(typeof drafts.createReturnDraftController,'function');
 const fixture=setup(),ctx=context(),fields={productId:'1',serialNumber:'',receiptDate:'2026-10-13'},states=[];
 const control=drafts.createReturnDraftController(ctx,{store:fixture.store,readFields:()=>({...fields}),onState:state=>states.push(state),...extra});
 return {...fixture,ctx,fields,states,control};
}
test('started drafts persist immediately and are offered after reload without changing the fresh form',async()=>{
 const f=controller();f.fields.serialNumber='BEFORE-RELOAD';f.control.change();
 let applied;const reloaded=drafts.createReturnDraftController(f.ctx,{store:f.store,readFields:()=>({productId:'1',serialNumber:'FRESH'}),apply:item=>applied=item});
 assert.equal(reloaded.offered,true);assert.equal(applied,undefined);
 reloaded.change();assert.equal(f.store.read(7).fields.serialNumber,'BEFORE-RELOAD');
 assert.equal(await reloaded.restore(),true);assert.equal(applied.serialNumber,'BEFORE-RELOAD');assert.equal(reloaded.offered,false);
});
test('successful save removes its captured draft even when the inventory refresh will fail',()=>{
 const f=controller();f.fields.serialNumber='SAVED';f.control.change();const token=f.control.capture();f.control.saved(token,{id:91});
 assert.equal(f.store.read(7),null);
});
test('newer pending edits remain recoverable against the created record without duplicating it',()=>{
 const f=controller();f.fields.serialNumber='FIRST';f.control.change();const token=f.control.capture();
 f.fields.serialNumber='NEWER';f.control.change();f.control.saved(token,{id:91});
 assert.equal(f.store.read(7).fields.serialNumber,'NEWER');assert.equal(f.store.read(7).returnId,91);
 const next=f.control.capture();f.control.saved(next,{id:91});assert.equal(f.store.read(7),null);
});

test('saved return drafts retain their business record revision instead of silently rebasing on recovery',async()=>{
 const f=controller();f.fields.serialNumber='FIRST';f.control.change();const token=f.control.capture();
 f.fields.serialNumber='UNSAVED';f.control.change();f.control.saved(token,{id:91,revision:1});
 const candidate=f.store.read(7);assert.equal(candidate.baseRecordRevision,1);
 f.ctx.returns=[{id:91,revision:2,productId:1,serialNumber:'OTHER EDIT'}];let applied;
 const recovered=drafts.createReturnDraftController(f.ctx,{store:f.store,readFields:()=>candidate.fields,apply:item=>applied=item});
 assert.equal(await recovered.restore(),true);assert.equal(applied.revision,1);assert.equal(f.store.read(7).baseRecordRevision,1);
});
test('legacy saved drafts without a business record revision never adopt the current record revision',()=>{
 const {store}=setup(),candidate=store.write(7,{productId:'1',serialNumber:'OLD'},{returnId:91}),ctx=context({returns:[{id:91,revision:8,productId:1,serialNumber:'LATEST'}]});
 const restored=drafts.validateReturnDraft(ctx,candidate);assert.equal(restored.item.revision,null);
 const invalid=store.write(7,{serialNumber:'bad'},{expectedRevision:candidate.revision,returnId:91,baseRecordRevision:-1});assert.equal(invalid,null);
});
test('a failed saved-record linkage removes the unsafe create draft and reports the failure',()=>{
 const f=controller();f.fields.serialNumber='FIRST';f.control.change();const token=f.control.capture();f.fields.serialNumber='NEWER';f.control.change();
 f.local.setItem=()=>{throw Error('QuotaExceededError');};f.control.saved(token,{id:91});
 assert.equal(f.store.read(7),null,'An already-created return must never recover as a new POST');assert.equal(f.states.at(-1),'linkFailed');
 // The visible newer inputs can still be saved normally or redrafted against
 // their created record once storage becomes available again.
 f.local.setItem=(key,value)=>f.local.values.set(key,value);f.control.change();assert.equal(f.store.read(7).returnId,91);assert.equal(f.store.read(7).fields.serialNumber,'NEWER');
});
test('completion and discard from older forms cannot clear drafts written by a newer form',()=>{
 const f=controller();f.fields.serialNumber='FIRST';f.control.change();const token=f.control.capture();
 const newer=drafts.createReturnDraftController(f.ctx,{store:f.store,readFields:()=>({serialNumber:'SECOND'}),apply(){}});
 newer.discard(false);newer.change();assert.equal(f.store.read(7).fields.serialNumber,'SECOND');
 f.control.saved(token,{id:91});f.control.discard();assert.equal(f.store.read(7).fields.serialNumber,'SECOND');
});
test('discard and reset clear drafts and stale save completion cannot recreate them',()=>{
 for(const action of ['discard','reset']){
  const f=controller();f.fields.serialNumber='FIRST';f.control.change();const token=f.control.capture();f.fields.serialNumber='SECOND';f.control.change();
  f.control[action]();f.control.saved(token,{id:91});assert.equal(f.store.read(7),null);
 }
});
test('account, auth and permission changes block old controllers from writing, restoring or clearing',async()=>{
 for(const invalidate of [ctx=>ctx.session.user.id=8,ctx=>ctx.authGeneration++,ctx=>ctx.session.csrfToken='new-session',ctx=>ctx.can=()=>false]){
  const f=controller();f.fields.serialNumber='PRIVATE';f.control.change();const token=f.control.capture();invalidate(f.ctx);f.fields.serialNumber='LEAK';f.control.change();f.control.saved(token,{id:91});f.control.discard();
  assert.equal(await f.control.restore(),false);assert.equal(f.store.read(7).fields.serialNumber,'PRIVATE');assert.equal(f.store.read(8),null);
 }
});
test('an authenticated creator can discard an old saved-record draft after edit rights are removed',async()=>{
 const f=setup(),ctx=context({can:key=>key==='returnsCreate',returns:[{id:91,productId:1}]});f.store.write(7,{productId:'1',serialNumber:'OLD'},{returnId:91});
 const control=drafts.createReturnDraftController(ctx,{store:f.store,readFields:()=>({productId:'1',serialNumber:'FRESH'})});assert.equal(control.offered,true);assert.equal(await control.restore(),false);
 assert.equal(control.discard(false),true);assert.equal(control.offered,false);assert.equal(f.store.read(7),null);control.change();assert.equal(f.store.read(7).fields.serialNumber,'FRESH');
});
test('an assignee request resolving after a session change cannot apply a restored draft',async()=>{
 const f=controller();f.fields.serialNumber='PRIVATE';f.control.change();let finish,applied=false;
 f.ctx.returnAssignees=undefined;f.ctx.api=()=>new Promise(resolve=>finish=resolve);
 const control=drafts.createReturnDraftController(f.ctx,{store:f.store,readFields:()=>({}),apply:()=>applied=true}),restoring=control.restore();
 f.ctx.authGeneration++;finish([{id:8}]);assert.equal(await restoring,false);assert.equal(applied,false);assert.equal(f.store.read(7).fields.serialNumber,'PRIVATE');
});
test('reset during a pending restore prevents the old response from resurrecting discarded inputs',async()=>{
 const f=setup(),ctx=context({returnAssignees:undefined});f.store.write(7,{productId:'1',serialNumber:'OLD'});let finish,applied=false;ctx.api=()=>new Promise(resolve=>finish=resolve);
 const control=drafts.createReturnDraftController(ctx,{store:f.store,readFields:()=>({serialNumber:''}),apply:()=>applied=true}),restoring=control.restore();control.reset();finish([]);
 assert.equal(await restoring,false);assert.equal(applied,false);assert.equal(f.store.read(7),null);
});

function node(){return {dataset:{},value:'',hidden:false,handlers:{},children:[],attrs:{},addEventListener(name,fn){(this.handlers[name]??=[]).push(fn);},emit(name,event={}){for(const fn of this.handlers[name]??[])fn(event);},setAttribute(name,value){this.attrs[name]=value;},removeAttribute(name){delete this.attrs[name];},append(...nodes){this.children.push(...nodes);},prepend(...nodes){this.children.unshift(...nodes);},before(child){this.previous=child;},focus(){this.focused=true;},remove(){this.removed=true;}};}
const originalDocuments=new WeakMap();
function draftDom(t,values={}){
 if(!originalDocuments.has(t)){originalDocuments.set(t,globalThis.document);t.after(()=>{const original=originalDocuments.get(t);if(original===undefined)delete globalThis.document;else globalThis.document=original;});}
 const form=node(),body=node(),section=node(),submit=node(),controls=Object.fromEntries(Object.entries(values).map(([name,value])=>[name,{...node(),name,value}]));
 form.querySelector=selector=>selector==='.dialog-body'?body:controls[selector.slice(6,-1)]??null;
 form.querySelectorAll=selector=>selector==='.form-section'?[section]:selector==='[type=submit]'?[submit]:[];
 const dialog={...node(),open:true,querySelector:()=>form};
 globalThis.document={createElement(tag){const result=node();if(tag==='section'){const restore=node(),discard=node();result.querySelector=selector=>selector==='[data-draft-restore]'?restore:discard;result.buttons={restore,discard};let markup='';Object.defineProperty(result,'innerHTML',{get:()=>markup,set:value=>{markup=value;for(const [name,button]of Object.entries(result.buttons)){const text=value.match(new RegExp('<button\\b[^>]*data-draft-'+name+'[^>]*>([\\s\\S]*?)</button>'))?.[1]??'';button.textContent=text.replace(/<!--[\s\S]*?-->/g,'').replaceAll('&amp;','&');}}});}return result;}};
 return {form,body,section,submit,dialog,controls};
}
test('draft form listeners clear explicit discard and reset without clearing on auth invalidation',t=>{
 assert.equal(typeof drafts.bindReturnDraft,'function');
 const f=setup(),ctx=context(),dom=draftDom(t,{productId:'1',serialNumber:''});drafts.bindReturnDraft(ctx,dom.dialog,{store:f.store});
 dom.controls.serialNumber.value='PRIVATE';dom.form.emit('input');assert.equal(f.store.read(7).fields.serialNumber,'PRIVATE');
 dom.form.emit('form-discard');assert.equal(f.store.read(7),null);
 const other=draftDom(t,{productId:'1',serialNumber:''});drafts.bindReturnDraft(ctx,other.dialog,{store:f.store});other.controls.serialNumber.value='OTHER';other.form.emit('change');
 ctx.authGeneration++;other.dialog.emit('close');assert.equal(f.store.read(7).fields.serialNumber,'OTHER');
});
test('restore offer leaves fields unchanged until chosen and restores them as unsaved inputs',async t=>{
 assert.equal(typeof drafts.bindReturnDraft,'function');
 const f=setup(),ctx=context();f.store.write(7,{productId:'1',serialNumber:'RECOVERED',notes:'PRIVATE'});
 const dom=draftDom(t,{productId:'',serialNumber:'',notes:''}),binding=drafts.bindReturnDraft(ctx,dom.dialog,{store:f.store,apply:item=>{for(const [key,value]of Object.entries(item))if(dom.controls[key])dom.controls[key].value=String(value);}});
 assert.equal(dom.controls.serialNumber.value,'');assert.equal(dom.section.inert,true);assert.equal(dom.submit.disabled,true);
 const offer=dom.body.children.find(child=>child.className==='return-draft-offer');assert.ok(offer);
 await offer.buttons.restore.onclick();assert.equal(dom.controls.serialNumber.value,'RECOVERED');assert.equal(dom.section.inert,false);assert.equal(dom.submit.disabled,false);assert.equal(binding.offered,false);
 dom.form.emit('reset');assert.equal(f.store.read(7),null);
});
test('replacement field follows exchange choice, supports custom reveal and retains historical data',t=>{
 assert.equal(typeof drafts.bindReplacementSerial,'function');
 const original=globalThis.document;globalThis.document={createElement:()=>node()};t.after(()=>globalThis.document=original);
 const field=node(),serial={...node(),closest:()=>field},resolution={...node(),value:'17'},form={querySelector:selector=>selector==='[name=replacementSerialNumber]'?serial:resolution};
 const ctx=context({masterdata:{resolutions:[{id:17,builtinKey:'resolutions.refund'},{id:18,builtinKey:'resolutions.exchange'},{id:19,name:'Own solution'}]}});
 drafts.bindReplacementSerial(ctx,form);assert.equal(field.hidden,true);const reveal=field.previous;assert.equal(reveal.hidden,false);
 resolution.value='18';resolution.emit('change');assert.equal(field.hidden,false);assert.equal(reveal.hidden,true);
 resolution.value='19';resolution.emit('change');assert.equal(field.hidden,true);reveal.onclick();assert.equal(field.hidden,false);
 serial.value='HISTORICAL';resolution.value='17';resolution.emit('change');assert.equal(field.hidden,false);assert.equal(serial.value,'HISTORICAL');
});
test('draft offers and automatic-save notices switch between German and English',async t=>{
 const f=setup(),ctx=context();setLanguage('en');t.after(()=>{const document=globalThis.document;delete globalThis.document;setLanguage('de');if(document!==undefined)globalThis.document=document;});
 const dom=draftDom(t,{productId:'1',serialNumber:''});drafts.bindReturnDraft(ctx,dom.dialog,{store:f.store});
 dom.controls.serialNumber.value='SERIAL';dom.form.emit('input');const notice=dom.body.children.find(child=>child.className?.includes('return-draft-status'));assert.match(notice.textContent,/Draft saved on this device/);
 const restored=draftDom(t,{productId:'',serialNumber:''});drafts.bindReturnDraft(ctx,restored.dialog,{store:f.store});const offer=restored.body.children.find(child=>child.className==='return-draft-offer');assert.match(offer.innerHTML,/Restore draft/);assert.equal(offer.buttons.discard.textContent,'Discard draft & start again');
 const document=globalThis.document;delete globalThis.document;setLanguage('de');globalThis.document=document;await offer.buttons.restore.onclick();assert.match(restored.body.children.find(child=>child.className?.includes('return-draft-status')).textContent,/Entwurf wiederhergestellt/);
});
