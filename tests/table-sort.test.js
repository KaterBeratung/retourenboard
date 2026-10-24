import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceModule} from './helpers/source-module.js';
const sorting=await sourceModule("export * from './frontend/src/table-sort.ts'; export {setLanguage} from './frontend/src/i18n.js'; import {addTranslations} from './frontend/src/i18n.js'; import {english} from './frontend/src/i18n-catalog.js'; addTranslations(english);").catch(()=>({}));
const ids=rows=>rows.map(row=>row.id);
test('numeric and date sorting is stable, puts missing values last and leaves inventory untouched',()=>{
 assert.equal(typeof sorting.sortInventoryRows,'function');
 const rows=[{id:1,priceCents:900},{id:2,priceCents:20},{id:3,priceCents:20},{id:4,priceCents:null}];
 assert.deepEqual(ids(sorting.sortInventoryRows(rows,'products',{key:'price',direction:'asc'})),[2,3,1,4]);
 assert.deepEqual(ids(sorting.sortInventoryRows(rows,'products',{key:'price',direction:'desc'})),[1,2,3,4]);assert.deepEqual(ids(rows),[1,2,3,4]);
 const dates=[{id:1,createdAt:'2026-02-01T09:00:00Z'},{id:2,createdAt:'2025-12-02T09:00:00Z'},{id:3,createdAt:'invalid'}];
 assert.deepEqual(ids(sorting.sortInventoryRows(dates,'returns',{key:'received',direction:'asc'})),[2,1,3]);
 assert.deepEqual(ids(sorting.sortInventoryRows(dates,'returns',{key:'received',direction:'desc'})),[1,2,3]);
});
test('sorting uses visible localized labels and natural numeric identifiers',()=>{
 assert.equal(typeof sorting.sortInventoryRows,'function');
 const rows=[{id:1,returnNumber:'RET-10',status:'Zed'},{id:2,returnNumber:'RET-2',status:'Alpha'}];
 assert.deepEqual(ids(sorting.sortInventoryRows(rows,'returns',{key:'identity',direction:'asc'})),[2,1]);
 // The label callback is also how the table supplies editable master-data labels.
 assert.deepEqual(ids(sorting.sortInventoryRows(rows,'returns',{key:'status',direction:'asc'},{label:row=>row.id===1?'A translated label':'Z custom label'})),[1,2]);
});
test('table sort preferences remain scoped by account and table; invalid keys restore original order',()=>{
 assert.equal(typeof sorting.tableSortStore,'function');
 const memory=new Map(),storage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value)};
 const one=sorting.tableSortStore(storage,1),two=sorting.tableSortStore(storage,2);
 assert.equal(one.save('products',{key:'price',direction:'desc'}),true);assert.deepEqual(one.read('products'),{key:'price',direction:'desc'});
 assert.deepEqual(one.read('returns'),{key:'',direction:'asc'});assert.deepEqual(two.read('products'),{key:'',direction:'asc'});
 one.save('returns',{key:'price',direction:'desc'});assert.deepEqual(one.read('returns'),{key:'',direction:'asc'});
 assert.deepEqual(ids(sorting.sortInventoryRows([{id:1},{id:2}],'products',{key:'x] *',direction:'desc'})),[1,2]);
 for(const key of memory.keys())memory.set(key,'broken');assert.deepEqual(one.read('products'),{key:'',direction:'asc'});
 assert.equal(sorting.tableSortStore({getItem(){throw Error();},setItem(){throw Error();}},1).save('products',{}),false);
 assert.equal(sorting.tableSortStore(storage,null).save('products',{}),false);
});
test('column headers communicate their sort direction and mobile controls expose the same choices',()=>{
 assert.equal(typeof sorting.sortableHeading,'function');assert.equal(typeof sorting.renderMobileSorting,'function');
 const heading=String(sorting.sortableHeading('products','price',{key:'price',direction:'desc'})).replace(/<!--.*?-->/g,'');
 assert.match(heading,/aria-sort="descending"/);assert.match(heading,/data-sort-key="price"/);assert.match(heading,/>Preis</);
 const mobile=String(sorting.renderMobileSorting('returns',{key:'received',direction:'asc'})).replace(/<!--.*?-->/g,'');
 assert.match(mobile,/data-mobile-sort/);assert.match(mobile,/value="received" selected/);assert.match(mobile,/value="serial"/);
 sorting.setLanguage('en');try{assert.match(String(sorting.sortableHeading('products','price',{key:'',direction:'asc'})),/Price/);}finally{sorting.setLanguage('de');}
});
test('denied sort storage still sorts the current session without leaking transient choices to another account',()=>{
 const ctx={session:{user:{id:1}},authGeneration:1,storage:null};
 assert.equal(sorting.setInventorySort(ctx,'products',{key:'price',direction:'desc'}),false);
 assert.deepEqual(sorting.readInventorySort(ctx,'products'),{key:'price',direction:'desc'});
 ctx.session.user.id=2;assert.deepEqual(sorting.readInventorySort(ctx,'products'),{key:'',direction:'asc'});
 sorting.setInventorySort(ctx,'products',{key:'price',direction:'asc'});ctx.authGeneration=2;
 assert.deepEqual(sorting.readInventorySort(ctx,'products'),{key:'',direction:'asc'});
});
