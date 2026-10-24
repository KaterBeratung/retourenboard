import test from 'node:test';
import assert from 'node:assert/strict';
const ui=await import('../dist/public/collaboration-ui.js').catch(()=>({}));
test('mention rendering escapes user content and highlights only known, complete handles',()=>{
  assert.equal(typeof ui.renderMentionText,'function');
  const out=ui.renderMentionText('<script> @Max @Maxwell email@Max.com',[{id:1,username:'Max'}]);
  assert.ok(!out.includes('<script>'));assert.ok(out.includes('&lt;script&gt;'));assert.equal((out.match(/class="mention"/g)||[]).length,1);
});
test('send flow blocks duplicate submits and preserves text typed while a message was being saved',async()=>{
  assert.equal(typeof ui.createSendFlow,'function');
  let value='Erste Nachricht',cleared=0,finish;
  const flow=ui.createSendFlow({getText:()=>value,clear:()=>{value='';cleared++;},post:()=>new Promise(resolve=>finish=resolve)});
  const pending=flow.send();await assert.rejects(flow.send(),/bereits/);value='Nächster Entwurf';flow.changed();finish({id:1});await pending;assert.equal(value,'Nächster Entwurf');assert.equal(cleared,0);assert.equal(flow.busy,false);
});
test('successful sends clear only the submitted draft and failures remain retryable',async()=>{
  assert.equal(typeof ui.createSendFlow,'function');let value='Nachricht',fails=true;
  const flow=ui.createSendFlow({getText:()=>value,clear:()=>value='',post:async()=>{if(fails)throw Error('offline');return {id:1};}});
  await assert.rejects(flow.send(),/offline/);assert.equal(value,'Nachricht');fails=false;await flow.send();assert.equal(value,'');
});
test('message cards hide deleted content and safely render author names and mention tokens',()=>{
  assert.equal(typeof ui.renderMessage,'function');
  const out=ui.renderMessage({id:1,author:{displayName:'<img>',id:2,username:'Max'},deleted:true,text:'Private secret',mentions:[],createdAt:'2026-10-07T08:00:00Z',canEdit:false,canDelete:false},2);
  assert.ok(!out.includes('Private secret'));assert.ok(!out.includes('<img>'));assert.ok(out.includes('Nachricht gelöscht'));
});
test('polling fills multi-page backlogs and refreshes edits/deletes outside the newest page',async()=>{
  assert.equal(typeof ui.syncMessageHistory,'function');
  const old=Array.from({length:50},(_,i)=>({id:i+1,text:'old'})),seen=[];
  const result=await ui.syncMessageHistory({rows:old,hasMore:false,api:async query=>{
    seen.push(query);const params=new URLSearchParams(query.slice(1));
    if(params.has('ids'))return {items:old.map(r=>r.id===20?{...r,deleted:true,text:''}:r),total:110};
    const after=Number(params.get('after')),ids=after===50?Array.from({length:50},(_,i)=>i+51):Array.from({length:10},(_,i)=>i+101);
    return {items:ids.map(id=>({id,text:'new'})),hasMore:after===50,total:110};
  }});
  assert.equal(result.items.length,110);assert.equal(result.items.find(r=>r.id===20).deleted,true);assert.deepEqual(result.items.map(r=>r.id),Array.from({length:110},(_,i)=>i+1));assert.ok(seen.some(s=>s==='?after=100'));
});

