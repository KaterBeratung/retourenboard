import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {hasPermission,canAdminSection} from '../dist/shared/permissions.js';
import {t,setText,locale,apiError,setLanguage} from '../dist/public/i18n.js';
import {createNavigationLifecycle,inventoryChanged,inventoryFilterOptions,readWhenIdle} from '../dist/public/design.js';
import {workflowStatuses} from '../dist/public/inventory-display.js';
import {createReturnSelection} from '../dist/public/workflow-actions.js';
import {loginPathFor} from '../dist/shared/auth-navigation.js';
import {refreshCurrencyRate} from '../dist/public/admin-settings.js';
import {navigationToolRights} from '../dist/public/navigation-tools.js';
import {createAreaNavigation} from '../dist/public/sidebar-navigation.js';

// Exercise the real browser controller against a small DOM/network boundary.
// No browser or real account credentials are involved.
function controller(fetch,{dialogOpen=false,adminPage=false,interacting=()=>false}={}){
  const source=readFileSync(new URL('../dist/public/app.js',import.meta.url),'utf8');
  const start=source.indexOf('const ctx = {'),end=source.indexOf('\nfunction updateAccess',start);
  assert.ok(start>=0&&end>start,'The controller must be read from the shipped frontend build');
  const state={products:[{name:'Secret'}],returns:[{serialNumber:'Secret'}],masterdata:{suppliers:[{name:'Secret'}]},session:{unlocked:true,user:{id:1},csrfToken:'valid'}};
  state.adminPage=adminPage;
  let renders=0,logins=0;const destinations=[],painted=[],rowRefreshes=[];
  const dialog={open:dialogOpen,cleared:false,close(){this.open=false;},replaceChildren(){this.cleared=true;}};
  const doc={visibilityState:'visible',querySelector:selector=>selector==='#dialog'?dialog:{textContent:''}};
  const location={pathname:'/',search:'',hash:'#overview',replace:url=>destinations.push(url)},navigationLifecycle=createNavigationLifecycle(()=>location.hash);
  const areaNavigation=createAreaNavigation();
  const ctx=new Function('state','fetch','document','updateAccess','render','loginDialog','hasPermission','canAdminSection','location','window','t','setText','locale','apiError','navigationLifecycle','applyAccountAppearance','refreshNotifications','readWhenIdle','inventoryChanged','isInteracting','loginPathFor','returnSelection','refreshCurrencyRate','inventoryFilterOptions','statuses','workflowStatuses','refreshRows','navigationToolRights','areaNavigation','acceptedAreaRoute',source.slice(start,end)+';return ctx;')(
    state,fetch,doc,()=>{},()=>{renders++;painted.push(state.products[0]?.id);},()=>logins++,hasPermission,canAdminSection,
    location,{addEventListener(){}},t,setText,locale,apiError,navigationLifecycle,()=>{},()=>{},readWhenIdle,inventoryChanged,interacting,loginPathFor,createReturnSelection(),refreshCurrencyRate,inventoryFilterOptions,()=>workflowStatuses(state.masterdata.statuses,state.returns),workflowStatuses,options=>rowRefreshes.push(options),navigationToolRights,areaNavigation,location.hash
  );
  return {ctx,state,dialog,location,navigationLifecycle,areaNavigation,destinations,painted,rowRefreshes,renders:()=>renders,logins:()=>logins,reloads:()=>destinations.length};
}
const result=(status,data)=>({ok:status===200,status,json:async()=>data});

test('ordinary polling retains area bookmarks while an account change clears the previous account destinations',()=>{
 const c=controller(()=>{throw Error('No request expected');});
 const session={unlocked:true,user:{id:1,role:'member',permissions:{}},csrfToken:'valid'};
 c.state.session=session;c.areaNavigation.remember('#returns?search=previous-account');c.areaNavigation.remember('#admin?section=audit');
 c.ctx.applySession({...session,user:{...session.user}});
 assert.equal(c.areaNavigation.destinations().workspace,'#returns?search=previous-account');
 c.ctx.applySession({...session,user:{...session.user,id:2}});
 assert.deepEqual(c.areaNavigation.destinations(),{workspace:'#overview',admin:'#admin'});
});

