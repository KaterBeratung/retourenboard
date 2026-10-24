import test from 'node:test';
import assert from 'node:assert/strict';
import {bindSso} from '../dist/public/admin-sso.js';

// Exercise the production form/dialog handlers; replace only browser controls
// and HTTP transport. No auth or save logic is reimplemented in the fixture.
function boundary(t){
 const originals={document:globalThis.document,FormData:globalThis.FormData};
 const node=()=>({dataset:{},hidden:false,isConnected:true,setAttribute(){},focus(){},addEventListener(){},textContent:''});
 function form(source){
  const value=node(),listeners={},controls=new Map();value.dataset=/data-form-mode="action"/.test(source)?{formMode:'action'}:{};
  for(const match of source.matchAll(/<input\b([^>]+)>/g)){const attrs=match[1],name=attrs.match(/\bname="([^"]+)"/)?.[1];if(name)controls.set(name,{name,type:attrs.match(/\btype="([^"]+)"/)?.[1]??'text',value:attrs.match(/\bvalue="([^"]*)"/)?.[1]??'on',checked:/\bchecked\b/.test(attrs),disabled:/\bdisabled\b/.test(attrs)});}
  const button=node(),error=node();error.hidden=true;
  value.elements={namedItem:name=>controls.get(name)};value.controls=controls;value.button=button;value.error=error;
  value.querySelector=selector=>selector==='[type=submit]'?button:selector==='[role=alert]'?error:selector==='.unsaved-status'?value.status:null;
  value.querySelectorAll=()=>[];value.closest=()=>null;value.prepend=status=>value.status=status;
  value.addEventListener=(type,fn)=>(listeners[type]??=[]).push(fn);value.change=(name,checked)=>{controls.get(name).checked=checked;for(const fn of listeners.change??[])fn();};
  return value;
 }
 const content=node(),buttons=new Map();
 Object.defineProperty(content,'innerHTML',{get(){return this.source??'';},set(source){if(this.form)this.form.isConnected=false;this.source=String(source);this.form=form(this.source.match(/<form\b[\s\S]*?<\/form>/)?.[0]??'');}});
 content.querySelector=selector=>selector==='[data-sso-settings]'?content.form:buttons.get(selector)??(buttons.set(selector,node()),buttons.get(selector));
 content.querySelectorAll=selector=>selector==='form[data-dirty=true]'&&content.form?.dataset.dirty==='true'?[content.form]:[];
 content.insertAdjacentHTML=(_,source)=>content.source+=source;
 const dialog=node(),dialogButtons={close:node(),cancel:node()},closeListeners=[];dialog.open=false;
 Object.defineProperty(dialog,'innerHTML',{get(){return this.source??'';},set(source){this.source=String(source);this.form=form(this.source.match(/<form\b[\s\S]*?<\/form>/)?.[0]??'');}});
 dialog.querySelector=selector=>selector==='form'?dialog.form:selector==='.dialog-close'?dialogButtons.close:null;
 dialog.querySelectorAll=selector=>selector==='[data-close]'?[dialogButtons.cancel]:[];
 dialog.showModal=()=>dialog.open=true;dialog.close=()=>{dialog.open=false;for(const fn of closeListeners.splice(0))fn();};dialog.addEventListener=(type,fn)=>{if(type==='close')closeListeners.push(fn);};
 globalThis.document={querySelector:selector=>selector==='#dialog'?dialog:null,createElement:()=>node()};
 globalThis.FormData=class extends Map{constructor(target){super([...target.controls].filter(([,c])=>!c.disabled&&(c.type!=='checkbox'||c.checked)).map(([name,c])=>[name,c.value]));}};
 t.after(()=>{for(const [key,value]of Object.entries(originals))if(value===undefined)delete globalThis[key];else globalThis[key]=value;});
 return {content,dialog,cancel:dialogButtons.cancel,root:{querySelector:()=>content}};
}
async function fixture(t,{failure=false,pause=false}={}){
 const ui=boundary(t),writes=[],toasts=[];let settings={enabled:false,revision:1},reads=0,resume;
 const gate=pause?new Promise(r=>resume=r):Promise.resolve();
 const ctx={isAdmin:true,unlocked:true,authGeneration:1,session:{user:{id:1},csrfToken:'test'},toast:message=>toasts.push(String(message)),api:async(path,options={})=>{
  if(options.method==='PUT'){writes.push(options.body);await gate;if(failure)throw Error('Password rejected');settings={enabled:options.body.enabled,revision:2};return {...settings};}
  if(path==='/api/users')return [];
  reads++;return {settings:{...settings},providers:[],requests:[],identities:[],publicOrigin:'https://example.test'};
 }};
 await bindSso(ctx,ui.root);assert.equal(ui.content.form.controls.has('password'),false,'settings must request credentials in a confirmation dialog before writing');return {...ui,ctx,writes,toasts,resume,get reads(){return reads;}};
}
const submit=form=>form.onsubmit({preventDefault(){}});

