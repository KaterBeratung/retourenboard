import test from 'node:test';
import assert from 'node:assert/strict';
const preferences=await import('../dist/public/table-preferences.js').catch(()=>({}));
const storage=()=>{const data=new Map();return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),data};};
test('table settings keep separate product/return preferences for each account',()=>{
 assert.equal(typeof preferences.tablePreferenceStore,'function');
 const memory=storage(),one=preferences.tablePreferenceStore(memory,1),two=preferences.tablePreferenceStore(memory,2);
 assert.equal(one.save('returns',{hidden:['supplier','serial'],density:'compact'}),true);
 assert.deepEqual(one.read('returns'),{hidden:['supplier','serial'],density:'compact'});
 assert.deepEqual(one.read('products'),{hidden:[],density:'comfortable'});
 assert.deepEqual(two.read('returns'),{hidden:[],density:'comfortable'});
 assert.equal(one.reset('returns'),true);assert.deepEqual(one.read('returns'),{hidden:[],density:'comfortable'});
});
test('corrupt or hostile table settings cannot hide identity/actions or inject column selectors',()=>{
 assert.equal(typeof preferences.tablePreferenceStore,'function');
 const memory=storage(),store=preferences.tablePreferenceStore(memory,'3');
 store.save('products',{hidden:['identity','actions','supplier','supplier','x] *'],density:'evil'});
 assert.deepEqual(store.read('products'),{hidden:['supplier'],density:'comfortable'});
 for(const key of memory.data.keys())memory.data.set(key,'{"hidden":"supplier","density":"compact"}');
 assert.deepEqual(store.read('products'),{hidden:[],density:'compact'});
 for(const key of memory.data.keys())memory.data.set(key,'broken');
 assert.deepEqual(store.read('products'),{hidden:[],density:'comfortable'});
 assert.equal(preferences.tablePreferenceStore({getItem(){throw Error();},setItem(){throw Error();}},1).save('products',{}),false);
});
test('column changes apply to current rows without rebuilding filters, pagination or selection',()=>{
 assert.equal(typeof preferences.applyTablePreferences,'function');
 const nodes=['identity','supplier','serial','actions'].map(column=>({dataset:{column},hidden:false}));
 const root={dataset:{},querySelectorAll:()=>nodes};
 preferences.applyTablePreferences(root,'returns',{hidden:['supplier','serial','identity'],density:'compact'});
 assert.deepEqual(nodes.map(el=>el.hidden),[false,true,true,false]);assert.equal(root.dataset.tableDensity,'compact');
 preferences.applyTablePreferences(root,'returns',{hidden:[],density:'comfortable'});assert.equal(nodes.some(el=>el.hidden),false);
});

test('table settings close by touch and restore focus without changing saved preferences',()=>{
 const memory=storage(),store=preferences.tablePreferenceStore(memory,9);
 store.save('returns',{hidden:['supplier'],density:'compact'});
 const saved=[...memory.data],close={},reset={},summary={focus(){this.focused=true;}};
 const menu={open:true,querySelector:selector=>selector==='[data-table-close]'?close:selector==='[data-table-reset]'?reset:summary,querySelectorAll:()=>[],addEventListener(){}};
 const root={dataset:{},querySelector:()=>menu,querySelectorAll:()=>[]};
 preferences.bindTableControls({storage:memory,session:{user:{id:9}}},root,'returns');
 assert.equal(typeof close.onclick,'function','touch users need a visible close action');
 close.onclick();
 assert.equal(menu.open,false);assert.equal(summary.focused,true);
 assert.deepEqual([...memory.data],saved);
});


test('disposal preferences remain separate from existing returns and cannot hide identity or actions',()=>{
 const memory=storage(),owner=preferences.tablePreferenceStore(memory,7);
 owner.save('returns',{hidden:['supplier'],density:'comfortable'});
 owner.save('disposals',{hidden:['serial','mode','identity','actions'],density:'compact'});
 assert.deepEqual(owner.read('disposals'),{hidden:['serial','mode'],density:'compact'});
 assert.deepEqual(owner.read('returns'),{hidden:['supplier'],density:'comfortable'});
 assert.deepEqual(preferences.tablePreferenceStore(memory,8).read('disposals'),{hidden:[],density:'comfortable'});
 owner.reset('disposals');assert.deepEqual(owner.read('returns'),{hidden:['supplier'],density:'comfortable'});
});