test('a refreshed currency is acknowledged so later identical polls do not redraw list rows',async()=>{
 let rate=1.1;
 const c=controller(async path=>result(200,path==='/api/config'?{currency:{display:'USD',rate}}:path==='/api/masterdata'?{}:path==='/api/account/preferences'?{}:[]));c.state.view='products';
 await c.ctx.reload({sessionChecked:true});c.state.currencyRendered=JSON.stringify(c.ctx.config.currency);
 rate=1.2;await c.ctx.reload({quiet:true,sessionChecked:true});assert.equal(c.rowRefreshes.length,1);
 await c.ctx.reload({quiet:true,sessionChecked:true});assert.equal(c.rowRefreshes.length,1,'The new currency was already painted by the previous row refresh');
});

for(const [view,change,rowsOnly] of [
 ['products',data=>data.products[0].name='Renamed',true],
 ['products',data=>data.products.push({id:2,category:'Scanner'}),false],
 ['returns',data=>data.returns[0].nextStep='Prüfen',true],
 ['returns',data=>data.returns.push({id:2,reason:'Fehllieferung',statusId:1}),false],
 ['returns',data=>data.returns[0].statusId=2,false]
])test(`quiet ${view} refresh ${rowsOnly?'keeps controls and updates rows':'refreshes changed filter choices'} (${String(change)})`,async()=>{
 const data={products:[{id:1,name:'PC',category:'PC'}],returns:[{id:1,reason:'Defekt',statusId:1}],masters:{statuses:[{id:1,name:'Eingegangen',active:true},{id:2,name:'Archiviert',active:false}]}};
 const c=controller(async path=>result(200,structuredClone(path==='/api/products'?data.products:path==='/api/returns'?data.returns:path==='/api/masterdata'?data.masters:path==='/api/returns/assignees'?[]:{})));
 c.state.view=view;await c.ctx.reload({sessionChecked:true});const rendered=c.renders();
 change(data);await c.ctx.reload({quiet:true,sessionChecked:true});
 assert.equal(c.renders(),rendered+(rowsOnly?0:1));assert.deepEqual(c.rowRefreshes,rowsOnly?[{preserveScroll:true}]:[]);
 await c.ctx.reload({quiet:true,sessionChecked:true});assert.equal(c.renders(),rendered+(rowsOnly?0:1));assert.equal(c.rowRefreshes.length,rowsOnly?1:0,'An unchanged snapshot must not redraw anything');
});

test('concurrent inventory consumers share one read and a failed read can be retried',async()=>{
 const calls=[],waiting=[];let failing=false;
 const c=controller(async path=>{calls.push(path);if(failing)throw Error('Temporary outage');return new Promise(resolve=>waiting.push(()=>resolve(result(200,path==='/api/masterdata'?{}:[{id:23}]))));});
 const one=c.ctx.ensureInventory(),two=c.ctx.ensureInventory();await new Promise(resolve=>setImmediate(resolve));
 const count=calls.length;for(const finish of waiting)finish();await Promise.all([one,two]);
 assert.equal(count,4,'Concurrent consumers must share the four inventory endpoint reads');assert.equal(c.state.products[0].id,23);
 failing=true;await assert.rejects(c.ctx.ensureInventory(),/Temporary outage/);
 failing=false;waiting.length=0;const retry=c.ctx.ensureInventory();await new Promise(resolve=>setImmediate(resolve));for(const finish of waiting)finish();await retry;
 assert.equal(c.state.inventoryLoaded,true);
});

test('a slower earlier refresh cannot replace a newer inventory or configuration',async()=>{
 const waiting=[];let phase=0;
 const c=controller(async path=>{
  const tag=phase;if(tag===0)return new Promise(resolve=>waiting.push(()=>resolve(result(200,path==='/api/config'?{marker:0}:path==='/api/account/preferences'||path==='/api/masterdata'?{}:[{id:1}]))));
  return result(200,path==='/api/config'?{marker:tag}:path==='/api/account/preferences'||path==='/api/masterdata'?{}:[{id:tag}]);
 });c.state.view='overview';
 const earlier=c.ctx.reload({sessionChecked:true});await new Promise(resolve=>setImmediate(resolve));
 phase=2;await c.ctx.reload({sessionChecked:true});for(const finish of waiting)finish();await earlier;
 assert.equal(c.state.products[0].id,2);assert.equal(c.state.config.marker,2,'Old settings must not overwrite a later refresh');
});

