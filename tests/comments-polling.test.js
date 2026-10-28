import test from 'node:test';
import assert from 'node:assert/strict';
import {renderComments} from '../dist/public/comments.js';

test('unchanged comment polling preserves its message controls while edits and deletions update',async t=>{
 const previous={document:globalThis.document,setTimeout:globalThis.setTimeout},timers=[];
 const log={value:'',writes:0,querySelector:()=>null,querySelectorAll:()=>[],get innerHTML(){return this.value;},set innerHTML(value){this.value=value;this.writes++;}};
 const older={},count={setAttribute(){},removeAttribute(){}};
 const root={isConnected:true,closest:()=>null,querySelector:selector=>selector==='.comment-log'?log:selector==='#comments-older'?older:selector==='#comment-count'?count:null,dispatchEvent(){}};
 let rows=[{id:7,text:'Abstimmung',author:{id:2,displayName:'Testperson'},createdAt:'2026-10-12T08:00:00Z',mentions:[],canEdit:false,canDelete:false}];
 globalThis.document={visibilityState:'visible'};globalThis.setTimeout=callback=>{timers.push(callback);return {unref(){}};};
 t.after(()=>{root.isConnected=false;for(const [key,value]of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}});
 renderComments({unlocked:true,session:{user:{id:1}},can:()=>false,api:async()=>({items:rows,hasMore:false,total:1})},4,root);
 await new Promise(setImmediate);const painted=log.writes;
 await timers.shift()();assert.equal(log.writes,painted,'An unchanged history must retain its controls and selection');
 rows=[{...rows[0],text:'Überarbeitete Abstimmung',editedAt:'2026-10-12T08:02:00Z'}];await timers.shift()();assert.equal(log.writes,painted+1);assert.match(log.innerHTML,/Überarbeitete Abstimmung/);
 rows=[{...rows[0],deleted:true,text:''}];await timers.shift()();assert.match(log.innerHTML,/Nachricht gelöscht/);assert.doesNotMatch(log.innerHTML,/Überarbeitete Abstimmung/);
});

test('a delayed comment poll cannot revert a confirmed deletion',async t=>{
 const previous={document:globalThis.document,setTimeout:globalThis.setTimeout,confirm:globalThis.confirm},timers=[],button={isConnected:true,dataset:{deleteMessage:'7'}};
 const original={id:7,text:'Original vor Löschung',author:{id:2,displayName:'Testperson'},createdAt:'2026-10-12T08:00:00Z',mentions:[],canEdit:false,canDelete:true};
 const log={isConnected:true,innerHTML:'',querySelector:()=>null,querySelectorAll(selector){return selector==='[data-delete-message]'&&this.innerHTML.includes('data-delete-message="7"')?[button]:[];}},older={},count={setAttribute(){},removeAttribute(){}};
 const root={isConnected:true,closest:()=>null,querySelector:selector=>selector==='.comment-log'?log:selector==='#comments-older'?older:selector==='#comment-count'?count:null,dispatchEvent(){}};
 globalThis.document={visibilityState:'visible'};globalThis.setTimeout=callback=>{timers.push(callback);return {unref(){}};};globalThis.confirm=()=>true;
 t.after(()=>{root.isConnected=false;for(const [key,value]of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}});
 let resolveIds,delay=false;const oldIds=new Promise(resolve=>resolveIds=resolve);
 renderComments({unlocked:true,session:{user:{id:1}},can:()=>false,api:async(path,options)=>{
  if(options?.method==='DELETE')return {...original,text:'',deleted:true,canDelete:false};
  if(delay&&path.includes('?ids=7'))return oldIds;
  return {items:path.includes('?after=')?[]:[original],hasMore:false,total:1};
 }},4,root);
 await new Promise(setImmediate);delay=true;const polling=timers.shift()();await new Promise(setImmediate);
 await button.onclick();assert.match(log.innerHTML,/Nachricht gelöscht/);
 resolveIds({items:[original],hasMore:false,total:1});await polling;assert.match(log.innerHTML,/Nachricht gelöscht/);assert.doesNotMatch(log.innerHTML,/Original vor Löschung/);
});

test('a remote comment update restores keyboard focus on the same visibility control',async t=>{
 const previous={document:globalThis.document,setTimeout:globalThis.setTimeout},timers=[];let input,card;
 const doc={visibilityState:'visible',activeElement:null};
 const log={value:'',contains:node=>node===input,querySelector:selector=>selector==='[data-message="7"]'?card:null,querySelectorAll:()=>[],get innerHTML(){return this.value;},set innerHTML(value){this.value=value;doc.activeElement=null;}};
 const root={isConnected:true,closest:()=>null,querySelector:selector=>selector==='.comment-log'?log:selector==='#comments-older'?{}:selector==='#comment-count'?{setAttribute(){},removeAttribute(){}}:null};
 const original={id:7,text:'First comment',author:{id:2,displayName:'Person'},createdAt:'2026-10-12T08:00:00Z',mentions:[],canEdit:false,canDelete:false};let rows=[original];
 globalThis.document=doc;globalThis.setTimeout=fn=>timers.push(fn);t.after(()=>{root.isConnected=false;for(const [key,value]of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}});
 renderComments({unlocked:true,session:{user:{id:1}},can:()=>false,api:async()=>({items:rows,hasMore:false,total:rows.length})},1,root,{onPaint(){card={dataset:{message:'7'},querySelector:()=>input,focus(){doc.activeElement=this;}};input={disabled:false,closest:selector=>selector==='[data-message]'?card:{},matches:selector=>selector==='input.switch-input',focus(){doc.activeElement=this;}};}});
 await new Promise(setImmediate);doc.activeElement=input;rows=[original,{...original,id:8,text:'A teammate replied'}];await timers.shift()();assert.equal(doc.activeElement,input,'remote changes must retain the visibility switch focus');
});