test('OAuth setting opens credential confirmation before any write and cancel preserves the draft',async t=>{
 const f=await fixture(t),form=f.content.form;assert.equal(form.controls.has('password'),false,'credentials belong in the confirmation dialog');
 form.change('enabled',true);await submit(form);assert.equal(f.dialog.open,true);assert.equal(f.writes.length,0);assert.equal(form.dataset.dirty,'true');assert.ok(f.dialog.form.controls.has('password'));
 await f.cancel.onclick();assert.equal(f.dialog.open,false);assert.equal(form.elements.namedItem('enabled').checked,true);assert.equal(form.dataset.dirty,'true');assert.equal(form.button.disabled,false);
});
test('confirmed OAuth setting submits captured value, revision and credentials then clears the saved draft',async t=>{
 const f=await fixture(t),form=f.content.form;form.change('enabled',true);await submit(form);
 f.dialog.form.elements.namedItem('password').value='synthetic-admin';f.dialog.form.elements.namedItem('factor').value='123456';await submit(f.dialog.form);
 assert.deepEqual(f.writes,[{enabled:true,revision:1,password:'synthetic-admin',factor:'123456'}]);assert.equal(f.dialog.open,false);assert.equal(f.content.form.elements.namedItem('enabled').checked,true);assert.notEqual(f.content.form.dataset.dirty,'true');assert.equal(f.toasts.length,1);
});
test('failed confirmation keeps credentials, dialog and pending OAuth change available for retry',async t=>{
 const f=await fixture(t,{failure:true}),form=f.content.form;form.change('enabled',true);await submit(form);const confirmation=f.dialog.form;confirmation.elements.namedItem('password').value='wrong';await submit(confirmation);
 assert.equal(f.dialog.open,true);assert.equal(confirmation.error.hidden,false);assert.equal(confirmation.error.textContent,'Password rejected');assert.equal(confirmation.elements.namedItem('password').value,'wrong');assert.equal(confirmation.inert,false);assert.equal(form.dataset.dirty,'true');assert.equal(f.toasts.length,0);
});
test('confirmation from an obsolete account context cannot write OAuth settings',async t=>{
 const f=await fixture(t),form=f.content.form;form.change('enabled',true);await submit(form);f.ctx.authGeneration++;await submit(f.dialog.form);assert.equal(f.writes.length,0);assert.equal(f.toasts.length,0);
});
test('a later checkbox edit survives an in-flight confirmation and its new revision is retained',async t=>{
 const f=await fixture(t,{pause:true}),form=f.content.form;form.change('enabled',true);await submit(form);const pending=submit(f.dialog.form);form.change('enabled',false);f.resume();await pending;
 assert.equal(f.writes[0].enabled,true);assert.equal(form.isConnected,true);assert.equal(form.elements.namedItem('enabled').checked,false);assert.equal(form.dataset.dirty,'true');assert.equal(f.reads,1,'a refresh must not erase newer input');
 assert.match(f.content.querySelector('[data-sso-status]').innerHTML??'',/class="status done"/,'persisted status must reflect the accepted save while a newer draft remains');
 await submit(form);await submit(f.dialog.form);assert.equal(f.writes[1].revision,2);
});
test('closing a pending confirmation cannot open a dialog backed by a detached settings form',async t=>{
 const f=await fixture(t,{pause:true}),form=f.content.form;form.change('enabled',true);await submit(form);const confirmation=f.dialog.form,pending=submit(confirmation);
 f.dialog.close();assert.equal(form.button.disabled,true,'keep the setting locked until its write settles');await submit(form);assert.equal(f.dialog.open,false,'a second confirmation must wait for the accepted write');
 f.resume();await pending;await submit(f.content.form);assert.equal(f.dialog.open,true);await submit(f.dialog.form);assert.equal(f.writes[1].revision,2);
});
test('a failed write after closing confirmation releases the retained settings draft for retry',async t=>{
 const f=await fixture(t,{pause:true,failure:true}),form=f.content.form;form.change('enabled',true);await submit(form);const pending=submit(f.dialog.form);f.dialog.close();f.resume();await pending;
 assert.equal(form.isConnected,true);assert.equal(form.dataset.dirty,'true');assert.equal(form.button.disabled,false);await submit(form);assert.equal(f.dialog.open,true);
});
