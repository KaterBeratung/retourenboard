import test from 'node:test';
import assert from 'node:assert/strict';
const timeline=await import('../dist/public/return-timeline.js').catch(()=>({}));
test('timeline markup retains event order and escapes opaque people, comments and filenames',()=>{
 assert.equal(typeof timeline.renderTimelineItems,'function');
 const markup=String(timeline.renderTimelineItems([{id:'comment:1',type:'comment',at:'2026-10-12T12:00:00Z',actorName:'<Alex>',text:'<script>no</script>'},{id:'file:1',type:'attachment',at:'2026-10-11T12:00:00Z',actorName:'Max',text:'beleg<1>.pdf'}],{}));
 assert.ok(markup.indexOf('&lt;Alex&gt;')<markup.indexOf('beleg&lt;1&gt;.pdf'));
 assert.match(markup,/&lt;script&gt;no&lt;\/script&gt;/);assert.doesNotMatch(markup,/<script>/);
 assert.match(markup,/datetime="2026-10-12T12:00:00Z"/);
});

function timelineBoundary(t,request){
 const original=globalThis.document,dialog={listeners:{},addEventListener(name,fn){this.listeners[name]=fn;}};
 const nodes=new Map(),node=()=>({hidden:false,disabled:false,innerHTML:'',querySelectorAll:()=>[],prepend(){}});
 const root={isConnected:true,closest:()=>dialog,querySelector:selector=>nodes.get(selector)??nodes.set(selector,node()).get(selector)};
 globalThis.document={activeElement:null};t.after(()=>{root.isConnected=false;if(original===undefined)delete globalThis.document;else globalThis.document=original;});
 timeline.bindReturnTimeline({authGeneration:1,unlocked:true,session:{user:{id:1}},masterdata:{},api:request},{id:1},root);return {root,dialog,nodes};
}
test('timeline activity during a pending read is refreshed after that read instead of being lost',async t=>{
 const requests=[];const f=timelineBoundary(t,()=>new Promise(resolve=>requests.push(resolve)));
 f.dialog.listeners['return-activity-changed']();requests[0]({items:[],nextCursor:null});await new Promise(setImmediate);
 assert.equal(requests.length,2,'a mutation arriving during the first request needs a fresh read');
 requests[1]({items:[{id:'comment:1',type:'comment',at:'2026-10-28T10:00:00Z',actorName:'Person',text:'New comment'}],nextCursor:null});await new Promise(setImmediate);
 assert.match(f.nodes.get('.timeline-content').innerHTML,/New comment/);
});
test('an unchanged timeline refresh retains existing controls and expanded content',async t=>{
 const page={items:[{id:'comment:1',type:'comment',at:'2026-10-28T10:00:00Z',text:'Long comment '.repeat(30)}],nextCursor:null};
 const f=timelineBoundary(t,async()=>page);await new Promise(setImmediate);const content=f.nodes.get('.timeline-content');let writes=0,value=content.innerHTML;
 Object.defineProperty(content,'innerHTML',{get:()=>value,set:next=>{writes++;value=next;}});
 await f.nodes.get('[data-timeline-refresh]').onclick();await new Promise(setImmediate);assert.equal(writes,0,'unchanged results must not reset the expanded row');
});
test('timeline combines parts of the same audit operation without merging unrelated same-time activity',()=>{
 const at='2026-10-28T10:00:00Z',items=[{id:'audit:0000000000000009:status',type:'status',at,actorName:'A',text:'Received → Checking',fromStatus:'Received',toStatus:'Checking'},{id:'audit:0000000000000009:nextStep',type:'nextStep',at,actorName:'A',text:'Test device'},{id:'audit:0000000000000009:assignment',type:'assignment',at,actorName:'A',text:'Person B'},{id:'comment:12',type:'comment',at,actorName:'A',text:'Separate comment'}];
 const markup=String(timeline.renderTimelineItems(items,{}));assert.equal((markup.match(/class="timeline-event(?: |")/g)||[]).length,2);for(const text of ['Received','Checking','Test device','Person B','Separate comment'])assert.ok(markup.includes(text));
});

test('reusing a detail dialog replaces its previous timeline listener',async t=>{
 const old=globalThis.document;globalThis.document={activeElement:null};t.after(()=>{if(old===undefined)delete globalThis.document;else globalThis.document=old;});
 const listeners=new Set(),dialog={open:true,addEventListener(name,fn){listeners.add(fn);},removeEventListener(name,fn){listeners.delete(fn);}};
 const root=()=>({isConnected:true,closest:()=>dialog,querySelector:()=>({querySelectorAll:()=>[],hidden:false,disabled:false,innerHTML:''})});
 const ctx={unlocked:true,session:{user:{id:1}},masterdata:{},api:async()=>({items:[],nextCursor:null})};timeline.bindReturnTimeline(ctx,{id:1},root());timeline.bindReturnTimeline(ctx,{id:2},root());await new Promise(setImmediate);assert.equal(listeners.size,1,'the shared dialog must not retain every previously opened record');
});

test('short multiline timeline text has an expansion control instead of losing its fourth line',()=>{
 const markup=String(timeline.renderTimelineItems([{id:'comment:1',type:'comment',at:'2026-10-28T10:00:00Z',text:'one\ntwo\nthree\nfour'}],{}));assert.match(markup,/timeline-expand/);assert.ok(markup.includes('four'));
});
