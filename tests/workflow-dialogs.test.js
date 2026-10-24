import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openBulkStatus} from '../dist/public/workflow-actions.js';
import {bindSavedFilters} from '../dist/public/workspace-tools.js';

function fixture(t){
 const previous={document:globalThis.document,FormData:globalThis.FormData};
 const node=()=>({hidden:false,dataset:{},setAttribute(){},addEventListener(type,fn){this['on'+type]=fn;},focus(){},select(){}});
 const button=node(),error=node(),close=node(),field=node();field.value='';
 const form={...node(),values:{statusId:''},closest:()=>null,status:null,querySelectorAll:()=>[],elements:{namedItem:()=>field},prepend(status){this.status=status;}};
 form.querySelector=s=>s==='.unsaved-status'?form.status:s==='[type=submit]'?button:s==='[data-saved-label]'?field:error;
 form.change=value=>{field.value=value;form.values.statusId=value;form.onchange?.({});};
 const dialog={open:false,querySelector:s=>s==='.dialog-close'?close:form,querySelectorAll:()=>[],showModal(){this.open=true;},close(){this.open=false;}};
 globalThis.document={querySelector:()=>dialog,createElement:()=>node()};
 globalThis.FormData=class extends Map{constructor(target){super(Object.entries(target.values));}};
 const menu={open:true,querySelector:()=>node()};
 const root={contains:()=>true,querySelector:()=>menu,addEventListener(type,fn){this['on'+type]=fn;},removeEventListener(){}};
 const ctx={authGeneration:1,unlocked:true,session:{user:{id:1},csrfToken:'test'},returns:[{id:1,revision:3},{id:2,revision:7}],masterdata:{statuses:[{id:2,active:true,name:'In Prüfung'}]},can:()=>true,reload:async()=>{},toast(){}};
 t.after(()=>{for(const [key,value]of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}});
 return {ctx,form,dialog,root,field};
}
test('successful bulk status save clears dirty state on the retained closed form',async t=>{
 const {ctx,form,dialog}=fixture(t);ctx.api=async(path,options)=>{assert.deepEqual(options.body.revisions,{1:3,2:7});return {updated:2};};let changed=0;
 openBulkStatus(ctx,[1,2],()=>changed++);form.change('2');assert.equal(form.dataset.dirty,'true');
 await form.onsubmit({preventDefault(){}});assert.equal(dialog.open,false);assert.equal(form.dataset.dirty,'false');assert.equal(changed,1);
});
test('bulk status keeps a later edit and ignores duplicate submissions while saving',async t=>{
 const {ctx,form,dialog}=fixture(t);let resolve,calls=0;ctx.api=()=>{calls++;return new Promise(done=>resolve=done);};
 openBulkStatus(ctx,[1],()=>{});form.change('2');const save=form.onsubmit({preventDefault(){}});
 await form.onsubmit({preventDefault(){}});form.change('3');resolve({updated:1});await save;
 assert.equal(calls,1);assert.equal(dialog.open,true);assert.equal(form.dataset.dirty,'true');
});
test('a stale bulk result cannot close a replacement session dialog',async t=>{
 const {ctx,form,dialog}=fixture(t);let resolve,changes=0;ctx.api=()=>new Promise(done=>resolve=done);
 openBulkStatus(ctx,[1],()=>changes++);form.change('2');const save=form.onsubmit({preventDefault(){}});ctx.authGeneration++;resolve({updated:1});await save;
 assert.equal(dialog.open,true);assert.equal(changes,0);
});
test('saving a personal view establishes a clean form baseline',t=>{
 const {ctx,form,dialog,root,field}=fixture(t),data=new Map();ctx.storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
 bindSavedFilters(ctx,root,{view:'returns',search:'SN-001'},()=>{});
 const button={dataset:{},hasAttribute:name=>name==='data-save-view',closest(){return this;}};root.onclick({target:button});field.value='My returns';form.change('My returns');assert.equal(form.dataset.dirty,'true');
 form.onsubmit({preventDefault(){}});assert.equal(dialog.open,false);assert.equal(form.dataset.dirty,'false');assert.equal(data.size,1);
});
test('opening search preserves a dirty inline form and only guards a replaced modal',async()=>{
 const source=readFileSync(new URL('../dist/public/app.js',import.meta.url),'utf8'),start=source.indexOf('async function searchWorkspace()'),end=source.indexOf('searchButton.onclick',start);assert.ok(start>=0&&end>start);
 const dialog={open:false},guarded=[];let searches=0;
 const search=new Function('ctx','document','canLeaveForms','navigation','openWorkspaceSearch',source.slice(start,end)+';return searchWorkspace;')({unlocked:true},{querySelector:()=>dialog},async root=>{guarded.push(root);return true;},{close(){}},()=>searches++);
 await search();assert.equal(searches,1);assert.deepEqual(guarded,[]);
 dialog.open=true;await search();assert.equal(searches,2);assert.deepEqual(guarded,[dialog]);
});
