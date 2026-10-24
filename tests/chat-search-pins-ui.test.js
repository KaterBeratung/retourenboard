import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceModule} from './helpers/source-module.js';

const {bindChat,renderMessage,setLanguage}=await sourceModule(`
export {bindChat} from './frontend/src/chat.ts';
export {renderMessage} from './frontend/src/collaboration-ui.ts';
export {setLanguage} from './frontend/src/i18n.js';`);
const turn=()=>new Promise(setImmediate),deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const message=(id,text,extra={})=>({id,text,author:{id:2,displayName:'Alice'},createdAt:'2026-10-13T10:00:00Z',mentions:[],canEdit:false,canDelete:false,canPin:true,pinned:false,...extra});
const channel=id=>({id,name:'Gespräch '+id,kind:'public',visibility:'public',members:[],joined:false,canManage:false,pins:[]});

function fixture(t){
  const previous={document:globalThis.document,location:globalThis.location,DOMParser:globalThis.DOMParser,setTimeout:globalThis.setTimeout,FormData:globalThis.FormData},requests=[],timers=[];
  const node=(extra={})=>{const element={isConnected:true,hidden:false,value:'',innerHTML:'',writes:0,disabled:false,dataset:{},attributes:{},setAttribute(name,value){this.attributes[name]=value;},removeAttribute(name){delete this.attributes[name];},querySelector:()=>null,querySelectorAll(selector){
    if(selector==='[data-message-jump]'){this.jumpButtons??=new Map();return [...this.innerHTML.matchAll(/data-message-jump="(\d+)"/g)].map(match=>{const n=match[1];if(!this.jumpButtons.has(n))this.jumpButtons.set(n,node({dataset:{messageJump:n}}));return this.jumpButtons.get(n);});}
    if(selector==='[data-edit-message]'&&f.editButton&&this.innerHTML.includes('data-edit-message'))return [f.editButton];
    if(selector!=='[data-pin-message]')return [];this.pinButtons??=new Map();return [...this.innerHTML.matchAll(/data-pin-message="(\d+)"/g)].map(match=>{const n=match[1];if(!this.pinButtons.has(n))this.pinButtons.set(n,node({dataset:{pinMessage:n}}));return this.pinButtons.get(n);});
  },focus(){this.focused=true;},scrollIntoView(){this.scrolled=true;},addEventListener(name,handler){this[name]=handler;},...extra};let markup=element.innerHTML;Object.defineProperty(element,'innerHTML',{get(){return markup;},set(value){markup=value;this.writes++;},configurable:true});return element;};
  const jumpCard=node(),toggle=node(),panel=node({hidden:true}),input=node(),form=node(),results=node(),status=node(),more=node(),clear=node(),submit=node(),pins=node(),pinList=node(),pinSummary=node(),older=node(),draft=node({value:'Mein ungesendeter Entwurf'});
  const selectors={'[data-chat-search-toggle]':toggle,'#chat-message-search-panel':panel,'#chat-message-search-form':form,'#chat-message-search-input':input,'[data-chat-search-results]':results,'[data-chat-search-status]':status,'[data-chat-search-more]':more,'[data-chat-search-clear]':clear,'[data-chat-search-submit]':submit,'[data-chat-pins]':pins,'[data-chat-pins-list]':pinList,'[data-chat-pins-summary]':pinSummary,'#chat-older':older,'.message-composer':draft};
  form.querySelector=selector=>selectors[selector]??null;
  const plain=markup=>markup.replace(/<!--[\s\S]*?-->|<[^>]*>/g,'');
  const pane=node();let mounts=0;
  Object.defineProperty(pane,'innerHTML',{get(){return this.markup??'';},set(markup){this.markup=markup;mounts++;this.log=node({scrollTop:0,scrollHeight:200,clientHeight:100,querySelector:selector=>selector==='.message-edit'&&f.editing?f.editCard:null});this.heading={markup:markup.split('<section')[0],textContent:plain(markup.split('<form')[0]),set outerHTML(value){this.markup=value;this.textContent=plain(value);}};}});
  pane.querySelector=selector=>selector.startsWith('.chat-message-log [data-message=')?jumpCard:selector==='.chat-message-log'?pane.log:selector==='.chat-conversation-heading'?pane.heading:selectors[selector]??null;
  const list=node(),conversationSearch=node(),workspace=node({closest:()=>null,querySelector:selector=>selector==='.chat-channel-list'?list:pane}),root={querySelector:selector=>selector==='#chat-workspace'?workspace:selector==='#chat-search'?conversationSearch:null};
  const histories=new Map([[1,[message(100,'Aktuell')]], [2,[message(200,'Andere Unterhaltung')]]]),channelOverrides=new Map(),freshChannel=n=>({...channel(n),...channelOverrides.get(n)});
  const ctx={unlocked:true,authGeneration:1,session:{user:{id:1}},can:key=>key==='chatRead',toast(){},api:async(path,options)=>{
    requests.push(path);const intercepted=await f.intercept(path,options);if(intercepted!==undefined)return intercepted;
    if(path==='/api/chat/channels')return [freshChannel(1),freshChannel(2)];
    const match=path.match(/^\/api\/chat\/channels\/(\d+)(.*)$/);assert.ok(match,path);const n=Number(match[1]);
    if(!match[2])return freshChannel(n);if(match[2]==='/pins')return {items:[]};if(match[2]==='/read')return {};
    if(match[2].startsWith('/search'))return {items:[message(1,'Alter Treffer')],hasMore:false,nextBefore:null};
    assert.ok(match[2].startsWith('/messages'),path);return {items:histories.get(n),hasMore:false,total:histories.get(n).length};
  }};
  globalThis.document={visibilityState:'visible',querySelector:()=>null,createElement:()=>node(),activeElement:null};globalThis.location={hash:'#channel-1'};globalThis.DOMParser=class{parseFromString(markup){return {body:{textContent:plain(markup)}};}};globalThis.setTimeout=callback=>{timers.push(callback);return {unref(){}};};
  const f={ctx,pane,jumpCard,toggle,panel,input,form,results,status,more,clear,submit,pins,pinList,pinSummary,draft,requests,histories,channelOverrides,intercept:()=>undefined,get mounts(){return mounts;},poll:async()=>{await timers.shift()();},makeEditor(){
    const textarea=node(),menu=node(),editForm=node({dataset:{unsavedNotice:'hidden'},closest:()=>null}),cancel=node(),picker=node(),save=node(),error=node();
    editForm.querySelector=selector=>selector==='textarea'?textarea:selector==='[type=submit]'?save:selector==='.mention-menu'?menu:selector==='[data-mention-picker]'?picker:error;
    f.editCard=node({classList:{add(){f.editing=true;},remove(){f.editing=false;}},querySelector:selector=>selector==='form'?editForm:cancel});f.editButton=node({dataset:{editMessage:'100'},closest:()=>f.editCard});
    globalThis.FormData=class extends previous.FormData{constructor(){super();this.append('text',textarea.value);}};return {form:editForm,textarea};
  }};
  t.after(()=>{workspace.isConnected=false;for(const [key,value]of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}});
  f.controller=bindChat(ctx,root);return f;
}

