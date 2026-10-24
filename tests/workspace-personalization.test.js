import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceModule} from './helpers/source-module.js';
const preferences=await sourceModule("export * from './frontend/src/workspace-personalization.ts'; export {setLanguage} from './frontend/src/i18n.js'; import {addTranslations} from './frontend/src/i18n.js'; import {english} from './frontend/src/i18n-catalog.js'; addTranslations(english);").catch(()=>({}));
const storage=()=>{const data=new Map();return {data,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};};

test('overview preferences hide and reorder cards only for their authenticated account',()=>{
 assert.equal(typeof preferences.overviewPreferenceStore,'function');
 const memory=storage(),one=preferences.overviewPreferenceStore(memory,1),two=preferences.overviewPreferenceStore(memory,2);
 assert.equal(one.save({hidden:['today','reasons'],order:{queues:['unassigned','mine','today']},compactEmpty:true}),true);
 assert.deepEqual(one.read().order.queues,['unassigned','mine','today']);
 assert.deepEqual(one.read().hidden,['today','reasons']);assert.equal(one.read().compactEmpty,true);
 assert.deepEqual(two.read().hidden,[]);assert.equal(two.read().compactEmpty,false);
 assert.equal(preferences.overviewPreferenceStore(memory,null).save({hidden:['mine']}),false);
 assert.equal(one.reset(),true);assert.deepEqual(one.read().hidden,[]);assert.deepEqual(one.read().order.queues,['mine','today','unassigned']);
});
test('hostile or unavailable overview storage restores safe defaults and cannot cross card groups',()=>{
 assert.equal(typeof preferences.overviewPreferenceStore,'function');
 const memory=storage(),store=preferences.overviewPreferenceStore(memory,'7');
 store.save({hidden:['mine','mine','<unsafe>'],order:{queues:['recent','today','today','x] *']},compactEmpty:'true'});
 assert.deepEqual(store.read().hidden,['mine']);assert.deepEqual(store.read().order.queues,['today','mine','unassigned']);assert.equal(store.read().compactEmpty,false);
 for(const key of memory.data.keys())memory.data.set(key,'broken');assert.deepEqual(store.read().hidden,[]);
 const denied=preferences.overviewPreferenceStore({getItem(){throw Error('denied');},setItem(){throw Error('denied');}},7);
 assert.deepEqual(denied.read().hidden,[]);assert.equal(denied.save({}),false);
 assert.equal(preferences.overviewPreferenceStore(memory,'9007199254740993').save({}),false);
 assert.equal(preferences.overviewPreferenceStore(memory,[7]).save({}),false);
 assert.equal(preferences.overviewPreferenceStore(memory,{toString(){throw Error('invalid account');}}).save({}),false);
});
test('accessible card moves preserve every other group and do not mutate stored settings',()=>{
 assert.equal(typeof preferences.moveOverviewCard,'function');
 const before=preferences.overviewPreferenceStore(null,7).read(),after=preferences.moveOverviewCard(before,'today',-1);
 assert.deepEqual(after.order.queues,['today','mine','unassigned']);assert.deepEqual(before.order.queues,['mine','today','unassigned']);
 assert.deepEqual(after.order.dashboard,['recent','workflow']);
 assert.deepEqual(preferences.moveOverviewCard(after,'today',-1).order.queues,['today','mine','unassigned']);
 assert.deepEqual(preferences.moveOverviewCard(after,'x] *',1),after);
});

test('overview editor presents one section at a time and uses labeled switches in both languages',async()=>{
 const markup=preferences.renderOverviewEditor({hidden:['open']},'queues');
 assert.match(markup,/role="tablist"/);
 assert.match(markup,/data-overview-group-choice="queues"[^>]*aria-selected="true"/);
 assert.match(markup,/data-overview-choice="mine"[^>]*role="switch"/);
 assert.doesNotMatch(markup,/data-overview-choice="open"/);
 assert.match(markup,/data-overview-reset/);assert.match(markup,/data-close/);
 const controls=preferences.renderOverviewControls({session:{user:{id:1}}});
 assert.match(controls,/aria-haspopup="dialog"/);assert.doesNotMatch(controls,/<details/);
 preferences.setLanguage('en');try{
  const english=preferences.renderOverviewEditor(null,'kpis');
  assert.match(english,/Choose a section/);assert.match(english,/Open returns/);assert.match(english,/Key figure cards always stay the same size/);assert.match(english,/>Done</);
 }finally{preferences.setLanguage('de');}
});

test('visibility and compact changes save without replacing switch nodes; failed storage restores their state',t=>{
 assert.equal(typeof preferences.bindOverviewEditor,'function');
 const memory=storage(),choice={dataset:{overviewChoice:'today'},checked:true},compact={checked:false};
 const cards={get innerHTML(){return '';},set innerHTML(value){throw Error('Toggling must preserve the switch node and its animation');}};
 const reset={};
 const body={querySelectorAll:selector=>selector==='[data-overview-choice]'?[choice]:[],querySelector:selector=>selector==='[data-overview-card-list]'?cards:selector==='[data-overview-compact]'?compact:selector==='[data-overview-reset]'?reset:null};
 const root={dataset:{},querySelectorAll:()=>[]};
 const ctx={storage:memory,session:{user:{id:5}},toast(){}};
 preferences.bindOverviewEditor(ctx,root,body);
 choice.checked=false;choice.onchange();assert.deepEqual(preferences.overviewPreferenceStore(memory,5).read().hidden,['today']);
 compact.checked=true;compact.onchange();assert.equal(root.dataset.compactEmpty,'true');
 ctx.authGeneration=1;choice.checked=true;choice.onchange();assert.deepEqual(preferences.overviewPreferenceStore(memory,5).read().hidden,['today']);
 let warning=0;
 preferences.bindOverviewEditor({storage:{getItem:()=>null,setItem(){throw Error('denied');}},session:{user:{id:5}},toast(){warning++;}},root,body);
 choice.checked=false;choice.onchange();assert.equal(choice.checked,true);assert.equal(warning,1);
});
