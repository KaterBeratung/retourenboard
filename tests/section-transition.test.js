import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {createSectionTransition}=await import('../dist/public/section-transition.js').catch(()=>({}));
import {parseDesignRoute} from '../dist/public/design.js';
import {openAccount} from '../dist/public/accounts.js';
import {bindAccount} from '../dist/public/account.js';
const {createNavigationLifecycle,createHashHistory}=await import('../dist/public/design.js');
import {adminSection} from '../dist/public/admin.js';

function boundary(){
 const fades=[];let value='',cancels=0;
 function animate(target,frames,options){let finish;const effect={cancel(){cancels++;finish();},finished:new Promise(resolve=>finish=resolve)};fades.push({target,frames,options,effect,finish});return effect;}
 const heading={animate(frames,options){return animate('heading',frames,options);}};
 const root={querySelector:()=>heading,animate(frames,options){return animate('workspace',frames,options);}};
 const doc={startViewTransition(){throw Error('Snapshots must not obscure the live page');}};
 return {root,doc,fades,get value(){return value;},show:next=>()=>{value=next;},get cancels(){return cancels;}};
}

test('area motion never transforms the interactive workspace or leaves its controls in a composited hit-test layer',async()=>{
 const b=boundary(),motion=createSectionTransition(b.root,b.doc,()=>true);
 await motion.run('overview',b.show('overview'));await motion.run('returns',b.show('returns'));
 assert.equal(b.fades.length,1);assert.equal(b.fades[0].target,'heading','Only the non-interactive heading may move; the workspace must remain in its normal hit-test layer');
});

test('areas without a page heading stay interactive and update immediately without animating the root',async()=>{
 let paints=0;const root={querySelector:()=>null,animate(){assert.fail('Never fall back to animating the interactive workspace');}};
 const motion=createSectionTransition(root,{},()=>true);
 await motion.run('overview',()=>paints++);await motion.run('chat',()=>paints++);assert.equal(paints,2);
});

test('area changes keep every animation frame opaque and do not replay motion for filters',async()=>{
 const b=boundary(),motion=createSectionTransition(b.root,b.doc,()=>true);
 await motion.run('overview',b.show('overview'));assert.equal(b.fades.length,0);
 await motion.run('products',b.show('products'));assert.equal(b.value,'products');assert.equal(b.fades.length,1);
 assert.ok(b.fades[0].frames.every(frame=>frame.opacity===undefined||frame.opacity===1),'Area navigation must never fade out the content');
 await motion.run('products',b.show('filtered products'));assert.equal(b.value,'filtered products');assert.equal(b.fades.length,1);
});

test('rapid navigation cancels the previous entrance without replaying after asynchronous binding',async()=>{
 const b=boundary(),motion=createSectionTransition(b.root,b.doc,()=>true);let finishOld,finishLatest;
 await motion.run('overview',b.show('overview'));
 const old=motion.run('returns',()=>{b.show('returns')();return new Promise(resolve=>finishOld=resolve);});
 const latest=motion.run('account',()=>{b.show('account')();return new Promise(resolve=>finishLatest=resolve);});
 assert.equal(b.value,'account');finishLatest();await latest;finishOld();await old;
 assert.equal(b.value,'account');assert.equal(b.fades.length,2);assert.equal(b.cancels,1);
});

test('entrance starts when the new content is painted, before its data binding finishes',async()=>{
 const b=boundary(),motion=createSectionTransition(b.root,b.doc,()=>true);let finish;
 await motion.run('overview',b.show('overview'));
 const pending=motion.run('account',()=>{b.show('account')();return new Promise(resolve=>finish=resolve);});
 assert.equal(b.value,'account');assert.equal(b.fades.length,1,'Do not move the page only after a slow read completes');
 finish();await pending;assert.equal(b.fades.length,1);
});