test('message search keeps the mounted conversation and composer draft while finding old server results',async t=>{
  const f=fixture(t);await turn();const log=f.pane.log,mounts=f.mounts;
  assert.equal(typeof f.form.onsubmit,'function');f.input.value='Altbestand';await f.form.onsubmit({preventDefault(){}});
  assert.ok(f.requests.includes('/api/chat/channels/1/search?q=Altbestand'));assert.match(f.results.innerHTML,/Alter Treffer/);
  assert.equal(f.pane.log,log);assert.equal(f.mounts,mounts);assert.equal(f.draft.value,'Mein ungesendeter Entwurf');assert.match(log.innerHTML,/Aktuell/);
  f.clear.onclick();assert.equal(f.results.hidden,true);assert.equal(f.draft.value,'Mein ungesendeter Entwurf');
});

test('a search response from an older query or previous conversation cannot overwrite newer results',async t=>{
  const f=fixture(t);await turn();const old=deferred();f.intercept=path=>path.includes('q=erste')?old.promise:path.includes('q=zweite')?{items:[message(2,'Neuer Treffer')],hasMore:false,nextBefore:null}:undefined;
  f.input.value='erste';const pending=f.form.onsubmit({preventDefault(){}});await turn();f.input.value='zweite';await f.form.onsubmit({preventDefault(){}});old.resolve({items:[message(1,'Veralteter Treffer')],hasMore:false,nextBefore:null});await pending;assert.match(f.results.innerHTML,/Neuer Treffer/);assert.doesNotMatch(f.results.innerHTML,/Veralteter Treffer/);
  const switched=deferred();f.intercept=path=>path.includes('q=alt')?switched.promise:undefined;f.input.value='alt';const stale=f.form.onsubmit({preventDefault(){}});await turn();await f.controller.navigate('#channel-2');const latest=f.results.innerHTML;switched.resolve({items:[message(3,'Fremder alter Treffer')],hasMore:false,nextBefore:null});await stale;assert.equal(f.results.innerHTML,latest);
});