test('a late search inventory read cannot undo a completed save refresh',async()=>{
 const waiting=[];let phase=0;
 const c=controller(async path=>{
  if(phase===0)return new Promise(resolve=>waiting.push(()=>resolve(result(200,path==='/api/masterdata'?{}:[{id:1}]))));
  return result(200,path==='/api/config'||path==='/api/account/preferences'||path==='/api/masterdata'?{}:[{id:2}]);
 });c.state.view='overview';
 const earlier=c.ctx.ensureInventory();await new Promise(resolve=>setImmediate(resolve));phase=1;
 await c.ctx.reload({sessionChecked:true});for(const finish of waiting)finish();await earlier;
 assert.equal(c.state.products[0].id,2,'The newer save snapshot must remain current');
});

test('background refresh never overlaps itself and recovers after an outage',async()=>{
 let release,calls=0,fail=false;
 const c=controller(async path=>{calls++;if(fail)throw Error('Temporary outage');return new Promise(resolve=>release=()=>resolve(result(200,{unlocked:true,user:{id:1},csrfToken:'valid'})));});
 assert.equal(typeof c.ctx.poll,'function');let refreshed=0;c.ctx.reload=async()=>{refreshed++;};
 const pending=c.ctx.poll();await new Promise(resolve=>setImmediate(resolve));await c.ctx.poll();assert.equal(calls,1);
 release();await pending;assert.equal(refreshed,1);
 fail=true;await c.ctx.poll();fail=false;const retry=c.ctx.poll();await new Promise(resolve=>setImmediate(resolve));release();await retry;
 assert.equal(refreshed,2,'A rejected request must release the polling guard');
});

test('workspace inventory starts alongside settings instead of waiting for a second network stage',async()=>{
 const calls=[];let release;
 const c=controller(async path=>{calls.push(path);if(path==='/api/config')return new Promise(resolve=>release=()=>resolve(result(200,{})));return result(200,path==='/api/account/preferences'||path==='/api/masterdata'?{}:[]);});
 c.state.view='overview';const pending=c.ctx.reload({sessionChecked:true});await new Promise(resolve=>setImmediate(resolve));
 const started=['/api/products','/api/returns','/api/masterdata','/api/returns/assignees'].every(path=>calls.includes(path));release();await pending;
 assert.equal(started,true,'Independent reads should not wait for configuration');
});

test('quiet parallel reads do not redraw a form opened while settings are still loading',async()=>{
 let release,busy=false;
 const c=controller(async path=>{if(path==='/api/config')return new Promise(resolve=>release=()=>resolve(result(200,{})));return result(200,path==='/api/account/preferences'||path==='/api/masterdata'?{}:[{id:2}]);},{interacting:()=>busy});
 c.state.view='overview';c.state.inventoryLoaded=true;const before=c.state.products;
 const pending=c.ctx.reload({quiet:true,sessionChecked:true});await new Promise(resolve=>setImmediate(resolve));busy=true;release();await pending;
 assert.equal(c.state.products,before);assert.equal(c.renders(),0,'Unsaved input must survive a late parallel refresh');
});

test('a settings failure safely abandons a concurrent failed inventory read',async()=>{
 const c=controller(async()=>{throw Error('Temporary outage');});c.state.view='overview';
 await assert.rejects(c.ctx.reload({sessionChecked:true}),/Temporary outage/);
 await new Promise(resolve=>setImmediate(resolve));
});

for(const later of ['completed','pending'])test(`a parallel refresh preserves a newer ${later} search read`,async()=>{
 let releaseSettings,releaseSearch;let phase=1;
 const c=controller(async path=>{
  if(path==='/api/config')return new Promise(resolve=>releaseSettings=()=>resolve(result(200,{})));
  if(path==='/api/account/preferences')return result(200,{});
  if(phase===2&&path==='/api/products'&&later==='pending')return new Promise(resolve=>releaseSearch=()=>resolve(result(200,[{id:2}])));
  return result(200,path==='/api/masterdata'?{}:[{id:phase}]);
 });c.state.view='overview';
 const pending=c.ctx.reload({sessionChecked:true});await new Promise(resolve=>setImmediate(resolve));
 phase=2;const search=c.ctx.ensureInventory();await new Promise(resolve=>setImmediate(resolve));
 if(later==='completed')await search;
 releaseSettings();await new Promise(resolve=>setImmediate(resolve));releaseSearch?.();await Promise.all([pending,search]);
 assert.equal(c.state.products[0].id,2,'The completed parallel preload must not roll back a newer search snapshot');
 assert.ok(c.renders()>0,'The refreshed list must still be painted with the newest inventory');
 assert.equal(c.painted.at(-1),2,'The visible list must use the newer snapshot too');
});

