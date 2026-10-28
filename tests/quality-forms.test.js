import {returnTransition} from '../dist/public/return-transitions.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const {productForm,returnForm,showDetails,bindDeviceScan}=await import(process.env.FORMS_MODULE || '../dist/public/forms.js');
import {setLanguage} from '../dist/public/i18n.js';
import {openDisposalAction} from '../dist/public/disposal-forms.js';
import {bindAdmin} from '../dist/public/admin.js';
import {bindUsers} from '../dist/public/accounts.js';
import {bindAccount,enrollmentView,recoveryView,wireForm} from '../dist/public/account.js';
import {bindNotificationsSettings} from '../dist/public/admin-notifications.js';
import {bindCsvProfiles} from '../dist/public/admin-csv-profiles.js';
import {bindRules} from '../dist/public/admin-rules.js';
import {bindBackups} from '../dist/public/admin-backups.js';
import {markForm,observeForm,refreshFormState} from '../dist/public/unsaved.js';
import {PERMISSION_KEYS,hasPermission,canAdminSection} from '../dist/shared/permissions.js';

// Keep production rendering and submit handlers; replace only the DOM and
// network boundary. These controls represent the data entered by the user.
function element(){return {hidden:false,isConnected:true,dataset:{},children:[],attrs:{},handlers:{},setAttribute(key,value){this.attrs[key]=String(value);},getAttribute(key){return this.attrs[key]??null;},removeAttribute(key){delete this.attrs[key];},querySelectorAll(){return [];},dispatchEvent(event){this['on'+event.type]?.(event);return true;},addEventListener(type,fn){const handlers=this.handlers[type]??=[];handlers.push(fn);this['on'+type]=(event={target:this})=>{for(const handler of handlers)handler(event);};},insertAdjacentHTML(){},closest(){return this;},append(child){this.children.push(child);},after(){},before(){}};}
function form(values={}){
  const node=element(),button=element(),error=element();
  const body=element(),reset=element();body.html='';node.extraHTML='';
  body.insertAdjacentHTML=(position,html)=>{assert.equal(position,'beforeend');body.html+=html;};
  node.insertAdjacentHTML=(position,html)=>{node.extraHTML+=html;};
  node.closest=()=>null;
  node.values={...values};node.elements={namedItem:name=>node.elements[name]??null};
  for(const [name,value]of Object.entries(values)){const field=element();field.querySelector=()=>null;node.elements[name]={...element(),name,value:String(value),checked:value===true,insertAdjacentHTML(){},closest:()=>field};}
  for(const key of PERMISSION_KEYS)node.elements['permission-'+key]={...element(),checked:true};
  const permissionNodes={};
  node.querySelector=selector=>selector.startsWith('[name=')?node.elements[selector.slice(6,-1)]??null:(selector==='.dialog-body'||selector==='[data-account-security-actions]')?body:selector==='#admin-mfa-reset'?reset:selector==='[type=submit]'?button:selector==='.form-error'||selector==='[role=alert]'?error:selector==='.unsaved-status'?node.status:selector.startsWith('#permission-')||selector.startsWith('[data-permission-count=')?permissionNodes[selector]??=element():null;
  node.prepend=status=>node.status=status;
  node.querySelectorAll=()=>[];
  return node;
}
function boundary(t){
  const originals={document:globalThis.document,FormData:globalThis.FormData,location:globalThis.location};
  const dialog=element();dialog.open=false;dialog.nextValues={};dialog.nodes={};
  Object.defineProperty(dialog,'innerHTML',{set(value){this.html=value;this.form=/<form\b/.test(value)?form(this.nextValues):null;this.nodes={};}});
  dialog.querySelector=selector=>{
    if(selector==='#return-communication')return dialog.nodes[selector]??=document.createElement('section');
    if(selector==='#return-timeline'){
      const root=dialog.nodes[selector]??={...element(),isConnected:false,closest:()=>null};root.controls??={};
      root.querySelector=key=>root.controls[key]??=element();return root;
    }
    if(selector==='.product-image-editor'){
      const root=dialog.nodes[selector]??=element();root.controls??={};
      root.querySelector=key=>root.controls[key]??={...element(),value:key==='[name=productImageAction]'?'keep':'',files:[]};return root;
    }
    return selector==='form'?dialog.form:selector.startsWith('[name=')?dialog.form?.elements[selector.slice(6,-1)]:dialog.nodes[selector]??=element();
  };
  dialog.querySelectorAll=()=>[];dialog.showModal=()=>dialog.open=true;
  dialog.close=()=>{dialog.dirtyAtClose=dialog.form?.dataset.dirty;dialog.open=false;};
  globalThis.document={querySelector:selector=>{assert.equal(selector,'#dialog');return dialog;},createElement:tag=>{const node=element();node.querySelector=()=>element();if(tag==='section'){node.isConnected=false;const passive=()=>({...element(),isConnected:false,closest:()=>null,querySelector:selector=>selector==='form'||selector==='[data-customer-share]'?null:passive()});node.querySelector=selector=>selector==='form'||selector==='[data-customer-share]'?null:passive();node.closest=()=>null;}return node;}};
  globalThis.FormData=class extends Map{constructor(node){super(Object.entries(node.values));}};
  globalThis.location={hash:''};
  t.after(()=>{for(const [name,value]of Object.entries(originals)){if(value===undefined)delete globalThis[name];else globalThis[name]=value;}});
  return dialog;
}
const event={preventDefault(){}};
function draftStorage(t){const previous=globalThis.localStorage,values=new Map();globalThis.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};t.after(()=>{if(previous===undefined)delete globalThis.localStorage;else globalThis.localStorage=previous;});return values;}