test('same-area refreshes preserve the active entrance instead of snapping it back',async()=>{
 const b=boundary(),motion=createSectionTransition(b.root,b.doc,()=>true);
 await motion.run('overview',b.show('overview'));await motion.run('products',b.show('products'));
 await motion.run('products',b.show('filtered products'));
 assert.equal(b.cancels,0);assert.equal(b.fades.length,1);assert.equal(b.value,'filtered products');
});

test('explicit cancellation cannot restart a pending entrance when its read finishes',async()=>{
 const b=boundary(),motion=createSectionTransition(b.root,b.doc,()=>true);let finish;
 await motion.run('overview',b.show('overview'));
 const pending=motion.run('account',()=>{b.show('account')();return new Promise(resolve=>finish=resolve);});
 motion.cancel();finish();await pending;
 assert.equal(b.fades.length,1);assert.equal(b.cancels,1);
});

test('a failed binding stops its entrance without cancelling a newer navigation',async()=>{
 const b=boundary(),motion=createSectionTransition(b.root,b.doc,()=>true);let fail;
 await motion.run('overview',b.show('overview'));
 const pending=motion.run('account',()=>new Promise((resolve,reject)=>fail=reject));
 await motion.run('returns',b.show('returns'));
 fail(Error('offline'));await assert.rejects(pending,/offline/);
 assert.equal(b.fades.length,2);assert.equal(b.cancels,1);assert.equal(b.value,'returns');
});

test('a locked session or reduced motion cancels the active effect and updates immediately',async()=>{
 const b=boundary();let allowed=true;const motion=createSectionTransition(b.root,b.doc,()=>allowed);
 await motion.run('overview',b.show('private'));await motion.run('account',b.show('account'));
 allowed=false;await motion.run('locked',b.show(''));
 assert.equal(b.value,'');assert.equal(b.fades.length,1);assert.equal(b.cancels,1);
});

test('changing the motion preference during a read cancels motion while completing navigation',async()=>{
 const b=boundary();let allowed=true,finish;const motion=createSectionTransition(b.root,b.doc,()=>allowed);
 await motion.run('overview',b.show('overview'));const pending=motion.run('account',()=>{b.show('account')();return new Promise(resolve=>finish=resolve);});
 allowed=false;motion.cancel();finish();await pending;assert.equal(b.value,'account');assert.equal(b.fades.length,1);assert.equal(b.cancels,1);
});

test('browsers without animation support show the requested area immediately',async()=>{
 let value='';const motion=createSectionTransition({}, {},()=>true);
 await motion.run('overview',()=>value='overview');await motion.run('products',()=>value='products');assert.equal(value,'products');
});

test('account navigation uses the current application and retains administrative routing',()=>{
 const original=globalThis.location;globalThis.location={href:''};let opened=0;
 try{openAccount({openAccountPage:()=>opened++});assert.equal(opened,1);assert.equal(globalThis.location.href,'');}
 finally{if(original===undefined)delete globalThis.location;else globalThis.location=original;}
 assert.deepEqual(parseDesignRoute('#account'),{view:'account',scope:''});
 assert.deepEqual(parseDesignRoute('#account',true),{view:'account',scope:''});
 assert.deepEqual(parseDesignRoute('#backups',true),{view:'admin',scope:''});
});
test('leaving account settings during a failed read cannot replace the next view with its error',async()=>{
 let reject;const previous={isConnected:true,textContent:''},next={isConnected:true,textContent:'new account'};let current=previous;
 const ctx={unlocked:true,authGeneration:1,session:{user:{id:1}},api:()=>new Promise((_,no)=>reject=no)};
 const root={querySelector:()=>current},pending=bindAccount(ctx,root);previous.isConnected=false;current=next;
 reject(Error('offline'));await pending;assert.equal(next.textContent,'new account');
});

