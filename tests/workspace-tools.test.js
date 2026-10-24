import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

const moduleUrl=process.env.WORKSPACE_TOOLS_MODULE?pathToFileURL(resolve(process.env.WORKSPACE_TOOLS_MODULE)):new URL('../dist/public/workspace-tools.js',import.meta.url);
const tools=await import(moduleUrl.href).catch(()=>({}));
const inventory={
 products:[
  {id:1,name:'Büro Kopfhörer',sku:'KH-001',ean:'0012345678905',supplier:'Müller & Söhne',active:true},
  {id:2,name:'Archiviertes Gerät',sku:'OLD-001',ean:'0000000000000',supplier:'Nord',active:false},
 ],
 returns:[
  {id:11,returnNumber:'RET-1042',productName:'Büro Kopfhörer',sku:'KH-001',ean:'0012345678905',serialNumber:'SN-A-123',replacementSerialNumber:'NEW-B-456',customerReference:'Kunde <42>',supplier:'Müller & Söhne'},
  {id:12,returnNumber:'RET-1043',productName:'Weiteres Gerät',sku:'KH-002',serialNumber:'SN-X-999',customerReference:'REF-22',supplier:'Nord'},
 ],
};

test('global search finds product and return fields without translating or mutating custom data',()=>{
 assert.equal(typeof tools.searchInventory,'function');
 for(const [query,want] of [
  ['BURO mueller',[]],['BÜRO muller',['products:1','returns:11']],
  ['0012345678905',['products:1','returns:11']],['OLD-001',['products:2']],
  ['ret-1042',['returns:11']],['sn-a-123',['returns:11']],['new-b-456',['returns:11']],
  ['kunde <42>',['returns:11']],['kh-002 nord',['returns:12']],
 ])assert.deepEqual(tools.searchInventory(inventory,query).map(r=>r.kind+':'+r.id),want,query);
 const before=JSON.stringify(inventory),result=tools.searchInventory(inventory,'ret-1042')[0];
 assert.equal(result.label,'RET-1042');
 assert.match(result.subtitle,/Büro Kopfhörer/);
 assert.match(result.subtitle,/NEW-B-456/);
 assert.match(result.subtitle,/Kunde <42>/);
 assert.equal(JSON.stringify(inventory),before);
});

test('global search returns no suggestions for an empty query and ranks an exact identifier ahead of partial hits',()=>{
 assert.equal(typeof tools.searchInventory,'function');
 assert.deepEqual(tools.searchInventory(inventory,'  '),[]);
 const products=Array.from({length:150},(_,i)=>({id:i+1,name:'Device '+i,sku:'ABC-'+i}));
 products.push({id:151,name:'Exact device',sku:'ABC'});
 assert.equal(tools.searchInventory({products,returns:[]},'ABC',{limit:1})[0].id,151);
 assert.equal(tools.searchInventory({products,returns:[]},'device').length,30);
 assert.equal(tools.searchInventory({products,returns:[]},'device',{limit:999}).length,60);
 assert.deepEqual(tools.searchInventory(inventory,'ret',{limit:0}),[]);
 assert.deepEqual(tools.searchInventory({products:[null,{id:3,name:{secret:'needle'}}],returns:null},'needle'),[]);
});

function memoryStorage(){
 const values=new Map();
 return {values,getItem(key){return values.get(key)??null;},setItem(key,value){values.set(key,String(value));}};
}

test('saved views persist only supported filter fields and stay isolated between accounts',()=>{
 assert.equal(typeof tools.savedFilterStore,'function');
 const storage=memoryStorage(),a=tools.savedFilterStore(storage,7),b=tools.savedFilterStore(storage,8);
 const result=a.save('  Meine <Retouren>  ',{view:'returns',search:'Kunde <42>',scope:'open',status:'Custom status',category:'Grund',activity:'all',reason:'Grund',assignee:'7',password:'secret',csrfToken:'token',session:{user:{id:7}},rows:inventory.returns});
 assert.equal(result.ok,true);
 assert.equal(result.item.label,'Meine <Retouren>');
 assert.deepEqual(result.item.state,{view:'returns',search:'Kunde <42>',status:'Custom status',scope:'open',category:'Grund',activity:'all',reason:'Grund',assignee:'7'});
 assert.deepEqual(b.list(),[]);
 const serialized=[...storage.values.values()].join('');
 assert.doesNotMatch(serialized,/secret|token|password|csrfToken|serialNumber/);
 const list=a.list();list[0].state.search='changed';list[0].label='changed';
 assert.equal(a.list()[0].state.search,'Kunde <42>');
 assert.equal(a.list()[0].label,'Meine <Retouren>');
 const updated=a.save('Meine <Retouren>',{view:'products',search:'KH-001'});
 assert.equal(updated.ok,true);assert.equal(a.list().length,1);
 assert.equal(updated.item.id,result.item.id);
 assert.equal(a.remove(result.item.id),true);assert.deepEqual(a.list(),[]);
 assert.equal(a.remove(result.item.id),false);
});