test('a failed access check displays its translated notification without throwing',async()=>{
  setLanguage('en');
  try{
    const {ctx}=controller(async()=>{throw new Error('Verbindung fehlgeschlagen');});
    const messages=[];ctx.toast=message=>messages.push(String(message));
    await ctx.ensureUnlocked(()=>{throw new Error('The action must not run after a failed check');});
    assert.deepEqual(messages,['Connection failed']);
  }finally{setLanguage('de');}
});
test('losing an authenticated session returns to the public entry, while unchanged sessions do not',()=>{
  const {ctx,state,reloads,destinations}=controller(()=>{throw new Error('No request expected');});
  ctx.applySession({...state.session});assert.equal(reloads(),0);
  ctx.applySession({unlocked:false,user:null,csrfToken:null});assert.equal(reloads(),1);
  assert.deepEqual(destinations,['/login?returnTo=%2F%23overview']);
  ctx.applySession({unlocked:false,user:null,csrfToken:null});assert.equal(reloads(),1);
});
test('a session revoked during the initial module handoff also returns to the public entry',async()=>{
  const {ctx,state,reloads}=controller(async()=>result(200,{unlocked:false,user:null,csrfToken:null}));
  // bootstrap confirmed the cookie before import; the newly imported app has
  // not confirmed it yet when a concurrent logout revokes the session.
  state.session={unlocked:false,user:null,csrfToken:null};
  await ctx.reload();assert.equal(reloads(),1);
  await ctx.reload();assert.equal(reloads(),1);
});
test('logged-out refresh clears cached data without requesting protected endpoints',async()=>{
  const calls=[];const {ctx,state,renders}=controller(async path=>{calls.push(path);return result(200,{unlocked:false,user:null,setupRequired:false});});
  await ctx.reload();assert.deepEqual(calls,['/api/session']);assert.deepEqual(state.products,[]);assert.deepEqual(state.returns,[]);assert.deepEqual(state.masterdata,{});assert.ok(renders()>0);
});
test('wrong current password retains the valid session for a corrected retry',async()=>{
  let attempts=0;const session={unlocked:true,user:{id:1},csrfToken:'valid'};
  const {ctx,state}=controller(async(path,options)=>{
    if(path==='/api/session')return result(200,session);
    assert.equal(options.headers['X-CSRF-Token'],'valid');
    return attempts++===0?result(401,{error:'Current password incorrect'}):result(200,{unlocked:false});
  });
  await assert.rejects(ctx.api('/api/account/password',{method:'POST',body:{currentPassword:'bad'}}),/incorrect/);
  assert.equal(state.session.csrfToken,'valid');assert.equal(state.session.unlocked,true);
  assert.equal((await ctx.api('/api/account/password',{method:'POST',body:{currentPassword:'correct'}})).unlocked,false);
});

test('an individual right revoked in an existing member session closes stale forms and redraws actions',()=>{
  const {ctx,state,dialog,renders}=controller(()=>{throw new Error('No request expected');},{dialogOpen:true});
  state.session={unlocked:true,user:{id:1,role:'member',permissions:{productsCreate:true,returnsCreate:false}},csrfToken:'valid'};
  assert.equal(ctx.can('productsCreate'),true);assert.equal(ctx.can('returnsCreate'),false);
  ctx.applySession({unlocked:true,user:{id:1,role:'member',permissions:{productsCreate:false,returnsCreate:false}},csrfToken:'valid'});
  assert.equal(ctx.can('productsCreate'),false);assert.equal(dialog.open,false);assert.equal(dialog.cleared,true);assert.equal(renders(),1);
});

test('revoking a delegated administration right removes cached administration data without changing role',()=>{
  const {ctx,state,renders}=controller(()=>{throw new Error('No request expected');},{adminPage:true});
  state.session={unlocked:true,user:{id:1,role:'member',canImport:false,canExport:false,permissions:{masterdataManage:true}},csrfToken:'valid'};
  state.inventoryLoaded=true;
  assert.equal(ctx.canAdminSection('masterdata'),true);assert.equal(ctx.canAdminSection('users'),false);
  ctx.applySession({unlocked:true,user:{id:1,role:'member',canImport:false,canExport:false,permissions:{masterdataManage:false}},csrfToken:'valid'});
  assert.equal(ctx.hasAdminAccess,false);assert.deepEqual(state.masterdata,{});assert.equal(renders(),1);
  assert.equal(state.inventoryLoaded,false,'Leaving revoked administration must reload the workspace immediately');
});