function deviceScan(t,fieldName='serialNumber'){
 assert.equal(typeof bindDeviceScan,'function');const dialog=boundary(t);dialog.nextValues={[fieldName]:'ORIGINAL-SN'};dialog.innerHTML='<form></form>';dialog.open=true;
 const field=dialog.form.elements[fieldName],messages=[],events=[],ctx=context({authGeneration:1,toast:message=>messages.push(String(message))});let accept;
 field.maxLength=250;field.before=group=>field.scanGroup=group;field.dispatchEvent=event=>events.push(event.type);field.focus=()=>field.focused=true;dialog.contains=node=>node===field;
 bindDeviceScan(ctx,dialog,fieldName,(received,options)=>{assert.equal(received,ctx);accept=options.onScan;});field.scanGroup.children.find(node=>node.type==='button').onclick();
 return {field,messages,events,ctx,accept};
}
for(const [language,message]of [['de','Der gescannte Code ist zu lang (maximal 250 Zeichen). Der bisherige Wert bleibt erhalten.'],['en','The scanned code is too long (maximum 250 characters). The existing value is unchanged.']]){
 test(`oversized device scans preserve the existing value and explain rejection in ${language}`,t=>{
  setLanguage(language);const f=deviceScan(t);t.after(()=>setLanguage('de'));f.accept('00aBc'+ 'X'.repeat(295));
  assert.equal(f.field.value,'ORIGINAL-SN');assert.deepEqual(f.events,[]);assert.deepEqual(f.messages,[message]);assert.equal(f.field.focused,true);
 });
}
for(const fieldName of ['serialNumber','replacementSerialNumber','ean'])test(`${fieldName} accepts the exact maximum scanned text without changing case or leading zeroes`,t=>{
 const f=deviceScan(t,fieldName),code='00aBc'+ 'X'.repeat(245);f.accept(code);assert.equal(f.field.value,code);assert.deepEqual(f.events,['input','change']);assert.deepEqual(f.messages,[]);assert.equal(f.field.focused,true);
});
test('stale device scan callbacks cannot alter a field or show rejection for another authentication',t=>{
 const f=deviceScan(t);f.ctx.authGeneration++;f.accept('X'.repeat(300));assert.equal(f.field.value,'ORIGINAL-SN');assert.deepEqual(f.messages,[]);assert.deepEqual(f.events,[]);
});
test('new return draft persists input and a completed save clears it before a failed refresh',async t=>{
 const local=draftStorage(t),dialog=boundary(t);dialog.nextValues={productId:'1',serialNumber:'SN-DRAFT'};
 returnForm(context({reload:async()=>{assert.equal(local.size,0);throw Error('Refresh failed');}}));
 dialog.form.oninput({target:dialog.form.elements.serialNumber});assert.equal(local.size,1);assert.equal(JSON.parse([...local.values()][0]).fields.serialNumber,'SN-DRAFT');
 await dialog.form.onsubmit(event);assert.equal(local.size,0);
});
test('new return draft keeps newer input linked to its successful POST record',async t=>{
 const local=draftStorage(t),dialog=boundary(t);dialog.nextValues={productId:'1',serialNumber:'SN-FIRST'};let finish;
 returnForm(context({api:()=>new Promise(resolve=>finish=resolve)}));const original=dialog.form,saving=original.onsubmit(event);
 original.values.serialNumber='SN-NEWER';original.elements.serialNumber.value='SN-NEWER';original.oninput({target:original.elements.serialNumber});
 finish({id:91});await saving;assert.equal(local.size,1);const draft=JSON.parse([...local.values()][0]);assert.equal(draft.fields.serialNumber,'SN-NEWER');assert.equal(draft.returnId,91);assert.equal(original.dataset.dirty,'true');assert.equal(dialog.open,true);
});
test('a stale return form cannot submit earlier account inputs under a changed account',async t=>{
 const dialog=boundary(t);dialog.nextValues={productId:'1',serialNumber:'PRIVATE'};let writes=0;
 const ctx=context({authGeneration:1,api:async()=>{writes++;return {id:91};}});returnForm(ctx);ctx.session.user.id=2;ctx.authGeneration++;
 await dialog.form.onsubmit(event);assert.equal(writes,0);
});
test('late return save success cannot clear the prior draft after auth changes',async t=>{
 const local=draftStorage(t),dialog=boundary(t);dialog.nextValues={productId:'1',serialNumber:'PRIVATE'};let finish,reloads=0;
 const ctx=context({authGeneration:1,api:()=>new Promise(resolve=>finish=resolve),reload:async()=>reloads++});returnForm(ctx);const original=dialog.form;original.oninput({target:original.elements.serialNumber});markForm(original,true);const saving=original.onsubmit(event);
 ctx.session.user.id=2;ctx.authGeneration++;finish({id:91});await saving;assert.equal(reloads,0);assert.equal(original.dataset.dirty,'true');assert.equal(JSON.parse([...local.values()][0]).fields.serialNumber,'PRIVATE');
});
test('new-return forms prefill today while editing retains an empty receipt date',t=>{
 const originalNow=Date.now;Date.now=()=>Date.parse('2026-10-12T22:30:00Z');t.after(()=>Date.now=originalNow);
 const dialog=boundary(t),ctx=context({config:{rules:{timezone:'Europe/Berlin'}},returnAssignees:[]});
 dialog.nextValues={productId:'1',serialNumber:'SN-ONE'};returnForm(ctx);
 assert.match(dialog.html,/name="receiptDate" value="2026-10-13"/);
 returnForm(ctx,{id:5,productId:1,serialNumber:'SN-OLD',receiptDate:''});assert.match(dialog.html,/name="receiptDate" value=""/);
});
test('a completed save cannot reopen a return editor that was dismissed while saving',async t=>{
 const dialog=boundary(t);dialog.nextValues={productId:'1',serialNumber:'SN-EDIT'};
 let finish;const ctx=context({api:()=>new Promise(resolve=>finish=resolve),returns:[{id:91,productId:1,serialNumber:'SN-EDIT'}]});
 returnForm(ctx,{id:91,productId:1,serialNumber:'SN-EDIT'});const pending=dialog.form.onsubmit(event);
 await Promise.resolve();dialog.close();finish({id:91});await pending;assert.equal(dialog.open,false);
});
test('editing another account keeps the 2FA action inside the scrollable form body',async t=>{
  const dialog=boundary(t),create=element(),list=element(),edit=element();
  const user={id:2,username:'Lena',displayName:'Lena',role:'member',active:true};
  dialog.nextValues={username:'Lena',role:'member',active:true};
  edit.dataset.userEdit='2';list.querySelectorAll=selector=>selector==='[data-user-edit]'?[edit]:[];
  const root={querySelector:selector=>selector==='#user-create'?create:list};
  await bindUsers(context({api:async()=>[user]}),root);edit.onclick();
  assert.match(dialog.form.querySelector('.dialog-body').html,/id="admin-mfa-reset"/);
  assert.equal(dialog.form.extraHTML,'','No additional content may follow the fixed form footer');
  assert.equal(typeof dialog.form.querySelector('#admin-mfa-reset').onclick,'function');
});
test('save and add another return opens a fresh form after persistence with only product and supplier retained',async t=>{
  const dialog=boundary(t),ctx=context({masterdata:{suppliers:[{id:21,name:'Lieferant',active:true}]},products:[{id:1,name:'Produkt',sku:'P-1',active:true,supplierId:21}],api:async(path,options)=>{assert.equal(path,'/api/returns');assert.equal(options.method,'POST');assert.equal(options.body.serialNumber,'SN-ONE');return {id:91};}});
  dialog.nextValues={productId:'1',serialNumber:'SN-ONE',supplierId:'21',customerReference:'PRIVATE-REF',quantity:'1'};
  returnForm(ctx);const previous=dialog.form;markForm(previous,true);
  dialog.nextValues={productId:'1',supplierId:'21'};
  await previous.onsubmit({...event,submitter:{dataset:{saveMore:'true'}}});
  assert.equal(dialog.open,true);assert.notEqual(dialog.form,previous);
  assert.equal(previous.dataset.dirty,'false');
  assert.match(dialog.html,/<option value="1" selected>/);
  assert.match(dialog.html,/name="serialNumber" value=""/);
  assert.match(dialog.html,/name="customerReference" value=""/);
  assert.doesNotMatch(dialog.html,/SN-ONE|PRIVATE-REF/);
});
test('failed save and add another return retains the entered form for retry',async t=>{
  const dialog=boundary(t);dialog.nextValues={productId:'1',serialNumber:'SN-ONE'};
  const ctx=context({api:async()=>{throw new Error('Write failed');}});
  returnForm(ctx);const previous=dialog.form;markForm(previous,true);
  await previous.onsubmit({...event,submitter:{dataset:{saveMore:'true'}}});
  assert.equal(dialog.form,previous);assert.equal(dialog.open,true);
  assert.equal(previous.dataset.dirty,'true');assert.equal(previous.values.serialNumber,'SN-ONE');
  assert.equal(previous.querySelector('[type=submit]').disabled,false);
});
test('return editing offers optional assignment and next step while preserving entered values and the single-device quantity contract',async t=>{
  const dialog=boundary(t);let sent;
  dialog.nextValues={productId:'1',serialNumber:'SN-EDIT',assignedUserId:'7',nextStep:'Lieferanten kontaktieren',notes:'Prüfung läuft'};
  const ctx=context({returnAssignees:[],api:async(path,options)=>{assert.equal(path,'/api/returns/91');sent=options.body;return {id:91};}});
  returnForm(ctx,{id:91,productId:1,serialNumber:'SN-EDIT',assignedUserId:7,assignedDisplayName:'Historic person',nextStep:'Lieferanten kontaktieren',quantity:3});
  assert.match(dialog.html,/name="assignedUserId"/);
  assert.match(dialog.html,/<option value="7" selected>Historic person<\/option>/);
  assert.match(dialog.html,/name="nextStep" maxlength="500"/);
  assert.match(dialog.html,/Lieferanten kontaktieren/);
  assert.doesNotMatch(dialog.html,/name="quantity"/);
  await dialog.form.onsubmit(event);
  assert.equal(sent.assignedUserId,'7');assert.equal(sent.nextStep,'Lieferanten kontaktieren');assert.equal(sent.notes,'Prüfung läuft');assert.equal(sent.quantity,undefined);
});
test('known product validation errors appear at the input while preserving typed product and price data',async t=>{
  const dialog=boundary(t);dialog.nextValues={name:'Typed product',sku:'SKU-1',ean:'bad EAN',price:'12,34'};
  productForm(context({api:async()=>{throw new Error('EAN muss 8, 12, 13 oder 14 Ziffern enthalten.');}}));
  const original=dialog.form;markForm(original,true);await original.onsubmit(event);
  assert.equal(dialog.form,original);assert.equal(dialog.open,true);assert.equal(original.dataset.dirty,'true');
  assert.equal(original.elements.ean.attrs['aria-invalid'],'true');
  const inline=original.elements.ean.closest('.field').children.find(node=>node.className==='field-error');
  assert.match(inline.textContent,/EAN/);assert.equal(inline.hidden,false);
  assert.equal(original.elements.name.value,'Typed product');assert.equal(original.elements.price.value,'12,34');
  assert.equal(original.querySelector('[type=submit]').disabled,false);
});
test('clearing an optional return assignee submits an explicit null without losing the next step',async t=>{
  const dialog=boundary(t);let sent;
  dialog.nextValues={productId:'1',serialNumber:'SN-EDIT',assignedUserId:'',nextStep:'Do this next'};
  returnForm(context({returnAssignees:[],api:async(path,options)=>{sent=options.body;return {id:91};}}),{id:91,productId:1,serialNumber:'SN-EDIT',assignedUserId:7,assignedDisplayName:'Historical person'});
  await dialog.form.onsubmit(event);
  assert.equal(sent.assignedUserId,null);assert.equal(sent.nextStep,'Do this next');
});
test('save and add another cannot replace a newer edited dialog while inventory refresh is pending',async t=>{
  const dialog=boundary(t);dialog.nextValues={productId:'1',serialNumber:'SN-ONE'};
  let finishRefresh;const ctx=context({api:async()=>({id:91}),reload:()=>new Promise(resolve=>finishRefresh=resolve)});
  returnForm(ctx);const savedForm=dialog.form;
  const pending=savedForm.onsubmit({...event,submitter:{dataset:{saveMore:'true'}}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(dialog.open,false);
  dialog.nextValues={name:'Newer product',sku:'NEW'};productForm(ctx);const newerForm=dialog.form;markForm(newerForm,true);
  finishRefresh();await pending;
  assert.equal(dialog.form,newerForm);assert.equal(newerForm.dataset.dirty,'true');
  assert.equal(newerForm.values.name,'Newer product');assert.equal(dialog.open,true);
});
test('save and add another keeps its continuation after updating a created return with newer pending edits',async t=>{
  const dialog=boundary(t);dialog.nextValues={productId:'1',serialNumber:'SN-ONE'};
  let finish;const requests=[],ctx=context({api:async(path,options)=>{requests.push([path,options.method]);return requests.length===1?new Promise(resolve=>finish=resolve):{id:91};}});
  returnForm(ctx);const original=dialog.form;
  const pending=original.onsubmit({...event,submitter:{dataset:{saveMore:'true'}}});
  original.values.serialNumber='SN-NEW';original.oninput();finish({id:91});await pending;
  assert.equal(dialog.form,original);assert.equal(original.dataset.dirty,'true');
  dialog.nextValues={productId:'1'};
  await original.onsubmit({...event,submitter:{dataset:{saveMore:'true'}}});
  assert.deepEqual(requests,[['/api/returns','POST'],['/api/returns/91','PUT']]);
  assert.equal(dialog.open,true);assert.notEqual(dialog.form,original);
  assert.doesNotMatch(dialog.html,/SN-ONE|SN-NEW/);
});
test('a product estimate keeps its USD currency snapshot if a pending refresh changes global settings',t=>{
  const dialog=boundary(t);dialog.nextValues={price:'10,00'};
  const ctx=context({config:{currency:{base:'EUR',display:'USD',rate:1.1}}});
  productForm(ctx,{priceCents:1000});
  assert.match(dialog.html,/Umgerechnete Anzeige \(USD\)/);
  ctx.config.currency={base:'EUR',display:'EUR',rate:null};
  const price=dialog.form.elements.price;price.value='20,00';price.oninput({target:price});
  assert.match(dialog.querySelector('#price-estimate').textContent,/22,00.*\$/);
  assert.equal(price.value,'20,00');
});
function context(extra={}){return {config:{rules:{}},masterdata:{statuses:[],resolutions:[]},products:[{id:1,name:'Produkt',sku:'P-1',active:true}],session:{user:{id:1}},isAdmin:true,capabilities:{edit:true,delete:true},can(key){return hasPermission({role:this.isAdmin?'admin':'member',permissions:this.session.user.permissions},key);},canAdminSection(section){return canAdminSection({role:this.isAdmin?'admin':'member',permissions:this.session.user.permissions},section);},api:async()=>({}),reload:async()=>{},toast(){},ensureUnlocked:action=>action(),...extra};}
async function openUser(ctx,dialog){
  const create=element(),list=element(),root={querySelector:selector=>selector==='#user-create'?create:list};list.querySelectorAll=()=>[];
  await bindUsers({...ctx,api:async(path,options)=>path==='/api/users'&&!options?[]:ctx.api(path,options)},root);
  create.onclick();return dialog.form;
}
function openMaster(ctx,dialog){
  const create=element(),root={querySelector:selector=>selector==='#master-create'?create:null,querySelectorAll:()=>[]};
  bindAdmin(ctx,root);create.onclick();return dialog.form;
}
for(const [label,open,values,path]of [
  ['product',ctx=>productForm(ctx),{name:'Testprodukt',sku:'TEST-1',active:'true'},'/api/products'],
  ['return',ctx=>returnForm(ctx),{productId:'1',quantity:'1'},'/api/returns'],
  ['master data',openMaster,{name:'Testlieferant',active:true},'/api/masterdata/suppliers'],
  ['user',openUser,{username:'Tester',displayName:'Test',password:'Test-Password123!',passwordConfirm:'Test-Password123!',role:'member'},'/api/users']
]){
  test(`${label} save clears dirty before closing and refresh failure cannot undo persistence`,async t=>{
    const dialog=boundary(t);dialog.nextValues=values;let persisted=false;
    const ctx=context({api:async(request,options)=>{assert.equal(request,path);assert.equal(options.method,'POST');persisted=true;return {};},reload:async()=>{assert.equal(persisted,true);assert.equal(dialog.form.dataset.dirty,'false');throw new Error('Refresh failed');}});
    await open(ctx,dialog);const savedForm=dialog.form;markForm(savedForm,true);
    await savedForm.onsubmit(event);
    assert.equal(persisted,true);assert.equal(dialog.dirtyAtClose,'false');assert.equal(savedForm.dataset.dirty,'false');assert.equal(savedForm.status.hidden,true);
  });
  test(`${label} write failure retains dirty input for retry`,async t=>{
    const dialog=boundary(t);dialog.nextValues=values;
    await open(context({api:async()=>{throw new Error('Write failed');}}),dialog);const savedForm=dialog.form;markForm(savedForm,true);
    await savedForm.onsubmit(event);
    assert.equal(savedForm.dataset.dirty,'true');assert.equal(savedForm.status.hidden,false);assert.equal(dialog.open,true);assert.equal(savedForm.querySelector('.form-error').textContent,'Write failed');assert.equal(savedForm.querySelector('[type=submit]').disabled,false);
  });
  test(`${label} keeps newer edits visible when its pending write completes`,async t=>{
    const dialog=boundary(t);dialog.nextValues=values;let finish,refreshes=0;
    await open(context({api:()=>new Promise(resolve=>finish=resolve),reload:async()=>refreshes++}),dialog);const savedForm=dialog.form;markForm(savedForm,true);const saving=savedForm.onsubmit(event);
    savedForm.values.name='Newer input';savedForm.oninput?.();markForm(savedForm,true);finish({});await saving;
    assert.equal(dialog.open,true);assert.equal(dialog.form,savedForm);assert.equal(savedForm.values.name,'Newer input');assert.equal(savedForm.dataset.dirty,'true');assert.equal(refreshes,0);
  });
  test(`${label} create retry updates the persisted record after retaining newer input`,async t=>{
    const dialog=boundary(t);dialog.nextValues=values;let finish;const requests=[];
    await open(context({api:async(request,options)=>{requests.push([request,options.method]);return requests.length===1?new Promise(resolve=>finish=resolve):{id:73};}}),dialog);
    const savedForm=dialog.form;markForm(savedForm,true);const saving=savedForm.onsubmit(event);savedForm.values.name='Newer input';savedForm.oninput?.();finish({id:73});await saving;
    assert.equal(dialog.open,true);await savedForm.onsubmit(event);
    assert.deepEqual(requests,[[path,'POST'],[label==='master data'?'/api/masterdata/73':path+'/73','PUT']]);assert.equal(savedForm.dataset.dirty,'false');assert.equal(dialog.open,label==='return');if(label==='return')assert.match(dialog.html,/Retourendetails/);
  });
}
test('CSV profile create retry updates the persisted profile after retaining newer input',async t=>{
  const dialog=boundary(t);dialog.nextValues={name:'First',kind:'products',delimiter:';',duplicates:'error'};const create=element(),target=element();target.querySelectorAll=()=>[];
  const root={querySelector:selector=>selector==='#profile-create'?create:target};let finish;const requests=[];
  await bindCsvProfiles(context({api:async(path,options)=>{if(!options)return [];requests.push([path,options.method]);return requests.length===1?new Promise(resolve=>finish=resolve):{id:31};}}),root);
  create.onclick();const savedForm=dialog.form;markForm(savedForm,true);const saving=savedForm.onsubmit(event);savedForm.values.name='Newer input';savedForm.oninput?.();finish({id:31});await saving;
  assert.equal(dialog.open,true);await savedForm.onsubmit(event);
  assert.deepEqual(requests,[['/api/admin/csv-profiles','POST'],['/api/admin/csv-profiles/31','PUT']]);assert.equal(savedForm.dataset.dirty,'false');assert.equal(dialog.open,false);
});
test('late successful product save clears its captured form and retains a newer dialog form dirty state',async t=>{
  const dialog=boundary(t);dialog.nextValues={name:'First',sku:'FIRST'};let finish;
  productForm(context({api:()=>new Promise(resolve=>finish=resolve)}));const previous=dialog.form;markForm(previous,true);const saving=previous.onsubmit(event);
  dialog.nextValues={name:'Second',sku:'SECOND'};productForm(context());const newer=dialog.form;markForm(newer,true);
  finish({});await saving;
  assert.equal(previous.dataset.dirty,'false');assert.equal(newer.dataset.dirty,'true');assert.equal(newer.status.hidden,false);
  assert.equal(dialog.open,true);assert.equal(dialog.form,newer);
});
test('product image submission reads its captured file and omits local editor controls from the API payload',async t=>{
  const dialog=boundary(t),previousReader=globalThis.FileReader;let reader,sent;
  globalThis.FileReader=class{readAsDataURL(file){this.file=file;reader=this;}};t.after(()=>globalThis.FileReader=previousReader);
  const selected=new File(['image bytes'],'test.png',{type:'image/png'});dialog.nextValues={name:'Picture',sku:'PIC',productImageFile:selected,productImageAction:'keep'};
  productForm(context({api:async(path,options)=>{sent=options.body;return {id:1};}}));const saving=dialog.form.onsubmit(event);
  assert.equal(reader.file,selected);assert.equal(sent,undefined);reader.result='data:image/png;base64,aW1hZ2UgYnl0ZXM=';reader.onload();await saving;
  assert.deepEqual(sent.image,{name:'test.png',data:'aW1hZ2UgYnl0ZXM='});assert.equal(sent.productImageFile,undefined);assert.equal(sent.productImageAction,undefined);assert.equal(dialog.open,false);
});
test('a product image read cannot submit after its account or dialog has changed',async t=>{
  const dialog=boundary(t),previousReader=globalThis.FileReader;let reader,writes=0;
  globalThis.FileReader=class{readAsDataURL(){reader=this;}};t.after(()=>globalThis.FileReader=previousReader);
  for(const reason of ['account','dialog']){
    const ctx=context({authGeneration:1,api:async()=>{writes++;return {};}});dialog.nextValues={name:'Picture',sku:'PIC',productImageFile:new File(['bytes'],'test.png'),productImageAction:'keep'};
    productForm(ctx);const saving=dialog.form.onsubmit(event);if(reason==='account')ctx.authGeneration++;else dialog.close();reader.result='data:image/png;base64,Ynl0ZXM=';reader.onload();await saving;
  }
  assert.equal(writes,0);
});
test('removing a product image submits an explicit null; ordinary edits omit the image field',async t=>{
  const dialog=boundary(t);let sent;const ctx=context({api:async(path,options)=>{sent=options.body;return {};}});
  for(const action of ['keep','remove']){dialog.nextValues={name:'Picture',sku:'PIC',productImageAction:action};productForm(ctx);await dialog.form.onsubmit(event);assert.equal(sent.image,action==='remove'?null:undefined);assert.equal(sent.productImageAction,undefined);}
});
test('removing an image during a pending product create removes the persisted image on the next save',async t=>{
  const dialog=boundary(t),previousReader=globalThis.FileReader;let reader,finish;const requests=[];
  globalThis.FileReader=class{readAsDataURL(){reader=this;}};t.after(()=>globalThis.FileReader=previousReader);
  const selected=new File(['bytes'],'test.png');dialog.nextValues={name:'Picture',sku:'PIC',productImageFile:selected,productImageAction:'keep'};
  const ctx=context({api:async(path,options)=>{requests.push({path,body:options.body});return requests.length===1?new Promise(resolve=>finish=resolve):{id:73};}});
  productForm(ctx);const original=dialog.form,editor=dialog.querySelector('.product-image-editor');editor.querySelector('[data-image-file]').files=[selected];
  const saving=original.onsubmit(event);reader.result='data:image/png;base64,Ynl0ZXM=';reader.onload();await new Promise(resolve=>setImmediate(resolve));
  original.values.productImageFile=new File([],'');editor.querySelector('[data-image-file]').files=[];original.onchange();finish({id:73,imageVersion:'saved-image',imageName:'test.png'});await saving;
  assert.equal(dialog.open,true);assert.equal(editor.querySelector('[name=productImageAction]').value,'remove');
  original.values.productImageAction='remove';await original.onsubmit(event);
  assert.equal(requests[1].path,'/api/products/73');assert.equal(requests[1].body.image,null);assert.equal(dialog.open,false);
});
for(const [kind,id,want]of [['products',17,'/admin#audit?entity=products&entityId=17'],['returns',42,'/admin#audit?entity=returns&entityId=42']]){
  test(`${kind} rendered details link directly to that record audit history`,t=>{
    const dialog=boundary(t),ctx=context({api:async path=>path==='/api/config'?{uploadMaxMb:2,maxFilesPerReturn:5}:[]});
    dialog.querySelector('#return-attachments').isConnected=false;
    showDetails(ctx,kind,{id,name:'Produkt',returnNumber:'RET-42',priceCents:1200,active:true});
    const link=dialog.querySelector(kind==='returns'?'[data-detail-panel=history]':'.dialog-body').children.find(child=>child.textContent==='Änderungsverlauf öffnen');
    assert.ok(link);assert.equal(link.href,want);
  });
}
test('non-admin detail view has no audit history link',t=>{
  const dialog=boundary(t);showDetails(context({isAdmin:false}),'products',{id:17,name:'Produkt',priceCents:1200});
  assert.equal(dialog.querySelector('.dialog-body').children.length,0);
});
function accountRoot(){
  const nodes={
    '#profile-form':form({displayName:'Updated'}),'#preferences-form':form({theme:'dark',reduceMotion:true}),
    '#account-password':form({password:'OldPassword!',newPassword:'NewPassword123!',confirm:'NewPassword123!',factor:''}),
    '#mfa-action':form({password:'OldPassword!',factor:'',action:'disable'}),'#account-signout':element()
  };
  const revoke={...element(),dataset:{revoke:'session-1'}},target=element();target.querySelector=selector=>nodes[selector];target.querySelectorAll=()=>[revoke];
  return {querySelector:()=>target,nodes,revoke};
}
for(const [selector,path]of [['#profile-form','/api/account/profile'],['#account-password','/api/account/password'],['#mfa-action','/api/account/mfa/disable']]){
  test(`${selector} successful write clears dirty before session refresh`,async t=>{
    boundary(t);const root=accountRoot();let seen=false;
    const ctx=context({applySession(){},api:async(request,options)=>{if(!options)return request.endsWith('/sessions')?[]:{};assert.equal(request,path);seen=true;return {};},reload:async()=>{assert.equal(root.nodes[selector].dataset.dirty,'false');throw new Error('Refresh failed');}});
    await bindAccount(ctx,root);const savedForm=root.nodes[selector];markForm(savedForm,true);await savedForm.onsubmit(event);
    assert.equal(seen,true);assert.equal(savedForm.dataset.dirty,'false');assert.equal(savedForm.status.hidden,true);
  });
}
test('account session revocation clears dialog dirty before close and refresh',async t=>{
  const dialog=boundary(t),root=accountRoot();dialog.nextValues={password:'Password123!',factor:''};
  const ctx=context({api:async(path,options)=>{if(!options)return path.endsWith('/sessions')?[]:{};assert.equal(path,'/api/account/sessions/revoke');return {};},reload:async()=>{throw new Error('Refresh failed');}});
  await bindAccount(ctx,root);root.revoke.onclick();const savedForm=dialog.form;markForm(savedForm,true);await savedForm.onsubmit(event);
  assert.equal(dialog.dirtyAtClose,'false');assert.equal(savedForm.dataset.dirty,'false');
});
test('confirmed recovery acknowledgement clears dirty before closing',async t=>{
  const dialog=boundary(t);dialog.nextValues={saved:'on'};recoveryView(context(),['a-code'],async()=>{});const savedForm=dialog.form;markForm(savedForm,true);await savedForm.onsubmit(event);
  assert.equal(dialog.dirtyAtClose,'false');
});
test('MFA recovery code generation keeps returned codes visible and locks pending input',async t=>{
  const dialog=boundary(t),root=accountRoot();root.nodes['#mfa-action'].values.action='recovery-codes';let finish;
  await bindAccount(context({api:async(path,options)=>options?new Promise(resolve=>finish=resolve):path.endsWith('/sessions')?[]:{}}),root);
  const savedForm=root.nodes['#mfa-action'];markForm(savedForm,true);const saving=savedForm.onsubmit(event),pendingInert=savedForm.inert;
  savedForm.values.password='Programmatic change';savedForm.oninput?.();finish({recoveryCodes:['saved-recovery-code']});await saving;
  assert.equal(dialog.open,true);assert.match(dialog.html,/saved-recovery-code/);assert.equal(pendingInert,true);assert.equal(savedForm.inert,false);
});

for(const action of ['setup','recovery-codes','disable'])for(const transition of ['lock','other user']){
  test(`late MFA ${action} cannot reopen or apply secrets after ${transition}`,async t=>{
    const dialog=boundary(t),root=accountRoot();root.nodes['#mfa-action'].values.action=action;let finish,applied=0;
    const ctx=context({unlocked:true,authGeneration:1,applySession(){applied++;},api:async(path,options)=>options?new Promise(resolve=>finish=resolve):path.endsWith('/sessions')?[]:{}});
    await bindAccount(ctx,root);const saving=root.nodes['#mfa-action'].onsubmit(event);
    ctx.authGeneration++;ctx.unlocked=transition!=='lock';ctx.session={user:transition==='lock'?null:{id:2}};dialog.close();
    finish({secret:'must-stay-hidden',qrDataUrl:'data:image/png;base64,test',enrollmentId:'pending',recoveryCodes:['must-stay-hidden']});await saving;
    assert.equal(dialog.open,false);assert.doesNotMatch(dialog.html,/must-stay-hidden/);assert.equal(applied,0);
  });
}
test('late MFA verification cannot replace a locked enrollment with recovery codes',async t=>{
  const dialog=boundary(t);dialog.nextValues={code:'123456'};let finish;
  const ctx=context({authGeneration:1,unlocked:true,api:()=>new Promise(resolve=>finish=resolve)});
  enrollmentView(ctx,{secret:'enrollment-secret',qrDataUrl:'data:image/png;base64,test',enrollmentId:'pending'},'/api/account/mfa',{},async()=>{});
  const saving=dialog.form.onsubmit(event);ctx.authGeneration++;ctx.unlocked=false;ctx.session={user:null};dialog.close();
  finish({confirmationId:'confirmed',recoveryCodes:['must-stay-hidden']});await saving;
  assert.equal(dialog.open,false);assert.doesNotMatch(dialog.html,/must-stay-hidden/);
});
test('late enrollment confirmation cannot restore a logged-out session',async t=>{
  const dialog=boundary(t);dialog.nextValues={code:'123456'};let finish,applied=0;
  const ctx=context({authGeneration:1,unlocked:true,applySession(){applied++;},api:async path=>path.endsWith('/verify')?{confirmationId:'confirmed',recoveryCodes:['a-code']}:new Promise(resolve=>finish=resolve)});
  enrollmentView(ctx,{secret:'secret',qrDataUrl:'data:image/png;base64,test',enrollmentId:'pending'},'/api/account/mfa',{},async()=>{});
  await dialog.form.onsubmit(event);const saving=dialog.form.onsubmit(event);
  ctx.authGeneration++;ctx.unlocked=false;ctx.session={user:null};dialog.close();
  finish({unlocked:true,user:{id:1},csrfToken:'late-session'});await saving;
  assert.equal(applied,0);assert.equal(dialog.open,false);
});
test('anonymous MFA enrollment can verify, acknowledge codes and establish its session',async t=>{
  const dialog=boundary(t);dialog.nextValues={code:'123456'};let applied=0,finished=0;
  const ctx=context({unlocked:false,authGeneration:1,session:{user:null},applySession(session){applied++;this.unlocked=true;this.session=session;this.authGeneration++;},api:async path=>path.endsWith('/verify')?{confirmationId:'confirmed',recoveryCodes:['a-code']}:{unlocked:true,user:{id:1},csrfToken:'new-session'}});
  enrollmentView(ctx,{secret:'secret',qrDataUrl:'data:image/png;base64,test',enrollmentId:'pending'},'/api/login/mfa',{challengeId:'challenge'},async()=>finished++);
  await dialog.form.onsubmit(event);assert.equal(dialog.open,true);assert.match(dialog.html,/a-code/);
  await dialog.form.onsubmit(event);assert.equal(applied,1);assert.equal(finished,1);assert.equal(dialog.open,false);
});
test('a competing account session action cannot discard generated recovery codes',async t=>{
  const dialog=boundary(t),root=accountRoot();root.nodes['#mfa-action'].values.action='recovery-codes';let finish;
  await bindAccount(context({api:async(path,options)=>options?new Promise(resolve=>finish=resolve):path.endsWith('/sessions')?[]:{}}),root);
  const savedForm=root.nodes['#mfa-action'];markForm(savedForm,true);const saving=savedForm.onsubmit(event);
  root.revoke.onclick();finish({recoveryCodes:['protected-recovery-code']});await saving;
  assert.equal(dialog.open,true);assert.match(dialog.html,/protected-recovery-code/);
});
test('pending account MFA blocks Escape, backdrop and dismissal until its request settles',async t=>{
  const dialog=boundary(t),root=accountRoot();root.nodes['#mfa-action'].values.action='recovery-codes';let finish;
  await bindAccount(context({api:async(path,options)=>options?new Promise(resolve=>finish=resolve):path.endsWith('/sessions')?[]:{}}),root);
  const savedForm=root.nodes['#mfa-action'];markForm(savedForm,true);const saving=savedForm.onsubmit(event);let prevented=false;
  assert.equal(dialog.open,true);assert.equal(dialog.querySelector('.dialog-close').hidden,true);assert.equal(dialog.onclick,null);
  dialog.oncancel({preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.equal(dialog.open,true);
  finish({recoveryCodes:['protected-code']});await saving;
  assert.match(dialog.html,/protected-code/);assert.equal(dialog.querySelector('.dialog-close').hidden,false);
});
test('failed account MFA closes its busy dialog and restores competing session actions',async t=>{
  const dialog=boundary(t),root=accountRoot();root.nodes['#mfa-action'].values.action='recovery-codes';let fail;
  await bindAccount(context({api:async(path,options)=>options?new Promise((resolve,reject)=>fail=reject):path.endsWith('/sessions')?[]:{}}),root);
  const savedForm=root.nodes['#mfa-action'];markForm(savedForm,true);const saving=savedForm.onsubmit(event);
  assert.equal(dialog.open,true);fail(new Error('Wrong factor'));await saving;
  assert.equal(dialog.open,false);assert.equal(savedForm.inert,false);assert.equal(savedForm.dataset.dirty,'true');assert.equal(savedForm.querySelector('[role=alert]').textContent,'Wrong factor');
  root.revoke.onclick();assert.equal(dialog.open,true);assert.match(dialog.html,/Sitzung beenden/);assert.equal(dialog.querySelector('.dialog-close').hidden,false);
});
test('MFA enrollment verification keeps returned recovery codes and locks pending input',async t=>{
  const dialog=boundary(t);dialog.nextValues={code:'123456'};let finish;
  enrollmentView(context({api:()=>new Promise(resolve=>finish=resolve)}),{secret:'secret',qrDataUrl:'data:image/png;base64,test',enrollmentId:'pending'},'/api/account/mfa',{},async()=>{});
  const savedForm=dialog.form;markForm(savedForm,true);const saving=savedForm.onsubmit(event),pendingInert=savedForm.inert;
  savedForm.values.code='654321';savedForm.oninput?.();finish({confirmationId:'confirmed',recoveryCodes:['enrolled-recovery-code']});await saving;
  assert.equal(dialog.open,true);assert.match(dialog.html,/enrolled-recovery-code/);assert.equal(pendingInert,true);assert.equal(savedForm.inert,false);
});
test('failed MFA security write restores editing and retains the retryable input',async t=>{
  boundary(t);const root=accountRoot();await bindAccount(context({api:async(path,options)=>{if(options)throw new Error('Wrong factor');return path.endsWith('/sessions')?[]:{};}}),root);
  const savedForm=root.nodes['#mfa-action'];markForm(savedForm,true);await savedForm.onsubmit(event);
  assert.equal(savedForm.inert,false);assert.equal(savedForm.dataset.dirty,'true');assert.equal(savedForm.querySelector('[role=alert]').textContent,'Wrong factor');assert.equal(savedForm.querySelector('[type=submit]').disabled,false);
});
test('account write errors keep dirty input and show a retryable error',async t=>{
  boundary(t);const root=accountRoot();await bindAccount(context({api:async(path,options)=>{if(options)throw new Error('Write failed');return path.endsWith('/sessions')?[]:{};}}),root);
  const savedForm=root.nodes['#profile-form'];markForm(savedForm,true);await savedForm.onsubmit(event);
  assert.equal(savedForm.dataset.dirty,'true');assert.equal(savedForm.querySelector('[role=alert]').textContent,'Write failed');assert.equal(savedForm.querySelector('[type=submit]').disabled,false);
});
for(const changed of ['input','change']){
  test(`wireForm retains newer ${changed} values during an in-flight save`,async t=>{
    boundary(t);const savedForm=form({displayName:'Original'});let finish;
    wireForm(savedForm,()=>new Promise(resolve=>finish=resolve));markForm(savedForm,true);const saving=savedForm.onsubmit(event);
    savedForm.values.displayName='New edit';savedForm['on'+changed]?.();markForm(savedForm,true);finish();await saving;
    assert.equal(savedForm.dataset.dirty,'true');assert.equal(savedForm.status.hidden,false);
  });
}
test('profile refresh cannot erase newer account input while saving',async t=>{
  boundary(t);const root=accountRoot();let finish,refreshes=0;
  await bindAccount(context({api:async(path,options)=>options?new Promise(resolve=>finish=resolve):path.endsWith('/sessions')?[]:{},reload:async()=>refreshes++}),root);
  const savedForm=root.nodes['#profile-form'];markForm(savedForm,true);const saving=savedForm.onsubmit(event);savedForm.values.displayName='New edit';savedForm.oninput?.();markForm(savedForm,true);finish({});await saving;
  assert.equal(refreshes,0);assert.equal(savedForm.dataset.dirty,'true');assert.equal(savedForm.values.displayName,'New edit');assert.equal(savedForm.isConnected,true);
});
const adminValues={complete_resolution:true,complete_notes:false,requireReplacementSerialOnExchange:true,requireCompletedDisposal:true,protectClosedReturns:true,name:'Profile',kind:'products',delimiter:';',duplicates:'error',deadlineDays:'7',numberPrefix:'RET',timezone:'Europe/Berlin',serialNumber:true,orderNumber:false,supplier:false,notes:false,enabled:true,frequency:'daily',time:'02:00',weekday:'1',retain:'7',smtpHost:'smtp.example.test',smtpUser:'test',smtpPort:'587',smtpMode:'starttls',from:'test@example.test',recipients:'test@example.test',inApp:true,newReturn:true,overdue:false,backupError:false,emailEnabled:true,'mail-newReturn':true,'mail-overdue':false,'mail-backupError':false,clearPassword:false};
for(const action of ['Status ändern','Übergabe','Löschen'])test(`return detail ${action} preserves a comment draft when leaving is cancelled`,async t=>{
 const dialog=boundary(t),created=[],create=document.createElement;let prompt,unlocks=0;
 document.body={append(node){prompt=node;}};
 document.createElement=tag=>{const node=create(tag);created.push(node);if(tag==='dialog'){node.controls={};node.querySelector=s=>node.controls[s]??={...element(),focus(){}};node.showModal=()=>{};node.close=()=>{};node.remove=()=>{};}return node;};
 showDetails(context({ensureUnlocked(){unlocks++;},api:async()=>[]}),'returns',{id:42,returnNumber:'RET-42',name:'Device'});
 const draft=form({body:'Unsent comment'});markForm(draft,true);dialog.querySelectorAll=s=>s==='form[data-dirty=true]'?[draft]:[];
 const control=action==='Löschen'?dialog.querySelector('#delete-item'):created.find(node=>node.textContent===action);
 assert.ok(control);const leaving=control.onclick();assert.ok(prompt,'must ask before replacing the detail dialog');assert.equal(unlocks,0);
 prompt.querySelector('[data-stay]').onclick();await leaving;
 assert.equal(unlocks,0);assert.equal(draft.values.body,'Unsent comment');assert.equal(draft.dataset.dirty,'true');assert.equal(dialog.open,true);
});
test('CSV mapping fields participate in dirty detection and stay out of the profile payload',async t=>{
 const dialog=boundary(t);dialog.nextValues={name:'Profile',kind:'products',delimiter:'auto',duplicates:'error',mapping_sku:''};let sent;
 const nodes=new Map(),root={querySelector:s=>nodes.get(s)??nodes.set(s,element()).get(s)};
 await bindCsvProfiles(context({api:async(path,options)=>{if(options){sent=options.body;return {id:1};}return [];}}),root);root.querySelector('#profile-create').onclick();
 assert.match(dialog.html,/<input name="mapping_sku" data-map="sku"/);
 const saved=dialog.form;observeForm(saved);saved.values.mapping_sku='Artikel';refreshFormState(saved);assert.equal(saved.dataset.dirty,'true');
 saved.querySelectorAll=s=>s==='[data-map]'?[{dataset:{map:'sku'},value:'Artikel'}]:[];
 await saved.onsubmit(event);assert.deepEqual(sent.mapping,{sku:'Artikel'});assert.equal(sent.mapping_sku,undefined);assert.equal(sent.name,'Profile');
});
test('creating a manual backup refreshes only its archive list and preserves an unsaved schedule',async t=>{
 boundary(t);const saved=form(adminValues),nodes=new Map(),root={querySelector:s=>s==='#backup-restore'?null:nodes.get(s)??nodes.set(s,{...element(),querySelector:q=>q==='form'?saved:null}).get(s),querySelectorAll:()=>[]};let reloads=0,listed=0,created=0;
 const ctx=context({api:async(path,options)=>{if(path.endsWith('/create')){created++;return {};}if(path.endsWith('/list')){listed++;return [{id:12,state:'complete',mode:'manual',createdAt:'2026-10-24T12:00:00Z',size:100}];}return adminValues;},reload:async()=>reloads++});
 await bindBackups(ctx,root);saved.values.time='17:45';markForm(saved,true);const button=root.querySelector('#backup-create');await button.onclick({currentTarget:button});
 assert.equal(created,1);assert.equal(listed,2);assert.equal(reloads,0);assert.equal(saved.values.time,'17:45');assert.equal(saved.dataset.dirty,'true');assert.equal(button.disabled,false);assert.match(root.querySelector('#backup-list').innerHTML,/data-backup-restore="12"/);
});
for(const [label,bind,selector,path]of [
  ['notifications',bindNotificationsSettings,'form','/api/admin/notifications'],
  ['return rules',bindRules,'form','/api/admin/rules'],
  ['backup settings',bindBackups,'form','/api/admin/backups'],
  ['CSV profile',bindCsvProfiles,'dialog','/api/admin/csv-profiles']
]){
  test(`${label} successful write clears dirty before refresh or notification`,async t=>{
    const dialog=boundary(t);dialog.nextValues=adminValues;
    const savedForm=form(adminValues);
    const nodes=new Map(),target={...element(),querySelector:query=>query===selector?savedForm:nodes.get(query)??nodes.set(query,element()).get(query),querySelectorAll:()=>[]};
    const root={querySelector:query=>query==='#backup-restore'?null:query==='#profile-create'?nodes.get(query)??nodes.set(query,element()).get(query):target};
    const ctx=context({api:async(request,options)=>{if(options){assert.equal(request,path);return {};}if(request.endsWith('/list')||request.endsWith('csv-profiles'))return [];return {...adminValues,requiredFields:[],recipients:['test@example.test'],eventTypes:['newReturn'],outbox:[]};},reload:async()=>{assert.equal((selector==='dialog'?dialog.form:savedForm).dataset.dirty,'false');throw new Error('Refresh failed');},toast:()=>{throw new Error('Notification failed');}});
    await bind(ctx,root);if(selector==='dialog')root.querySelector('#profile-create').onclick();const active=selector==='dialog'?dialog.form:savedForm;markForm(active,true);await active.onsubmit(event);
    assert.equal(active.dataset.dirty,'false');assert.equal(active.status.hidden,true);
    if(selector==='dialog')assert.equal(dialog.dirtyAtClose,'false');
  });
}

for(const discard of [false,true])test(`disposal action protects inline comment/share drafts; discard=${discard}`,async t=>{
 const dialog=boundary(t);dialog.open=true;dialog.innerHTML='Original details';const draft=form({text:'Private draft'});markForm(draft,true);dialog.querySelectorAll=selector=>selector==='form[data-dirty=true]'?[draft]:[];
 let prompt;const create=document.createElement;document.body={append(node){prompt=node;}};
 document.createElement=tag=>{if(tag!=='dialog')return create(tag);const controls={};return {setAttribute(){},querySelector:selector=>controls[selector]??={focus(){}},showModal(){},close(){},remove(){}};};
 const pending=openDisposalAction(context(),{id:2,disposalNumber:'DIS-2',mode:'destroy',details:{}},'approve',()=>{});
 assert.ok(prompt,'switching to an action must ask about the inline draft');assert.equal(dialog.html,'Original details');
 prompt.querySelector(discard?'[data-discard]':'[data-stay]').onclick();await pending;
 if(discard){assert.match(dialog.html,/disposal-action-form/);assert.equal(draft.dataset.dirty,'false');}else{assert.equal(dialog.html,'Original details');assert.equal(draft.dataset.dirty,'true');assert.equal(draft.values.text,'Private draft');}
});

test('normal return creation continues in the saved details after refreshing inventory',async t=>{
 const dialog=boundary(t);dialog.nextValues={productId:'1',serialNumber:'SN-NORMAL'};
 const saved={id:91,returnNumber:'RET-91',productName:'Device',revision:1};let refreshes=0;
 const ctx=context({returns:[],api:async(path,options)=>options?saved:[],reload:async()=>{refreshes++;ctx.returns=[saved];}});
 returnForm(ctx);await dialog.form.onsubmit(event);assert.equal(refreshes,1);assert.equal(dialog.open,true);assert.match(dialog.html,/Retourendetails/);assert.match(dialog.html,/RET-91/);
});
test('a successful return remains usable when the subsequent inventory refresh fails',async t=>{
 const dialog=boundary(t);dialog.nextValues={productId:'1',serialNumber:'SN-REFRESH'};const messages=[];
 const ctx=context({returns:[],api:async(path,options)=>options?{id:92,returnNumber:'RET-92',productName:'Device',revision:1}:[],reload:async()=>{throw Error('offline');},toast:message=>messages.push(String(message))});
 returnForm(ctx);await dialog.form.onsubmit(event);assert.equal(dialog.open,true);assert.match(dialog.html,/Retourendetails/);assert.ok(messages.some(message=>/gespeichert.*aktualisiert/i.test(message)),'successful persistence must be explained even if refreshing fails');
});
test('normal create completion cannot replace a newer dialog during inventory refresh',async t=>{
 const dialog=boundary(t);dialog.nextValues={productId:'1',serialNumber:'SN-NORMAL'};let finish;
 const ctx=context({returns:[],api:async()=>({id:91,returnNumber:'RET-91'}),reload:()=>new Promise(resolve=>finish=resolve)});
 returnForm(ctx);const previous=dialog.form,pending=previous.onsubmit(event);await new Promise(setImmediate);
 dialog.nextValues={name:'Newer editor',sku:'NEW'};productForm(ctx);const newer=dialog.form;markForm(newer,true);finish();await pending;
 assert.equal(dialog.form,newer);assert.equal(newer.dataset.dirty,'true');assert.equal(dialog.open,true);
});

test('return transition completion cannot displace a newer editor during inventory refresh',async t=>{
 const dialog=boundary(t);dialog.nextValues={statusId:'1',reason:'Recheck'};let finish,opened=0;
 const ctx=context({masterdata:{statuses:[{id:1,active:true,isClosed:false,name:'Received'}]},api:async()=>({id:91}),reload:()=>new Promise(resolve=>finish=resolve)});
 returnTransition(ctx,{id:91,revision:1,isClosed:true},'reopen',()=>opened++);const pending=dialog.form.onsubmit(event);await new Promise(setImmediate);
 dialog.nextValues={name:'Newer editor',sku:'NEW'};productForm(ctx);const newer=dialog.form;markForm(newer,true);finish();await pending;
 assert.equal(opened,0,'the saved transition must not reopen old details over a new editor');assert.equal(dialog.form,newer);assert.equal(newer.dataset.dirty,'true');
});

test('normal create does not reopen details after the user navigates during inventory refresh',async t=>{
 const dialog=boundary(t);dialog.nextValues={productId:'1',serialNumber:'NAVIGATION'};let finish;
 const ctx=context({returns:[],api:async()=>({id:91,returnNumber:'RET-91'}),reload:()=>new Promise(resolve=>finish=resolve)});
 returnForm(ctx);const pending=dialog.form.onsubmit(event);await new Promise(setImmediate);location.hash='#products';finish();await pending;assert.equal(dialog.open,false,'the new route must remain in control');
});
test('product details use the confirmed saved revision if refreshing inventory fails',async t=>{
 const dialog=boundary(t),old={id:73,name:'Old product name',sku:'SKU',active:true,revision:1};dialog.nextValues={name:'New product name',sku:'SKU',active:'true'};
 const ctx=context({products:[old],api:async(path,options)=>options?{...old,name:'New product name',revision:2}:[],reload:async()=>{throw Error('offline');}});
 productForm(ctx,old);await dialog.form.onsubmit(event);assert.equal(dialog.open,true);assert.match(dialog.html,/New product name/);assert.doesNotMatch(dialog.html,/Old product name/);
});