test('bounded search pages append results and Escape clears search without touching the draft',async t=>{
  const f=fixture(t);await turn();f.intercept=path=>path.includes('/search?q=paket&before=60')?{items:[message(59,'Älterer Treffer')],hasMore:false,nextBefore:null}:path.includes('/search?q=paket')?{items:[message(60,'Erster Treffer')],hasMore:true,nextBefore:60}:undefined;
  f.input.value='paket';await f.form.onsubmit({preventDefault(){}});assert.equal(f.more.hidden,false);await f.more.onclick();assert.match(f.results.innerHTML,/Erster Treffer/);assert.match(f.results.innerHTML,/Älterer Treffer/);assert.equal(f.more.hidden,true);
  f.input.keydown({key:'Escape',preventDefault(){}});assert.equal(f.results.hidden,true);assert.equal(f.draft.value,'Mein ungesendeter Entwurf');
});

test('a new empty search after clearing cannot expose hits from the previous search',async t=>{
  const f=fixture(t);await turn();f.input.value='alt';await f.form.onsubmit({preventDefault(){}});assert.match(f.results.innerHTML,/Alter Treffer/);f.clear.onclick();
  f.intercept=path=>path.includes('/search?q=leer')?{items:[],hasMore:false,nextBefore:null}:undefined;f.input.value='leer';await f.form.onsubmit({preventDefault(){}});assert.doesNotMatch(f.results.innerHTML,/Alter Treffer/);assert.equal(f.results.hidden,false);assert.match(f.status.textContent,/Keine passenden Nachrichten/);
});

test('an old polling snapshot cannot undo a successful pin and a pin reply cannot alter another conversation',async t=>{
  const f=fixture(t);await turn();const original=message(100,'Aktuell'),snapshot=deferred();
  f.intercept=(path,options)=>path==='/api/chat/channels/1/messages?ids=100'?snapshot.promise:path==='/api/chat/messages/100/pin'&&options.body.pinned?{...original,pinned:true}:undefined;
  const polling=f.poll();await turn();await f.pane.log.querySelectorAll('[data-pin-message]')[0].onclick();assert.match(f.pane.log.innerHTML,/Angeheftet/);assert.match(f.pinList.innerHTML,/Aktuell/);
  snapshot.resolve({items:[original],hasMore:false,total:1});await polling;assert.match(f.pane.log.innerHTML,/Angeheftet/);
  const late=deferred();f.intercept=path=>path==='/api/chat/messages/100/pin'?late.promise:undefined;const unpinning=f.pane.log.querySelectorAll('[data-pin-message]')[0].onclick();await turn();await f.controller.navigate('#channel-2');const log=f.pane.log.innerHTML;late.resolve({...original,pinned:false});await unpinning;assert.equal(f.pane.log.innerHTML,log);assert.match(log,/Andere Unterhaltung/);
});