test('delegated import or export retains access to data tools without granting administration rights',()=>{
  for(const permission of ['returnsImport','productsExport']){
    const {ctx,state}=controller(()=>{throw Error('No request expected');});
    state.session={unlocked:true,user:{id:1,role:'member',canImport:false,canExport:false,permissions:{[permission]:true}}};
    assert.equal(ctx.hasAdminAccess,true);assert.equal(ctx.canAdminSection('data-tools'),true);
    assert.equal(ctx.canAdminSection('users'),false);assert.equal(ctx.canAdminSection('masterdata'),false);
    state.session.unlocked=false;assert.equal(ctx.hasAdminAccess,false);assert.equal(ctx.canAdminSection('data-tools'),false);
  }
});

test('an inventory read started before account navigation cannot redraw the new account form',async()=>{
  let ready;const started=new Promise(resolve=>ready=resolve),responses=[];
  const c=controller(async path=>{
    if(path==='/api/session')return result(200,{unlocked:true,user:{id:1,role:'admin'},csrfToken:'valid'});
    if(path==='/api/config')return result(200,{currency:{display:'EUR'}});
    if(path==='/api/account/preferences')return result(200,{});
    return new Promise(resolve=>{responses.push(()=>resolve(result(200,path==='/api/masterdata'?{suppliers:[]}:[{id:2}])));if(responses.length===3)ready();});
  });
  c.state.view='overview';c.state.inventoryLoaded=false;
  const pending=c.ctx.reload();await started;
  // Settings now run alongside inventory. Finish that independent stage before
  // navigating, while the inventory responses remain deliberately pending.
  await new Promise(resolve=>setImmediate(resolve));
  c.location.hash='#account';c.state.view='account';c.navigationLifecycle.invalidate();
  for(const finish of responses)finish();await pending;
  assert.equal(c.renders(),0,'The edited account form must not be rebuilt by an old inventory request');
  assert.equal(c.state.inventoryLoaded,true);assert.deepEqual(c.state.products,[{id:2}]);
});

test('independent startup settings are requested together without waiting for configuration first',async()=>{
 const calls=[],waiting=[];
 const c=controller(async path=>{
  calls.push(path);if(path==='/api/session')return result(200,{unlocked:true,user:{id:1,role:'admin'},csrfToken:'valid'});
  if(path==='/api/config'||path==='/api/account/preferences')return new Promise(resolve=>waiting.push(()=>resolve(result(200,path==='/api/config'?{currency:{display:'EUR'}}:{}))));
  return result(200,path==='/api/masterdata'?{}:[]);
 });
 c.state.view='overview';const pending=c.ctx.reload();await new Promise(resolve=>setImmediate(resolve));
 const together=calls.includes('/api/account/preferences');for(let index=0;index<waiting.length;index++){waiting[index]();await new Promise(resolve=>setImmediate(resolve));}await pending;
 assert.equal(together,true,'Preferences must already be in flight while configuration is pending');assert.equal(c.state.inventoryLoaded,true);
});

test('navigation during a saved-record refresh cannot leave the inventory marked current',async()=>{
 let release;
 const c=controller(async path=>{
  if(path==='/api/config'&&!release)return new Promise(resolve=>release=()=>resolve(result(200,{})));
  if(path==='/api/account/preferences')return result(200,{});
  return result(200,path==='/api/masterdata'?{}:[{id:19,name:'Newly saved product'}]);
 });
 c.state.view='products';c.state.inventoryLoaded=true;
 const pending=c.ctx.reload({sessionChecked:true});
 assert.equal(c.state.inventoryLoaded,false,'A save refresh must invalidate cached lists before awaiting settings');
 c.location.hash='#returns';c.state.view='returns';c.navigationLifecycle.invalidate();
 release();await pending;
 assert.equal(c.state.inventoryLoaded,false,'An interrupted refresh must require a fresh inventory read on navigation');
 assert.equal(c.renders(),0,'The earlier route must not redraw the new view');
 await c.ctx.reload({sessionChecked:true});
 assert.equal(c.state.inventoryLoaded,true);assert.equal(c.state.products[0].id,19);
});

