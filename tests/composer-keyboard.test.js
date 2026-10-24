import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceModule} from './helpers/source-module.js';
const {bindComposer}=await sourceModule("export {bindComposer} from './frontend/src/collaboration-ui.ts';");

function fixture(){
 const node=()=>({hidden:false,handlers:{},addEventListener(type,callback){this.handlers[type]=callback;},focus(){focused=this;},setSelectionRange(){},dispatchEvent(){},querySelectorAll:()=>[]});
 let focused,posts=0;
 const input={...node(),value:'Kommentar @ma',selectionStart:13},candidate=node(),menu={...node(),hidden:true,querySelector:()=>candidate},picker=node(),submit=node(),error=node();
 menu.querySelectorAll=()=>[candidate];
 const form={isConnected:true,closest:()=>({open:true}),querySelector:selector=>({textarea:input,'[type=submit]':submit,'.form-error:not([data-chat-file-error])':error,'.mention-menu':menu,'[data-mention-picker]':picker})[selector]};
 const ctx={unlocked:true,toast(){}};
 const bind=people=>bindComposer(ctx,form,{people,post:async()=>{posts++;},after(){}});
 const key=value=>({key:value,prevented:false,stopped:false,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}});
 return {input,candidate,menu,picker,key,bind,focused:()=>focused,posts:()=>posts};
}
const people=async()=>[{id:2,username:'max',displayName:'Max'}];
test('Escape dismisses open mentions without reaching the enclosing dirty dialog',async()=>{
 const f=fixture();f.bind(people);await f.picker.onclick();assert.equal(f.menu.hidden,false);
 const event=f.key('Escape');f.input.handlers.keydown(event);
 assert.equal(f.menu.hidden,true);assert.equal(event.prevented,true);assert.equal(event.stopped,true);
 assert.equal(f.input.value,'Kommentar @ma');assert.equal(f.posts(),0);
 const second=f.key('Escape');f.input.handlers.keydown(second);assert.equal(second.prevented,false);assert.equal(second.stopped,false);
});
test('Escape on a focused mention returns to the textarea and retains its draft',async()=>{
 const f=fixture();f.bind(people);await f.picker.onclick();assert.equal(f.focused(),f.candidate);
 const event=f.key('Escape');f.menu.handlers.keydown?.(event);
 assert.equal(f.menu.hidden,true);assert.equal(event.prevented,true);assert.equal(event.stopped,true);assert.equal(f.focused(),f.input);
 assert.equal(f.input.value,'Kommentar @ma');assert.equal(f.posts(),0);
});
test('Escape cancels a pending mention lookup before it can reopen the suggestions',async()=>{
 const f=fixture();let resolve;f.bind(()=>new Promise(r=>resolve=r));
 f.input.value='@';f.input.selectionStart=1;f.input.handlers.input();await Promise.resolve();
 const event=f.key('Escape');f.input.handlers.keydown(event);assert.equal(event.prevented,true);assert.equal(event.stopped,true);
 resolve(await people());await new Promise(setImmediate);assert.equal(f.menu.hidden,true);assert.equal(f.input.value,'@');
});
test('Escape on the explicit picker cancels its pending lookup and returns to the draft',async()=>{
 const f=fixture();let resolve;f.bind(()=>new Promise(r=>resolve=r));f.picker.focus();
 const pending=f.picker.onclick();await Promise.resolve();
 const event=f.key('Escape');f.picker.onkeydown?.(event);assert.equal(event.prevented,true);assert.equal(event.stopped,true);assert.equal(f.focused(),f.input);
 const second=f.key('Escape');f.input.handlers.keydown(second);assert.equal(second.prevented,false);assert.equal(second.stopped,false);
 resolve(await people());await pending;assert.equal(f.menu.hidden,true);assert.equal(f.focused(),f.input);assert.equal(f.input.value,'Kommentar @ma');
});
test('closed mention menus leave Escape and ordinary textarea keys to their normal handlers',()=>{
 const f=fixture();f.bind(people);
 for(const key of ['Escape','ArrowDown','Enter']){const event=f.key(key);f.input.handlers.keydown(event);assert.equal(event.prevented,false);assert.equal(event.stopped,false);}
 assert.equal(f.input.value,'Kommentar @ma');assert.equal(f.posts(),0);
});
