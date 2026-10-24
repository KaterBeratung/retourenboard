import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceModule} from './helpers/source-module.js';
const {bindChat}=await sourceModule("export {bindChat} from './frontend/src/chat.ts';");

const turn=()=>new Promise(setImmediate);
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const channel=id=>({id,name:'Gespräch '+id,kind:'public',visibility:'public',members:[],joined:false,canManage:false,unread:0});
const message=(id,text)=>({id,text,author:{id:2,displayName:'Testperson'},createdAt:'2026-10-12T08:00:00Z',mentions:[],canEdit:false,canDelete:false});

test('mobile directory polling preserves the mounted conversation without marking hidden new messages read',async t=>{
 const f=fixture(t);await turn();globalThis.matchMedia=()=>({matches:true});
 const log=f.pane.log,mounts=f.writes.length,reads=()=>f.requests.filter(path=>path.endsWith('/read')).length;
 const click=kind=>f.workspace.handlers.click({target:{closest:selector=>selector===`[data-chat-${kind}]`?{}:null}});
 click('back');const previousReads=reads();f.histories.set(1,[message(1,'Erster Verlauf'),message(2,'Neue Nachricht')]);await f.poll();
 assert.equal(reads(),previousReads);assert.equal(f.pane.log,log);assert.equal(f.writes.length,mounts);
 assert.doesNotMatch(log.innerHTML,/Neue Nachricht/,'Hidden geometry must not be used for repainting');
 click('resume');await f.poll();assert.ok(reads()>previousReads);assert.equal(f.pane.log,log);
 assert.match(log.innerHTML,/Neue Nachricht/);
});

test('a late conversation load respects a newer mobile back action',async t=>{
 const f=fixture(t);await turn();globalThis.matchMedia=()=>({matches:true});const history=deferred();
 f.intercept=path=>path==='/api/chat/channels/2/messages'?history.promise:undefined;
 const switching=f.controller.navigate('#channel-2');await turn();
 f.workspace.handlers.click({target:{closest:selector=>selector==='[data-chat-back]'?{}:null}});
 assert.equal(f.workspace.attrs['data-chat-pane'],'list');
 history.resolve({items:[message(2,'Zweiter Verlauf')],hasMore:false,total:1});await switching;
 assert.equal(f.workspace.attrs['data-chat-pane'],'list','Loading must not undo the newer directory choice');
 f.workspace.handlers.click({target:{closest:selector=>selector==='[data-chat-resume]'?{}:null}});
 assert.equal(f.workspace.attrs['data-chat-pane'],'conversation');assert.match(f.pane.log.innerHTML,/Zweiter Verlauf/);
});

// Model the browser boundary that exposed this regression: SVG serialization
// expands self-closing shapes, and replacing innerHTML removes focused links.
function channelListDOM(doc){
 let markup='',links=[];
 const list={writes:0,contains:node=>links.includes(node),
  get innerHTML(){return markup;},set innerHTML(value){
   if(list.contains(doc.activeElement))doc.activeElement=doc.body;
   for(const link of links)link.isConnected=false;
   markup=value.replace(/<(path|circle)(\b[^>]*)\/>/g,'<$1$2></$1>');this.writes++;
   links=[...markup.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>[\s\S]*?<\/a>/g)].map(match=>({
    isConnected:true,innerHTML:match[0],getAttribute:name=>name==='href'?match[1]:null,
    closest:()=>null,focus(){if(this.isConnected)doc.activeElement=this;}
   }));for(const link of links)link.closest=()=>link;
  },
  querySelector(selector){return links.find(link=>link.getAttribute('href')===selector.match(/href="([^"]+)"/)?.[1])??null;},
  querySelectorAll(){return links;}
 };
 return list;
}