test('late search replies are ignored after closing search or changing authentication',async t=>{
  const f=fixture(t);await turn();let pending=deferred();f.intercept=path=>path.includes('/search')?pending.promise:undefined;
  f.input.value='alt';const closing=f.form.onsubmit({preventDefault(){}});await turn();f.clear.onclick();pending.resolve({items:[message(1,'Verspätete Antwort')],hasMore:false,nextBefore:null});await closing;assert.equal(f.results.hidden,true);assert.doesNotMatch(f.results.innerHTML,/Verspätete Antwort/);
  pending=deferred();f.input.value='alt';const signingOut=f.form.onsubmit({preventDefault(){}});await turn();f.ctx.authGeneration++;pending.resolve({items:[message(1,'Alte Anmeldung')],hasMore:false,nextBefore:null});await signingOut;assert.doesNotMatch(f.results.innerHTML,/Alte Anmeldung/);assert.equal(f.draft.value,'Mein ungesendeter Entwurf');
});

test('saving unchanged text on an already edited message closes its mounted editor',async t=>{
  const f=fixture(t),editor=f.makeEditor(),original=message(100,'Aktuell',{author:{id:1,displayName:'Owner'},canEdit:true,editedAt:'2026-10-13T10:01:00Z'});f.histories.set(1,[original]);await turn();const log=f.pane.log,writes=log.writes;
  f.intercept=(path,options)=>{if(path==='/api/chat/messages/100'&&options.method==='PUT'){const saved={...original,editedAt:'2026-10-13T10:02:00Z'};f.histories.set(1,[saved]);return saved;}};
  f.editButton.onclick();assert.equal(editor.textarea.value,'Aktuell');await editor.form.onsubmit({preventDefault(){}});assert.ok(log.writes>writes,'The saved message must replace the editor even when its rendered text and edited label are unchanged');
});

test('polling refreshes deletions in search pages beyond the first snapshot batch',async t=>{
  const f=fixture(t),hits=Array.from({length:201},(_,n)=>message(500-n,'Treffer '+(500-n)));let removed=false;await turn();
  f.intercept=path=>{if(path.includes('/search?q=treffer')){const params=new URLSearchParams(path.split('?')[1]),before=Number(params.get('before')??501),older=hits.filter(row=>row.id<before),items=older.slice(0,50);return {items,hasMore:older.length>50,nextBefore:older.length>50?items.at(-1).id:null};}
    if(path.includes('/messages?ids=')){const ids=path.split('ids=')[1].split(',').map(Number),items=ids.map(id=>hits.find(row=>row.id===id)??f.histories.get(1).find(row=>row.id===id)).filter(Boolean).map(row=>removed&&row.id===300?{...row,text:'',deleted:true,canPin:false}:row);return {items,total:202,hasMore:false};}};
  f.input.value='treffer';await f.form.onsubmit({preventDefault(){}});for(let n=0;n<4;n++)await f.more.onclick();assert.equal(f.results.innerHTML.includes('Treffer 300'),true);removed=true;await f.poll();assert.equal(f.results.innerHTML.includes('Treffer 300'),false);
});

test('pin controls follow server permissions and never appear on deleted message cards',()=>{
  const out=renderMessage(message(1,'Entscheidung',{pinned:true}),1);assert.match(out,/data-pin-message="1"/);assert.match(out,/aria-pressed="true"/);assert.match(out,/Anheftung lösen/);
  assert.doesNotMatch(renderMessage(message(2,'Nur lesen',{canPin:false}),1),/data-pin-message/);
  assert.doesNotMatch(renderMessage(message(3,'Gelöscht',{deleted:true,pinned:true}),1),/data-pin-message|Angeheftet|Gelöscht/);
});

test('new message search and pin actions have English labels',()=>{
  setLanguage('en');try{const out=renderMessage(message(1,'User text'),1);assert.match(out,/Pin message/);assert.doesNotMatch(out,/>Nachricht anheften</);}finally{setLanguage('de');}
});