test('saved views reject invalid labels and views, ignore unsafe field values, and enforce their limit',()=>{
 assert.equal(typeof tools.savedFilterStore,'function');
 const store=tools.savedFilterStore(memoryStorage(),7);
 for(const [label,state]of [['',{view:'returns'}],['x'.repeat(61),{view:'returns'}],['bad',{view:'admin'}],['bad',null],['bad',[]]])assert.equal(store.save(label,state).ok,false);
 const clean=store.save('safe',{view:'products',search:{toString(){throw Error('Do not coerce objects');}},scope:'unknown',activity:'unknown',assignee:['7'],category:'x'.repeat(300)});
 assert.equal(clean.ok,true);assert.equal(clean.item.state.search,'');assert.equal(clean.item.state.scope,'');assert.equal(clean.item.state.activity,'active');assert.equal(clean.item.state.assignee,'');assert.equal(clean.item.state.category,'');
 for(let i=1;i<20;i++)assert.equal(store.save('View '+i,{view:'returns',scope:'open'}).ok,true);
 assert.equal(store.save('Twenty-first',{view:'returns'}).reason,'full');
 assert.equal(store.list().length,20);
 assert.equal(store.save('safe',{view:'returns',scope:'overdue'}).ok,true,'Updating an existing view does not consume another slot');
});

test('saved views preserve long filters accepted by the workspace model without silently broadening the view',()=>{
 const store=tools.savedFilterStore(memoryStorage(),7),search='s'.repeat(500),masterValue='m'.repeat(250);
 const saved=store.save('Long filter',{view:'returns',search,status:masterValue,category:masterValue,reason:masterValue});
 assert.equal(saved.ok,true);assert.equal(saved.item.state.search,search);assert.equal(saved.item.state.status,masterValue);assert.equal(saved.item.state.category,masterValue);assert.equal(saved.item.state.reason,masterValue);
 const invalid=store.save('Invalid filter',{view:'returns',search:'s'.repeat(501),status:'m'.repeat(251),category:'m'.repeat(251),reason:'m'.repeat(251)});
 assert.equal(invalid.item.state.search,'');assert.equal(invalid.item.state.status,'');assert.equal(invalid.item.state.category,'');assert.equal(invalid.item.state.reason,'');
});

test('saved views recover calmly from damaged storage, denied storage, and a missing account',()=>{
 assert.equal(typeof tools.savedFilterStore,'function');
 const storage=memoryStorage(),store=tools.savedFilterStore(storage,7);
 store.save('valid',{view:'returns'});const key=[...storage.values.keys()][0];
 storage.setItem(key,'{broken');assert.deepEqual(store.list(),[]);
 assert.equal(store.save('new',{view:'products'}).ok,true);
 const entry=store.list()[0];
 storage.setItem(key,JSON.stringify([entry,{id:'bad',label:'bad',state:{view:'admin'}},{id:'prototype',label:'bad',state:{view:'products',search:{password:'secret'}}}]));
 assert.equal(store.list().length,2);assert.equal(store.list()[1].state.search,'');
 const denied=tools.savedFilterStore({getItem(){throw Error('denied');},setItem(){throw Error('denied');}},7);
 assert.deepEqual(denied.list(),[]);assert.equal(denied.save('view',{view:'returns'}).reason,'unavailable');assert.equal(denied.remove('unknown'),false);
 const missing=tools.savedFilterStore(storage,null);
 assert.deepEqual(missing.list(),[]);assert.equal(missing.save('view',{view:'returns'}).reason,'unavailable');
});

test('saved-view markup escapes personal labels and provides translated controls without translating the labels',async t=>{
 assert.equal(typeof tools.renderSavedFilters,'function');
 const i18n=await import(new URL('./i18n.js',moduleUrl).href);
 i18n.addTranslations(tools.WORKSPACE_TRANSLATIONS);i18n.setLanguage('en');t.after(()=>i18n.setLanguage('de'));
 const storage=memoryStorage(),store=tools.savedFilterStore(storage,7);
 store.save('Offene Retouren',{view:'returns'});store.save('<img src=x onerror=alert(1)>',{view:'products'});
 const markup=String(tools.renderSavedFilters({userId:7,storage},{view:'returns'}));
 assert.match(markup,/Saved views/);assert.match(markup,/Save current view/);
 assert.match(markup,/data-saved-close aria-label="Close"/);
 assert.match(markup,/Offene Retouren/);assert.match(markup,/&lt;img src=x onerror=alert\(1\)&gt;/);assert.doesNotMatch(markup,/<img src=x/);
 assert.doesNotMatch(markup,/data-saved-builtin="mine"/);
 assert.match(String(tools.renderSavedFilters({userId:7,storage,canFilterMine:true},{view:'returns'})),/data-saved-builtin="mine"/);
});