function fixture(t){
 const previous={document:globalThis.document,location:globalThis.location,DOMParser:globalThis.DOMParser,setTimeout:globalThis.setTimeout,confirm:globalThis.confirm,matchMedia:globalThis.matchMedia},timers=[],requests=[],writes=[],channelOverrides=new Map(),deleteButton={isConnected:true,dataset:{deleteMessage:'1'}};
 const doc={body:{},activeElement:null,visibilityState:'visible',querySelector:()=>null,createElement:()=>({dataset:{},setAttribute(){},remove(){}})};doc.activeElement=doc.body;
 const plain=markup=>markup.replace(/<!--[\s\S]*?-->|<[^>]*>/g,'');
 const pane={value:'',inert:false,attrs:{},log:null,heading:null,
  set innerHTML(markup){this.value=markup;writes.push(markup);this.log=markup.includes('class="chat-message-log"')?{isConnected:true,value:'',writes:0,scrollHeight:200,scrollTop:0,clientHeight:100,querySelector:()=>null,querySelectorAll(selector){return selector==='[data-delete-message]'&&this.value.includes('data-delete-message="1"')?[deleteButton]:[];},get innerHTML(){return this.value;},set innerHTML(value){this.value=value;this.writes++;}}:null;this.heading={textContent:plain(markup.split('<button class="btn secondary small" id="chat-older"')[0]),set outerHTML(value){this.textContent=plain(value);}};},
  get innerHTML(){return this.value;},setAttribute(name,value){this.attrs[name]=value;},removeAttribute(name){delete this.attrs[name];},
  querySelector(selector){return selector==='.chat-message-log'?this.log:selector==='#chat-older'?older:selector==='.chat-conversation-heading'?this.heading:selector==='#chat-join'&&this.value.includes('id="chat-join"')?join:null;},prepend(node){this.banner=node;}
 };
 const older={hidden:true,addEventListener(){}},join={addEventListener(name,callback){this[name]=callback;}},list=channelListDOM(doc),search={value:''},workspace={isConnected:true,attrs:{},handlers:{},setAttribute(name,value){this.attrs[name]=value;},addEventListener(name,fn){this.handlers[name]=fn;},closest:()=>null,querySelector:selector=>selector==='.chat-channel-list'?list:pane},root={querySelector:selector=>selector==='#chat-workspace'?workspace:selector==='#chat-search'?search:null};
 const histories=new Map([[1,[message(1,'Erster Verlauf')]],[2,[message(2,'Zweiter Verlauf')]],[3,[message(3,'Dritter Verlauf')]]]);
 const ctx={unlocked:true,session:{user:{id:1}},can:key=>key==='chatRead',api:async(path,options)=>{
  requests.push(path);const intercepted=await f.intercept(path,options);if(intercepted!==undefined)return intercepted;
  if(path==='/api/chat/channels')return [1,2,3].map(id=>channelOverrides.get(id)??channel(id));
  const match=path.match(/^\/api\/chat\/channels\/(\d+)(.*)$/);assert.ok(match,path);const id=Number(match[1]);
  if(!match[2])return channelOverrides.get(id)??channel(id);if(match[2].startsWith('/read'))return {};
  assert.ok(match[2].startsWith('/messages'));return {items:histories.get(id),hasMore:false,total:histories.get(id).length};
 }};
 globalThis.document=doc;globalThis.location={hash:'#channel-1'};globalThis.DOMParser=class{parseFromString(markup){return {body:{textContent:plain(markup)}};}};globalThis.setTimeout=callback=>{timers.push(callback);return {unref(){}};};globalThis.confirm=()=>true;
 const f={workspace,pane,writes,requests,histories,ctx,join,deleteButton,channelOverrides,doc,list,search,link:id=>list.querySelector(`.chat-channel[href="/chat#channel-${id}"]`),intercept:()=>undefined,poll:async()=>{assert.ok(timers.length);await timers.shift()();}};
 t.after(()=>{workspace.isConnected=false;for(const [key,value]of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}});
 f.controller=bindChat(ctx,root);return f;
}

test('chat switches keep the mounted conversation until both target metadata and history are ready',async t=>{
 const f=fixture(t);await turn();const original=f.pane.innerHTML,originalLog=f.pane.log,count=f.writes.length,metadata=deferred(),history=deferred();
 f.intercept=path=>path==='/api/chat/channels/2'?metadata.promise:path==='/api/chat/channels/2/messages'?history.promise:undefined;
 const switching=f.controller.navigate('#channel-2');await turn();
 assert.equal(f.pane.innerHTML,original,'Switching must not flash a skeleton');assert.equal(f.pane.log,originalLog);assert.equal(f.pane.inert,true);
 metadata.resolve(channel(2));await turn();assert.equal(f.pane.innerHTML,original,'The new composer must wait for its history');
 history.resolve({items:[message(2,'Zweiter Verlauf')],hasMore:false,total:1});await switching;
 assert.equal(f.writes.length,count+1,'The complete target is mounted once');assert.match(f.pane.innerHTML,/Gespräch 2/);assert.match(f.pane.log.innerHTML,/Zweiter Verlauf/);assert.equal(f.pane.inert,false);assert.notEqual(f.pane.attrs['aria-busy'],'true');
});

test('unchanged chat polling retains message nodes and changed messages are still refreshed',async t=>{
 const f=fixture(t);await turn();const log=f.pane.log,count=log.writes;
 await f.poll();assert.equal(f.pane.log,log);assert.equal(log.writes,count,'No replacement of images, selection or focused message controls for identical history');
 f.histories.set(1,[message(1,'Bearbeitete Nachricht')]);await f.poll();assert.equal(log.writes,count+1);assert.match(log.innerHTML,/Bearbeitete Nachricht/);
 f.histories.set(1,[{...message(1,'Geheimer alter Text'),deleted:true}]);await f.poll();assert.match(log.innerHTML,/Nachricht gelöscht/);assert.doesNotMatch(log.innerHTML,/Geheimer alter Text/);
});