test('the header magnifier reveals search without replacing the conversation or draft',async t=>{
  const f=fixture(t);await turn();const log=f.pane.log,mounts=f.mounts;
  assert.match(f.pane.innerHTML,/data-chat-search-toggle/);
  assert.doesNotMatch(f.pane.innerHTML,/<details class="chat-message-search"/);
  assert.equal(f.panel.hidden,true);assert.equal(f.toggle.attributes['aria-expanded'],'false');
  assert.equal(typeof f.toggle.click,'function');f.toggle.click();
  assert.equal(f.panel.hidden,false);assert.equal(f.input.focused,true);
  assert.equal(f.toggle.attributes['aria-expanded'],'true');
  assert.equal(f.pane.log,log);assert.equal(f.mounts,mounts);
  assert.equal(f.draft.value,'Mein ungesendeter Entwurf');
  assert.equal(f.requests.some(path=>path.includes('/search?')),false);
  f.input.keydown({key:'Escape',preventDefault(){}});
  assert.equal(f.panel.hidden,true);assert.equal(f.toggle.focused,true);
  assert.equal(f.toggle.attributes['aria-expanded'],'false');
});

test('closing the magnifier invalidates a pending search and preserves composer text',async t=>{
  const f=fixture(t);await turn();f.toggle.click();
  const pending=deferred();f.intercept=path=>path.includes('/search')?pending.promise:undefined;
  f.input.value='alt';const search=f.form.onsubmit({preventDefault(){}});await turn();
  f.toggle.click();assert.equal(f.panel.hidden,true);assert.equal(f.input.value,'');
  pending.resolve({items:[message(1,'Veralteter Treffer')],hasMore:false,nextBefore:null});await search;
  assert.equal(f.results.hidden,true);assert.doesNotMatch(f.results.innerHTML,/Veralteter Treffer/);
  assert.equal(f.draft.value,'Mein ungesendeter Entwurf');
  f.toggle.click();f.input.value='';await f.form.onsubmit({preventDefault(){}});
  assert.equal(f.panel.hidden,false,'An empty search clears results without dismissing the input');
});

test('magnifier and close controls keep English accessible names',async t=>{
  const previousDocument=globalThis.document;setLanguage('en');try{const f=fixture(t);await turn();assert.match(f.pane.innerHTML,/aria-label="Search messages"/);assert.match(f.pane.innerHTML,/aria-label="Close search"/);}finally{globalThis.document=previousDocument;setLanguage('de');}
});


test('header polling reconciles icon-only management rights without dismissing search',async t=>{
 const f=fixture(t);await turn();f.toggle.click();const log=f.pane.log,mounts=f.mounts;
 f.channelOverrides.set(1,{canManage:true});await f.poll();
 assert.match(f.pane.heading.markup,/id="chat-manage"/);
 assert.equal(f.panel.hidden,false);assert.equal(f.toggle.attributes['aria-expanded'],'true');
 f.channelOverrides.set(1,{canManage:false});await f.poll();
 assert.doesNotMatch(f.pane.heading.markup,/id="chat-manage"/);
 assert.equal(f.panel.hidden,false);assert.equal(f.pane.log,log);assert.equal(f.mounts,mounts);
 assert.equal(f.draft.value,'Mein ungesendeter Entwurf');
});


test('a search-result jump reveals the original history before scrolling to its message',async t=>{
 const f=fixture(t);await turn();f.toggle.click();const log=f.pane.log,mounts=f.mounts;
 f.intercept=path=>path.includes('/search')?{items:[message(100,'Aktuell')],hasMore:false,nextBefore:null}:undefined;
 f.input.value='aktuell';await f.form.onsubmit({preventDefault(){}});
 f.results.querySelectorAll('[data-message-jump]')[0].onclick();await turn();
 assert.equal(f.panel.hidden,true);assert.equal(f.results.hidden,true);
 assert.equal(f.jumpCard.scrolled,true);assert.equal(f.jumpCard.focused,true);
 assert.equal(f.pane.log,log);assert.equal(f.mounts,mounts);assert.equal(f.draft.value,'Mein ungesendeter Entwurf');
});