test('quiet polling keeps a loaded inventory usable while unrelated settings are pending',async()=>{
 let release;
 const c=controller(async path=>path==='/api/config'?new Promise(resolve=>release=()=>resolve(result(200,{}))):result(200,path==='/api/masterdata'?{}:[]));
 c.state.view='products';c.state.inventoryLoaded=true;
 const pending=c.ctx.reload({quiet:true,sessionChecked:true});
 assert.equal(c.state.inventoryLoaded,true,'Ordinary polling must retain the usable cache and avoid loading flicker');
 release();await pending;assert.equal(c.state.inventoryLoaded,true);
});

test('an expired private request clears cached data and closes its dialog',async()=>{
  const calls=[];
  const {ctx,state,dialog,logins}=controller(async path=>{
    calls.push(path);
    return path==='/api/session'?result(200,{unlocked:false,user:null,csrfToken:null}):result(401,{error:'Bitte zuerst anmelden.'});
  },{dialogOpen:true});
  await assert.rejects(ctx.api('/api/products'),/Bitte zuerst anmelden/);
  assert.deepEqual(calls,['/api/products','/api/session']);
  assert.deepEqual(state.products,[]);assert.deepEqual(state.returns,[]);assert.deepEqual(state.masterdata,{});
  assert.equal(ctx.unlocked,false);assert.equal(ctx.csrfToken,null);assert.equal(dialog.open,false);assert.equal(logins(),1);
});

test('an incorrect second factor does not replace the active login challenge',async()=>{
  const calls=[];
  const {ctx,logins}=controller(async path=>{calls.push(path);return result(401,{error:'Code ungültig.'});});
  await assert.rejects(ctx.api('/api/login/mfa',{method:'POST',body:{code:'123456'}}),/Code ungültig/);
  assert.deepEqual(calls,['/api/login/mfa']);assert.equal(logins(),0);
});

test('role changes clear admin data and immediately update available actions',()=>{
  const {ctx,state,renders}=controller(()=>{throw new Error('No request expected');},{adminPage:true});
  ctx.applySession({unlocked:true,user:{id:1,role:'admin',capabilities:{edit:true,delete:true,import:true,export:true}}});
  assert.equal(ctx.isAdmin,true);assert.equal(ctx.capabilities.edit,true);
  ctx.applySession({unlocked:true,user:{id:1,role:'viewer',capabilities:{edit:false,delete:false,import:false,export:true}}});
  assert.equal(ctx.isAdmin,false);assert.equal(ctx.capabilities.edit,false);assert.equal(ctx.capabilities.export,true);
  assert.deepEqual(state.products,[]);assert.deepEqual(state.returns,[]);assert.deepEqual(state.masterdata,{});assert.equal(renders(),1);
});

for(const transition of ['logout','other user','new session','permission change']){
  test(`late authenticated results cannot survive ${transition}`,async()=>{
    let finish;
    const {ctx,state,dialog}=controller(()=>new Promise(resolve=>finish=resolve),{dialogOpen:true});
    state.session={unlocked:true,user:{id:1,role:'member',permissions:{returnsCreate:true}},csrfToken:'valid'};
    const pending=ctx.api('/api/account/mfa/recovery-codes',{method:'POST',body:{}});
    const next=transition==='logout'?{unlocked:false,user:null,csrfToken:null}:
      {unlocked:true,user:{id:transition==='other user'?2:1,role:'member',permissions:{returnsCreate:transition!=='permission change'}},csrfToken:transition==='new session'?'replacement':'valid'};
    ctx.applySession(next);
    finish(result(200,{recoveryCodes:['must-stay-hidden']}));
    await assert.rejects(pending,/Anmeldung.*geändert/);
    assert.equal(dialog.open,false);assert.equal(dialog.cleared,true);
    assert.equal(state.session,next);
  });
}
test('ordinary session polling preserves a pending security action',async()=>{
  let finish;
  const {ctx,state}=controller(()=>new Promise(resolve=>finish=resolve));
  const session={unlocked:true,user:{id:1,role:'member',permissions:{}},csrfToken:'valid'};
  state.session=session;
  const pending=ctx.api('/api/account/mfa/setup',{method:'POST',body:{}});
  ctx.applySession({...session,user:{...session.user}});
  finish(result(200,{secret:'same-session-secret'}));
  assert.equal((await pending).secret,'same-session-secret');
});