test('admin routes open inside the app and legacy admin URLs can return to the workspace',()=>{
 assert.deepEqual(parseDesignRoute('#admin?section=backups'),{view:'admin',scope:''});
 assert.deepEqual(parseDesignRoute('#overview',true),{view:'overview',scope:''});
 assert.deepEqual(parseDesignRoute('#returns?scope=open',true),{view:'returns',scope:'open'});
 const original=globalThis.location;
 try{globalThis.location={hash:'#admin?section=backups'};assert.equal(adminSection({canAdminSection:()=>true}),'backups');}
 finally{if(original===undefined)delete globalThis.location;else globalThis.location=original;}
});
test('two simultaneous account requests retain the original back destination',async()=>{
 assert.equal(typeof createNavigationLifecycle,'function');
 let hash='#products',back='',view='products';const navigation=createNavigationLifecycle(()=>hash);
 const options={isAccount:()=>view==='account',canLeave:async()=>true,remember:value=>back=value,open:()=>hash='#account',fallback:'#overview'};
 await Promise.all([navigation.openAccount(options),navigation.openAccount(options)]);
 assert.equal(hash,'#account');assert.equal(back,'#products');
});
test('a delayed inventory read cannot render a newer account visit, including a round trip',async()=>{
 assert.equal(typeof createNavigationLifecycle,'function');
 let hash='#overview';const navigation=createNavigationLifecycle(()=>hash),current=navigation.checkpoint();
 hash='#account';navigation.invalidate();assert.equal(current(),false);
 hash='#overview';navigation.invalidate();assert.equal(current(),false);
 const newest=navigation.checkpoint();assert.equal(newest(),true);
});

test('an accepted audit-history navigation closes the return drawer before painting administration',async()=>{
 const source=readFileSync(new URL('../dist/public/app.js',import.meta.url),'utf8');
 const start=source.indexOf('async function route()'),end=source.indexOf("document.querySelectorAll('[data-icon]')",start);
 assert.ok(start>=0&&end>start);
 const dialog={open:true,close(){this.open=false;},replaceChildren(){}};
 const state={view:'returns',inventoryLoaded:true,masterdata:{statuses:[]}},location={hash:'#admin?section=audit&entityId=1'};
 let shown=false;
 const route=new Function('location','document','applyRoute','state','updateAccess','ctx','render','returnSelection',source.slice(start,end)+';return route;')(
  location,{querySelector:()=>dialog},()=>{state.view='admin';state.adminPage=true;},state,()=>{},{hasAdminAccess:true},()=>{assert.equal(dialog.open,false,'The history must not remain behind the modal drawer');shown=true;},{clear(){}}
 );
 await route();assert.equal(shown,true);
});

test('cancelled browser back restores the previous position without overwriting the destination',()=>{
 assert.equal(typeof createHashHistory,'function');
 const entries=[{hash:'#products',state:null}],moves=[];let position=0;
 const history={get state(){return entries[position].state;},replaceState(state){entries[position].state=state;},go(delta){moves.push(delta);position+=delta;}};
 const routing=createHashHistory(history,()=>entries[position].hash);
 entries.push({hash:'#admin?section=settings',state:null});position=1;routing.accept();
 position=0;routing.cancel();assert.equal(position,1);assert.equal(routing.restored(),true);
 assert.equal(entries[0].hash,'#products');assert.equal(entries[1].hash,'#admin?section=settings');
 position=0;routing.accept();assert.equal(entries[position].hash,'#products');assert.deepEqual(moves,[1]);
});

test('clearing a list scope preserves its history marker and its cancelled-back destination',()=>{
 const entries=[{hash:'#products',state:null}],moves=[];let position=0;
 const history={get state(){return entries[position].state;},replaceState(state,unused,hash){entries[position].state=state;if(hash!==undefined)entries[position].hash=hash;},go(delta){moves.push(delta);position+=delta;}};
 const routing=createHashHistory(history,()=>entries[position].hash);
 entries.push({hash:'#returns?scope=open',state:null});position=1;routing.accept();
 assert.equal(typeof routing.replace,'function');routing.replace('#returns');
 position=0;routing.cancel();assert.equal(position,1);assert.equal(routing.restored(),true);
 assert.equal(entries[1].hash,'#returns');assert.equal(entries[0].hash,'#products');assert.deepEqual(moves,[1]);
});
