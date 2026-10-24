import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceModule} from './helpers/source-module.js';
import {refreshNotifications} from '../dist/public/notifications.js';
const ui={...await sourceModule("export * from './frontend/src/ui.ts';export * from './frontend/src/design.ts';export * from './frontend/src/sidebar-navigation.ts';"),refreshNotifications};

function notificationBoundary(t){
 const original=globalThis.document;let button;
 const leaf=text=>({_text:text,hidden:false,get textContent(){return this._text;},set textContent(value){this._text=String(value);},setAttribute(){},removeAttribute(){}});
 const root={prepend(node){button=node;node.isConnected=true;}};
 globalThis.document={querySelector:selector=>selector==='#inbox-button'?button:selector==='.topbar-right'?root:null,createElement(){
  const node={hidden:false,dataset:{},attributes:new Map(),writes:0,get innerHTML(){return this.source??'';},set innerHTML(value){
   this.source=String(value);this.writes++;this.artwork={};this.label=leaf('Nachrichten');const count=this.source.match(/class="inbox-count"[^>]*>([^<]*)/);this.count=count?leaf(count[1]):null;if(this.count)this.count.hidden=/class="inbox-count"[^>]*\bhidden/.test(this.source);
  },setAttribute(name,value){this.attributes.set(name,String(value));},getAttribute(name){return this.attributes.get(name)??null;},querySelector(selector){return selector==='.inbox-count'?this.count:selector==='.inbox-button-label'?this.label:null;}};return node;
 }};
 t.after(()=>{if(original===undefined)delete globalThis.document;else globalThis.document=original;});
 const ctx={unlocked:true,authGeneration:1,session:{user:{id:1},csrfToken:'synthetic'},api:async()=>({unread:7})};
 return {ctx,get button(){return button;}};
}
const deferred=()=>{let resolve,reject;const promise=new Promise((ok,fail)=>{resolve=ok;reject=fail;});return {promise,resolve,reject};};

test('polling keeps the previous unread count visible while its response is pending',async t=>{
 const f=notificationBoundary(t);await ui.refreshNotifications(f.ctx);const artwork=f.button.artwork,read=deferred();f.ctx.api=()=>read.promise;
 const pending=ui.refreshNotifications(f.ctx);assert.equal(f.button.count?.textContent,'7');assert.equal(f.button.count?.hidden,false);assert.equal(f.button.artwork,artwork);
 read.resolve({unread:7});await pending;assert.equal(f.button.artwork,artwork);assert.equal(f.button.count.textContent,'7');
});
test('a changed unread count updates the existing badge without replacing its bell or button',async t=>{
 const f=notificationBoundary(t);await ui.refreshNotifications(f.ctx);const artwork=f.button.artwork,count=f.button.count,writes=f.button.writes;
 f.ctx.api=async()=>({unread:8});await ui.refreshNotifications(f.ctx);assert.equal(f.button.artwork,artwork);assert.equal(f.button.count,count);assert.equal(f.button.count.textContent,'8');assert.equal(f.button.writes,writes);
 f.ctx.api=async()=>({unread:0});await ui.refreshNotifications(f.ctx);assert.equal(f.button.count,count);assert.equal(f.button.count.hidden,true);
});
test('temporary notification failures leave the last known count and control intact',async t=>{
 const f=notificationBoundary(t);await ui.refreshNotifications(f.ctx);const artwork=f.button.artwork;f.ctx.api=async()=>{throw Error('offline');};await ui.refreshNotifications(f.ctx);
 assert.equal(f.button.count.textContent,'7');assert.equal(f.button.count.hidden,false);assert.equal(f.button.artwork,artwork);
});
test('an older notification response cannot overwrite a newer read result',async t=>{
 const f=notificationBoundary(t);await ui.refreshNotifications(f.ctx);const old=deferred(),recent=deferred();let reads=0;f.ctx.api=()=>++reads===1?old.promise:recent.promise;
 const first=ui.refreshNotifications(f.ctx),second=ui.refreshNotifications(f.ctx);recent.resolve({unread:2});await second;old.resolve({unread:9});await first;assert.equal(f.button.count.textContent,'2');
});
test('a response from the previous account cannot reveal its unread count after an account switch',async t=>{
 const f=notificationBoundary(t);await ui.refreshNotifications(f.ctx);const old=deferred(),recent=deferred();f.ctx.api=()=>old.promise;const first=ui.refreshNotifications(f.ctx);
 f.ctx.authGeneration++;f.ctx.session.user.id=2;f.ctx.api=()=>recent.promise;const second=ui.refreshNotifications(f.ctx);assert.equal(f.button.count.hidden,true);
 old.resolve({unread:88});await first;assert.equal(f.button.count.hidden,true);recent.resolve({unread:1});await second;assert.equal(f.button.count.textContent,'1');
});
test('unchanged shell markup preserves live child nodes; an actual name change replaces it once',()=>{
 assert.equal(typeof ui.updateMarkup,'function');let text='',writes=0,child;const node={get innerHTML(){return text;},set innerHTML(value){text=value;writes++;child={};}};
 ui.updateMarkup(node,'<span>Alex</span>');const first=child;ui.updateMarkup(node,'<span>Alex</span>');assert.equal(writes,1);assert.equal(child,first);
 ui.updateMarkup(node,'<span>Alex neu</span>');assert.equal(writes,2);assert.notEqual(child,first);
});
test('quiet table updates restore table and page scroll after replacing only list contents',()=>{
 assert.equal(typeof ui.preserveListScroll,'function');const page={scrollTop:520,scrollLeft:0},before={scrollTop:180,scrollLeft:240},after={scrollTop:0,scrollLeft:0};let table=before;
 const root={ownerDocument:{scrollingElement:page},querySelectorAll:()=>[table]};ui.preserveListScroll(root,()=>{table=after;page.scrollTop=0;});assert.deepEqual(after,{scrollTop:180,scrollLeft:240});assert.equal(page.scrollTop,520);
});
test('area navigation contains canonical destinations without unrelated workflow shortcuts',()=>{
 const markup=String(ui.renderAreaSwitcher({adminPage:true,canAdminAccess:true,workspace:'#overview',admin:'#admin'}));assert.equal((markup.match(/<a\b/g)??[]).length,2);assert.match(markup,/href="#overview"/);assert.match(markup,/data-area="workspace"/);assert.doesNotMatch(markup,/data-disposal-nav|data-scan-intake-nav/);
});