test('unchanged chat polls retain focused conversation links despite browser-normalized SVG markup',async t=>{
 const f=fixture(t);await turn();const link=f.link(2),writes=f.list.writes;link.focus();
 assert.match(f.list.innerHTML,/<circle[^>]*><\/circle>/,'The DOM boundary serializes SVG like a browser');
 await f.poll();await f.poll();
 assert.equal(link.isConnected,true,'Identical channel responses must retain the original link');
 assert.equal(f.link(2),link);assert.equal(f.doc.activeElement,link);assert.equal(f.list.writes,writes);
});

test('changed chat metadata refreshes the list and preserves focus on the same conversation',async t=>{
 const f=fixture(t);await turn();const original=f.link(2),log=f.pane.log;original.focus();
 f.channelOverrides.set(2,{...channel(2),name:'Versandteam',kind:'group',visibility:'private',joined:true,unread:4,lastMessage:{text:'Neue Rückfrage'}});
 await f.poll();
 assert.notEqual(f.link(2),original);assert.equal(f.doc.activeElement,f.link(2),'Focus follows the conversation identity when its label or unread count changes');
 assert.match(f.link(2).innerHTML,/Versandteam/);assert.match(f.link(2).innerHTML,/Geschlossene Gruppe/);assert.match(f.link(2).innerHTML,/>4<\/span>/);assert.match(f.link(2).innerHTML,/Neue Rückfrage/);assert.equal(f.pane.log,log);
 await f.controller.navigate('#channel-2');
 assert.equal(f.doc.activeElement,f.link(2));assert.match(f.link(2).innerHTML,/aria-current="page"/);
});

test('conversation filtering still updates results without taking focus from the search input',async t=>{
 const f=fixture(t);await turn();f.doc.activeElement=f.search;f.search.value='Gespräch 2';f.search.oninput();
 assert.equal(f.list.querySelectorAll().length,1);assert.ok(f.link(2));assert.equal(f.link(1),null);assert.equal(f.doc.activeElement,f.search);
 const link=f.link(2);await f.poll();assert.equal(f.link(2),link);
 f.search.value='nicht vorhanden';f.search.oninput();assert.equal(f.list.querySelectorAll().length,0);assert.match(f.list.innerHTML,/Keine passende Unterhaltung/);assert.equal(f.doc.activeElement,f.search);
 f.search.value='';f.search.oninput();assert.equal(f.list.querySelectorAll().length,3);assert.equal(f.doc.activeElement,f.search);
});

test('a removed focused conversation does not move focus to an unrelated list entry',async t=>{
 const f=fixture(t);await turn();const removed=f.link(2);removed.focus();f.intercept=path=>path==='/api/chat/channels'?[channel(1),channel(3)]:undefined;
 await f.poll();assert.equal(f.link(2),null);assert.equal(removed.isConnected,false);assert.equal(f.doc.activeElement,f.doc.body);
});

test('a discard decision defers changed channel markup until the list can safely update',async t=>{
 const f=fixture(t);await turn();const link=f.link(2);link.focus();f.doc.querySelector=()=>({});f.channelOverrides.set(2,{...channel(2),name:'Geändert während Rückfrage'});
 await f.poll();assert.equal(f.link(2),link);assert.equal(f.doc.activeElement,link);assert.doesNotMatch(f.list.innerHTML,/Geändert während Rückfrage/);
 f.doc.querySelector=()=>null;await f.poll();assert.match(f.list.innerHTML,/Geändert während Rückfrage/);assert.equal(f.doc.activeElement,f.link(2));
});

test('a late channel response cannot repaint or take focus after the account changes',async t=>{
 const f=fixture(t);await turn();const link=f.link(2),late=deferred();link.focus();f.intercept=path=>path==='/api/chat/channels'?late.promise:undefined;
 const polling=f.poll();await turn();f.ctx.authGeneration=1;late.resolve([channel(1),{...channel(2),name:'Daten vom alten Konto'}]);await polling;
 assert.equal(f.link(2),link);assert.equal(f.doc.activeElement,link);assert.doesNotMatch(f.list.innerHTML,/Daten vom alten Konto/);
});

