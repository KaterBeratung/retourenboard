import test from 'node:test';
import assert from 'node:assert/strict';
import {setLanguage} from '../dist/public/i18n.js';
const workflow=await import('../dist/public/workflow-actions.js').catch(()=>({}));
test('dynamic selection counts and limit errors are translated into English',()=>{
 setLanguage('en');try{const selection=workflow.createReturnSelection(1);selection.choose(4,true);
 assert.match(String(workflow.selectionToolbar({can:()=>true},selection)),/1 returns selected/);
 assert.throws(()=>selection.choose(5,true),/Up to 1 returns can be selected at a time/);
 }finally{setLanguage('de');}
});
test('saved filter routes preserve independent search, reason, responsibility and product activity',()=>{
 assert.equal(typeof workflow.filterRoute,'function');assert.equal(typeof workflow.readWorkspaceFilter,'function');
 const returns={view:'returns',search:'SN 123 & 456',scope:'overdue',status:'In Prüfung',reason:'Defekt',assignee:'mine'};
 const route=workflow.filterRoute(returns),filter=workflow.readWorkspaceFilter(route);
 for(const [key,value] of Object.entries(returns))assert.equal(filter[key],value);
 const products=workflow.readWorkspaceFilter(workflow.filterRoute({view:'products',search:'Maus',category:'Audio',activity:'archived'}));
 assert.equal(products.activity,'archived');assert.equal(products.category,'Audio');assert.equal(products.reason,'');
});
test('filter parsing rejects unsupported responsibility values and bounds external query text',()=>{
 assert.equal(typeof workflow.readWorkspaceFilter,'function');
 assert.equal(workflow.readWorkspaceFilter('#admin?search=private'),null);
 const result=workflow.readWorkspaceFilter('#returns?assignee=-1&activity=invalid&scope=bogus&search='+encodeURIComponent('x'.repeat(600)));
 assert.equal(result.assignee,'');assert.equal(result.scope,'');assert.ok(result.search.length<=500);
});
test('return selection is bounded and page selections are atomic',()=>{
 assert.equal(typeof workflow.createReturnSelection,'function');
 const selected=workflow.createReturnSelection(3);selected.togglePage([1,2],true);
 assert.throws(()=>selected.togglePage([3,4],true));assert.deepEqual(selected.ids(),[1,2]);
 selected.choose(1,false);selected.choose(3,true);assert.deepEqual(selected.ids(),[2,3]);
 selected.reconcile([3,4]);assert.deepEqual(selected.ids(),[3]);selected.clear();assert.deepEqual(selected.ids(),[]);
});
test('selection toolbar reveals status and CSV actions only with their respective rights',()=>{
 assert.equal(typeof workflow.selectionToolbar,'function');
 const selection=workflow.createReturnSelection();selection.choose(4,true);
 const readonly=String(workflow.selectionToolbar({can:()=>false},selection));assert.doesNotMatch(readonly,/data-bulk-status|data-bulk-export/);
 const exporter=String(workflow.selectionToolbar({can:key=>key==='returnsExport'},selection));
 assert.match(exporter,/data-bulk-export/);assert.doesNotMatch(exporter,/data-bulk-status/);
 assert.match(String(workflow.selectionToolbar({can:key=>key==='returnsStatus'},selection)),/data-bulk-status/);
});