test('quick menu mirrors only visible notification badges, including read and account resets',t=>{
 const original=globalThis.MutationObserver;t.after(()=>{if(original===undefined)delete globalThis.MutationObserver;else globalThis.MutationObserver=original;});
 globalThis.MutationObserver=class{observe(){}};
 const unread={textContent:'0',hidden:true},badge={textContent:'',hidden:true},inbox={hidden:false,querySelector:()=>unread};
 const summary={setAttribute(){}},panel={querySelector:selector=>selector==='#inbox-button'?inbox:{addEventListener(){}},addEventListener(){}},controls={children:[]};
 const details={querySelector:selector=>selector==='summary'?summary:selector==='.header-menu-panel'?panel:selector==='.header-menu-controls'?controls:badge,addEventListener(){}};
 const root={children:[],append(){},ownerDocument:{createElement:()=>details,addEventListener(){}}};
 const binding=ui.bindHeaderMenu(root);assert.equal(badge.hidden,true);assert.equal(badge.textContent,'');
 unread.hidden=false;unread.textContent='7';binding.refresh();assert.equal(badge.textContent,'7');assert.equal(badge.hidden,false);
 unread.hidden=true;unread.textContent='0';binding.refresh();assert.equal(badge.hidden,true);assert.equal(badge.textContent,'');
});

test('list controls detect newly used and removed categories or reasons without treating row changes as option changes',()=>{
 assert.equal(typeof ui.inventoryFilterOptions,'function');
 const initial=ui.inventoryFilterOptions([{category:'PC'},{category:'PC'},{category:''}],[{reason:'Defekt'}]);
 assert.deepEqual(initial,{categories:['PC'],reasons:['Defekt']});
 assert.deepEqual(ui.inventoryFilterOptions([{category:'PC',name:'Renamed'}],[{reason:'Defekt',status:'Abgeschlossen'}]),initial);
 assert.deepEqual(ui.inventoryFilterOptions([{category:'Scanner'},{category:'PC'}],[{reason:'Fehllieferung'},{reason:'Defekt'}]),{categories:['PC','Scanner'],reasons:['Defekt','Fehllieferung']});
 assert.deepEqual(ui.inventoryFilterOptions([],[]),{categories:[],reasons:[]});
});