test('an empty channel list can replace a temporary polling error with its empty state',async t=>{
 const f=fixture(t);await turn();f.intercept=path=>path==='/api/chat/channels'?[]:undefined;await f.poll();assert.match(f.list.innerHTML,/Keine passende Unterhaltung/);
 f.intercept=path=>path==='/api/chat/channels'?Promise.reject(Error('Offline beim Laden')):undefined;await f.poll();assert.match(f.list.innerHTML,/Offline beim Laden/);
 f.intercept=path=>path==='/api/chat/channels'?[]:undefined;await f.poll();assert.match(f.list.innerHTML,/Keine passende Unterhaltung/);assert.doesNotMatch(f.list.innerHTML,/Offline beim Laden/);
});

test('a pending old poll cannot prevent a new conversation from loading its own messages',async t=>{
 const f=fixture(t);await turn();const oldPoll=deferred();f.intercept=path=>path==='/api/chat/channels/1/messages?after=1'?oldPoll.promise:undefined;
 const polling=f.poll();await turn();await f.controller.navigate('#channel-2');
 assert.match(f.pane.log.innerHTML,/Zweiter Verlauf/,'An old request must not leave the newly selected chat empty');
 oldPoll.resolve({items:[message(10,'Verspätete alte Nachricht')],hasMore:false,total:2});await polling;assert.doesNotMatch(f.pane.log.innerHTML,/Verspätete alte Nachricht/);
});

test('rapid chat switching ignores late metadata and history from superseded selections',async t=>{
 const f=fixture(t);await turn();const late=deferred();f.intercept=path=>path==='/api/chat/channels/2/messages'?late.promise:undefined;
 const second=f.controller.navigate('#channel-2');await turn();await f.controller.navigate('#channel-3');const mounted=f.pane.innerHTML;
 late.resolve({items:[message(20,'Überholter Verlauf')],hasMore:false,total:1});await second;
 assert.equal(f.pane.innerHTML,mounted);assert.match(f.pane.log.innerHTML,/Dritter Verlauf/);assert.doesNotMatch(f.pane.log.innerHTML,/Überholter Verlauf/);assert.equal(f.pane.inert,false);
});

test('a slow read acknowledgement does not keep an already loaded conversation disabled',async t=>{
 const f=fixture(t);await turn();const acknowledgement=deferred();f.intercept=path=>path==='/api/chat/channels/2/read'?acknowledgement.promise:undefined;
 const switching=f.controller.navigate('#channel-2');await turn();
 try{assert.match(f.pane.log.innerHTML,/Zweiter Verlauf/);assert.equal(f.pane.inert,false,'Only loading the conversation itself should block its composer');}
 finally{acknowledgement.resolve({});await switching;}
});

test('failed chat switches release the busy state and background retry can recover',async t=>{
 const f=fixture(t);await turn();f.intercept=path=>path==='/api/chat/channels/2/messages'?Promise.reject(Error('Verbindung offline')):undefined;
 await f.controller.navigate('#channel-2');assert.equal(f.pane.inert,false);assert.notEqual(f.pane.attrs['aria-busy'],'true');assert.match(f.pane.innerHTML,/offline/);
 f.intercept=()=>undefined;await f.poll();assert.match(f.pane.innerHTML,/Gespräch 2/);assert.match(f.pane.log.innerHTML,/Zweiter Verlauf/);
});

test('a late group-join list refresh cannot overwrite a subsequently selected conversation',async t=>{
 const f=fixture(t);f.channelOverrides.set(1,{...channel(1),kind:'group',ownerId:2});await turn();const late=deferred();
 f.intercept=path=>path==='/api/chat/channels/1/join'?{...channel(1),kind:'group',joined:true,ownerId:2}:path==='/api/chat/channels'?late.promise:undefined;
 f.join.click();await turn();await f.controller.navigate('#channel-2');
 late.resolve([{...channel(1),kind:'group',joined:true,ownerId:2},channel(2),channel(3)]);await turn();
 assert.match(f.pane.heading.textContent,/Gespräch 2/,'The old membership action must not replace the current header');assert.match(f.pane.log.innerHTML,/Zweiter Verlauf/);
});

test('an old polling response cannot resurrect a successfully deleted chat message',async t=>{
 const f=fixture(t),original={...message(1,'Original vor Löschung'),canDelete:true};f.histories.set(1,[original]);await turn();const oldIds=deferred();
 f.intercept=(path,options)=>path==='/api/chat/channels/1/messages?ids=1'?oldIds.promise:path==='/api/chat/messages/1'&&options.method==='DELETE'?{...original,text:'',deleted:true,canDelete:false}:undefined;
 const polling=f.poll();await turn();await f.deleteButton.onclick();assert.match(f.pane.log.innerHTML,/Nachricht gelöscht/);
 oldIds.resolve({items:[original],hasMore:false,total:1});await polling;
 assert.match(f.pane.log.innerHTML,/Nachricht gelöscht/);assert.doesNotMatch(f.pane.log.innerHTML,/Original vor Löschung/);
});