function domElement(){
 return {value:'',hidden:false,attrs:{},handlers:{},classList:{add(){},toggle(){}},setAttribute(k,v){this.attrs[k]=String(v);},removeAttribute(k){delete this.attrs[k];},addEventListener(k,fn){(this.handlers[k]??=[]).push(fn);},removeEventListener(k,fn){this.handlers[k]=(this.handlers[k]??[]).filter(item=>item!==fn);},focus(){this.focused=true;},scrollIntoView(){},emit(k,event={}){for(const fn of this.handlers[k]??[])fn(event);}};
}
function searchDialogFixture(t){
 const previous=globalThis.document,input=domElement(),list=domElement(),hint=domElement(),close=domElement(),body=domElement();
 const nodes={'[data-workspace-search]':body,'[data-workspace-search-input]':input,'[data-workspace-search-results]':list,'[data-workspace-search-hint]':hint,'.dialog-close':close};
 list.querySelectorAll=()=>[...String(list.innerHTML??'').matchAll(/data-workspace-result="(\d+)"/g)].map(match=>{const node=domElement();node.dataset={workspaceResult:match[1]};return node;});
 body.querySelector=selector=>nodes[selector];body.querySelectorAll=selector=>selector==='[data-workspace-result]'?list.querySelectorAll():[];
 const dialog={...domElement(),open:false,querySelector:selector=>nodes[selector],querySelectorAll:()=>[],showModal(){this.open=true;},close(){this.open=false;this.emit('close');}};
 globalThis.document={querySelector:()=>dialog};
 t.after(()=>{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;});
 return {dialog,input,list,hint,body};
}

test('search keyboard navigation opens the exact cached record and Escape closes the search',async t=>{
 assert.equal(typeof tools.openWorkspaceSearch,'function');
 const d=searchDialogFixture(t),opened=[];
 const dialog=tools.openWorkspaceSearch({...inventory,userId:7,openSearchResult:(kind,id)=>opened.push([kind,id])});
 assert.equal(dialog,d.dialog);assert.equal(d.input.focused,true);
 d.input.value='NEW-B-456';d.input.emit('input');
 assert.match(String(d.list.innerHTML),/RET-1042/);
 let prevented=0;
 d.input.emit('keydown',{key:'ArrowDown',preventDefault(){prevented++;}});
 assert.match(d.input.attrs['aria-activedescendant'],/workspace-result-/);
 d.input.emit('keydown',{key:'Enter',preventDefault(){prevented++;}});
 await Promise.resolve();assert.deepEqual(opened,[['returns',11]]);assert.equal(d.dialog.open,false);assert.equal(prevented,2);
 tools.openWorkspaceSearch({...inventory,openSearchResult(){}});
 d.input.emit('keydown',{key:'Escape',preventDefault(){},stopPropagation(){}});
 assert.equal(d.dialog.open,false);
});

test('search waits for the caller cache and discards an asynchronous update after the account changes',async t=>{
 assert.equal(typeof tools.openWorkspaceSearch,'function');
 const d=searchDialogFixture(t);let resolveLoad;
 const ctx={userId:7,products:[],returns:[],ensureInventory:()=>new Promise(resolve=>resolveLoad=resolve),openSearchResult(){}};
 tools.openWorkspaceSearch(ctx);await Promise.resolve();
 assert.match(String(d.hint.textContent),/geladen/);
 ctx.userId=8;ctx.returns=inventory.returns;resolveLoad();
 await Promise.resolve();await Promise.resolve();await Promise.resolve();
 assert.equal(d.dialog.open,false);assert.doesNotMatch(String(d.list.innerHTML),/RET-1042/);
});

test('keyboard selection follows the visible grouped result order and displayed inventory data is escaped',async t=>{
 const d=searchDialogFixture(t),opened=[];
 tools.openWorkspaceSearch({products:[{id:2,name:'<img src=x> RET-1042',sku:'SKU'}],returns:inventory.returns,openSearchResult:(kind,id)=>opened.push([kind,id])});
 d.input.value='RET-1042';d.input.emit('input');
 assert.match(String(d.list.innerHTML),/&lt;img src=x&gt;/);assert.doesNotMatch(String(d.list.innerHTML),/<img src=x>/);
 d.input.emit('keydown',{key:'ArrowDown',preventDefault(){}});
 d.input.emit('keydown',{key:'Enter',preventDefault(){}});
 await Promise.resolve();assert.deepEqual(opened,[['products',2]]);
});

