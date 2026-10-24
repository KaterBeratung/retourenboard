import test from 'node:test';import assert from 'node:assert/strict';
import * as account from '../dist/public/account.js';
import {bindComposer} from '../dist/public/collaboration-ui.js';

test('saving a profile refreshes its visible name and invalidates inventory without changing identity, permissions or drafts',()=>{
 assert.equal(typeof account.applyAccountProfile,'function');
 const returns=[{assignedUserId:1,assignedDisplayName:'Old name'}],state={session:{user:{id:1,username:'Tester',displayName:'Old name',role:'viewer'}},inventoryLoaded:true,returns,search:'keep filters'};
 assert.equal(account.applyAccountProfile(state,{id:1,displayName:'New name',role:'admin',username:'Untrusted override'}),true);
 assert.equal(state.session.user.displayName,'New name');assert.equal(state.session.user.role,'viewer');assert.equal(state.session.user.username,'Tester');assert.equal(state.inventoryLoaded,false);assert.equal(state.returns,returns);assert.equal(state.search,'keep filters');
 state.inventoryLoaded=true;account.applyAccountProfile(state,{id:2,displayName:'Other name'});assert.equal(state.session.user.displayName,'New name');assert.equal(state.inventoryLoaded,false);
});
test('mention suggestions reload person names when the picker is reopened and keep the message draft',async()=>{
 const input={value:'Unsaved message',selectionStart:15,addEventListener(){}},button={},error={hidden:true},menu={hidden:true,innerHTML:'',addEventListener(){},querySelectorAll:()=>[],querySelector:()=>null};
 const picker={},form={isConnected:true,closest:()=>null,querySelector:s=>s==='textarea'?input:s==='[type=submit]'?button:s==='.mention-menu'?menu:s==='[data-mention-picker]'?picker:error};
 let displayName='Old person',reads=0;bindComposer({unlocked:true},form,{people:async()=>{reads++;return [{id:2,username:'Person',displayName}];},post(){},after(){}});
 await picker.onclick();assert.match(String(menu.innerHTML),/Old person/);displayName='New person';await picker.onclick();
 assert.match(String(menu.innerHTML),/New person/);assert.doesNotMatch(String(menu.innerHTML),/Old person/);assert.equal(reads,2);assert.equal(input.value,'Unsaved message');
});
test('typing a new mention reloads names while continued prefix input shares the lookup and retains the draft',async()=>{
 const events={},input={value:'Draft before mention',selectionStart:20,addEventListener:(name,fn)=>events[name]=fn},menu={hidden:true,innerHTML:'',addEventListener(){},querySelectorAll:()=>[],querySelector:()=>null},picker={};
 const form={isConnected:true,closest:()=>null,querySelector:s=>s==='textarea'?input:s==='.mention-menu'?menu:s==='[data-mention-picker]'?picker:{}};
 let displayName='Old person',reads=0,finish;bindComposer({unlocked:true},form,{people:async()=>{reads++;const value=[{id:2,username:'Person',displayName}];if(reads===2)await new Promise(resolve=>finish=resolve);return value;},post(){},after(){}});
 input.value='@Per';input.selectionStart=4;events.input();await new Promise(setImmediate);assert.match(String(menu.innerHTML),/Old person/);
 input.value='Draft before another mention ';input.selectionStart=input.value.length;events.input();displayName='New person';
 input.value+='@P';input.selectionStart=input.value.length;events.input();await new Promise(setImmediate);
 input.value+='er';input.selectionStart=input.value.length;events.input();await new Promise(setImmediate);assert.equal(reads,2,'Further prefix input must share the pending directory request');
 finish();await new Promise(setImmediate);assert.match(String(menu.innerHTML),/New person/);assert.doesNotMatch(String(menu.innerHTML),/Old person/);assert.equal(input.value,'Draft before another mention @Per');
});
test('Escape keeps mention suggestions closed if a name lookup finishes later',async()=>{
 const events={},input={value:'@Per',selectionStart:4,addEventListener:(name,fn)=>events[name]=fn},menu={hidden:true,innerHTML:'',addEventListener(){},querySelectorAll:()=>[],querySelector:()=>null},picker={};
 const form={isConnected:true,closest:()=>null,querySelector:s=>s==='textarea'?input:s==='.mention-menu'?menu:s==='[data-mention-picker]'?picker:{}};
 let finish;bindComposer({unlocked:true},form,{people:()=>new Promise(resolve=>finish=resolve),post(){},after(){}});
 events.input();await new Promise(setImmediate);events.keydown({key:'Escape',preventDefault(){},stopPropagation(){}});finish([{id:2,username:'Person',displayName:'Current person'}]);await new Promise(setImmediate);assert.equal(menu.hidden,true);
});