test('local echoed messages cannot skip an unseen message between the last remote cursor and the echo',async()=>{
  const requests=[],rows=[{id:100,text:'Bekannt'},{id:102,text:'Eigene neue Nachricht'}];
  const result=await ui.syncMessageHistory({rows,initialized:true,hasMore:false,after:100,api:async query=>{
    requests.push(query);const params=new URLSearchParams(query.slice(1));
    return {items:params.has('ids')?rows:102>Number(params.get('after'))?[{id:101,text:'Gleichzeitige Nachricht'},{id:102,text:'Eigene neue Nachricht'}]:[],total:3,hasMore:false};
  }});
  assert.equal(requests[0],'?after=100');assert.deepEqual(result.items.map(row=>row.id),[100,101,102]);
});
test('chat polling recovers from outages and ignores navigation awaiting a discard decision',async t=>{
  const {bindChat}=await import('../dist/public/chat.js'),scheduled=[],previous={document:globalThis.document,location:globalThis.location,DOMParser:globalThis.DOMParser,setTimeout:globalThis.setTimeout};
  const channel={id:1,name:'Teamchat',kind:'public',visibility:'public',members:[],joined:false,canManage:false,unread:0},log={innerHTML:'',scrollHeight:100,scrollTop:0,clientHeight:100,querySelector:()=>null,querySelectorAll:()=>[]},older={hidden:true,addEventListener(){}},heading={textContent:'heading'},banner={dataset:{},setAttribute(){},remove(){}};
  const pane={innerHTML:'',setAttribute(){},removeAttribute(){},querySelector:s=>s==='.chat-message-log'?log:s==='#chat-older'?older:s==='.chat-conversation-heading'?heading:s==='[data-chat-error]'?banner:null,prepend(){}};
  const list={innerHTML:''},search={value:''},workspace={isConnected:true,setAttribute(){},addEventListener(){},closest:()=>null,querySelector:s=>s==='.chat-channel-list'?list:pane},root={querySelector:s=>s==='#chat-workspace'?workspace:s==='#chat-search'?search:null};
  let failList=false,failMessages=false,opens=0,loads=0;
  let pendingDiscard=false;globalThis.document={visibilityState:'visible',createElement:()=>banner,querySelector:()=>pendingDiscard?{}:null};globalThis.location={hash:'#channel-1'};globalThis.DOMParser=class{parseFromString(){return {body:{textContent:'heading'}};}};globalThis.setTimeout=fn=>{scheduled.push(fn);return scheduled.length;};
  t.after(()=>{workspace.isConnected=false;for(const [key,value]of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}});
  const controller=bindChat({unlocked:true,can:key=>key==='chatRead',session:{user:{id:1}},api:async path=>{if(path==='/api/chat/channels'){if(failList)throw Error('offline');return [channel,{...channel,id:2,name:'Zweiter Chat'}];}if(path==='/api/chat/channels/1'||path==='/api/chat/channels/2'){opens++;return path.endsWith('/2')?{...channel,id:2,name:'Zweiter Chat'}:channel;}if(path.includes('/messages')){loads++;if(failMessages)throw Error('offline');return {items:[],hasMore:false,total:0};}throw Error('Unexpected '+path);}},root);
  await new Promise(setImmediate);const preserved=pane.innerHTML;assert.equal(opens,1);
  failList=true;await scheduled.shift()();assert.equal(pane.innerHTML,preserved);failList=false;
  globalThis.location.hash='#channel-2';await scheduled.shift()();assert.equal(opens,1,'Pending hash must not replace the conversation');assert.ok(loads>=2);
  failMessages=true;await scheduled.shift()();assert.equal(pane.innerHTML,preserved);failMessages=false;await scheduled.shift()();assert.equal(pane.innerHTML,preserved);assert.ok(loads>=4);
  pendingDiscard=true;const pendingList=list.innerHTML;channel.name='Changed while deciding';await scheduled.shift()();assert.equal(list.innerHTML,pendingList,'The clicked navigation link must survive the discard decision');pendingDiscard=false;await scheduled.shift()();assert.match(list.innerHTML,/Changed while deciding/);
  assert.equal(typeof controller?.navigate,'function','Accepted conversation navigation must reuse the mounted chat');
  await controller.navigate('#channel-2');assert.equal(opens,2);assert.match(pane.innerHTML,/Zweiter Chat/);
  const secondPane=pane.innerHTML;await scheduled.shift()();assert.equal(opens,2,'Polling must not reopen the old initial channel');
  await controller.navigate('#channel-2');assert.equal(opens,2);assert.equal(pane.innerHTML,secondPane,'Clicking the selected conversation must preserve its composer');
});