test('saved-view binding applies clean filters and rebinding does not duplicate actions',()=>{
 assert.equal(typeof tools.bindSavedFilters,'function');
 const storage=memoryStorage(),store=tools.savedFilterStore(storage,7),saved=store.save('My device',{view:'products',search:'KH-001'}).item;
 const root={...domElement(),contains:()=>true,querySelector:()=>null},applied=[];
 const ctx={userId:7,storage,canFilterMine:true},filter={view:'returns',search:'old'};
 tools.bindSavedFilters(ctx,root,filter,state=>applied.push(state));tools.bindSavedFilters(ctx,root,filter,state=>applied.push(state));
 const choose={dataset:{savedView:saved.id},closest(){return this;}};
 root.emit('click',{target:choose});assert.equal(applied.length,1);assert.equal(applied[0].view,'products');assert.equal(applied[0].search,'KH-001');
 const open={dataset:{savedBuiltin:'open'},closest(){return this;}};
 root.emit('click',{target:open});assert.equal(applied.length,2);assert.equal(applied[1].scope,'open');assert.equal(applied[1].search,'');
 const mine={dataset:{savedBuiltin:'mine'},closest(){return this;}};
 root.emit('click',{target:mine});assert.equal(applied.length,3);assert.equal(applied[2].scope,'');assert.equal(applied[2].assignee,'mine');
});

test('saved-view menu closes by its close control and Escape, restores focus, and cleans up on rebind',()=>{
 const summary={...domElement(),focus(options){this.focused=true;this.focusOptions=options;}},details={open:true,querySelector:selector=>selector==='summary'?summary:null,contains:target=>target===close||target===summary};
 const root={...domElement(),contains:()=>true,querySelector:()=>details},applied=[];
 const ctx={userId:7,storage:memoryStorage()},filter={view:'returns'};
 tools.bindSavedFilters(ctx,root,filter,state=>applied.push(state));
 const unbind=tools.bindSavedFilters(ctx,root,filter,state=>applied.push(state));
 const close={dataset:{},hasAttribute:name=>name==='data-saved-close',closest(){return this;}};
 root.emit('click',{target:close});
 assert.equal(details.open,false);assert.equal(summary.focused,true);assert.deepEqual(summary.focusOptions,{preventScroll:true});assert.deepEqual(applied,[]);
 details.open=true;summary.focused=false;let prevented=0,stopped=0;
 root.emit('keydown',{key:'Escape',target:{},preventDefault(){prevented++;},stopPropagation(){stopped++;}});
 assert.equal(details.open,true,'Escape in a sibling menu must not close saved views or steal its focus');assert.equal(summary.focused,false);assert.equal(prevented,0);assert.equal(stopped,0);
 root.emit('keydown',{key:'Escape',target:close,preventDefault(){prevented++;},stopPropagation(){stopped++;}});
 assert.equal(details.open,false);assert.equal(summary.focused,true);assert.equal(prevented,1);assert.equal(stopped,1);
 details.open=true;root.emit('keydown',{key:'Enter',target:close});assert.equal(details.open,true);
 unbind();assert.equal(root.handlers.click.length,0);assert.equal(root.handlers.keydown.length,0);
});

test('an initially scanned disposal number loads protected search results and opens its exact record',async t=>{
 const d=searchDialogFixture(t),opened=[],queries=[];
 tools.openWorkspaceSearch({userId:7,searchDisposals:async query=>{queries.push(query);return [{kind:'disposals',id:9,label:'DIS-2026-000009',subtitle:'Disk'}];},openSearchResult:(...args)=>opened.push(args)},'DIS-2026-000009');
 await new Promise(resolve=>setTimeout(resolve,190));assert.deepEqual(queries,['DIS-2026-000009']);assert.match(String(d.list.innerHTML),/DIS-2026-000009/);
 d.input.emit('keydown',{key:'ArrowDown',preventDefault(){}});d.input.emit('keydown',{key:'Enter',preventDefault(){}});await Promise.resolve();assert.deepEqual(opened,[['disposals',9]]);
});

test('late disposal search results are discarded after switching account',async t=>{
 const d=searchDialogFixture(t);let resolveSearch;const ctx={userId:7,authGeneration:1,searchDisposals:()=>new Promise(resolve=>resolveSearch=resolve)};
 tools.openWorkspaceSearch(ctx,'DIS-2026-000001');await new Promise(resolve=>setTimeout(resolve,180));ctx.authGeneration=2;ctx.userId=8;resolveSearch([{kind:'disposals',id:1,label:'Private disk'}]);await Promise.resolve();await Promise.resolve();assert.doesNotMatch(String(d.list.innerHTML),/Private disk/);
});
