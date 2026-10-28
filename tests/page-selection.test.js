import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceModule} from './helpers/source-module.js';
const workflow=await sourceModule("export * from './frontend/src/workflow-actions.ts';");

function fixture(){
 assert.equal(typeof workflow.syncPageSelection,'function');
 const controls=[{checked:false,indeterminate:false},{checked:false,indeterminate:false}];
 const root={querySelectorAll(selector){assert.equal(selector,'[data-select-page]');return controls;}};
 const selection=workflow.createReturnSelection();
 return {selection,controls,sync:ids=>workflow.syncPageSelection(root,selection,ids)};
}
function state(controls,checked,indeterminate){
 for(const control of controls)assert.deepEqual(control,{checked,indeterminate});
}
test('desktop and mobile page controls stay aligned for empty, mixed and full selection',()=>{
 const f=fixture(),ids=[1,2,3];
 f.sync(ids);state(f.controls,false,false);
 f.selection.choose(1,true);f.sync(ids);state(f.controls,false,true);
 f.selection.togglePage(ids,true);f.sync(ids);state(f.controls,true,false);
 f.selection.choose(2,false);f.sync(ids);state(f.controls,false,true);
 f.selection.clear();f.sync(ids);state(f.controls,false,false);
});
test('page controls reflect only the displayed page without dropping selections elsewhere',()=>{
 const f=fixture();f.selection.choose(90,true);
 f.sync([]);state(f.controls,false,false);
 f.sync([1,2]);state(f.controls,false,false);
 f.selection.togglePage([1,2],true);f.sync([1,2]);state(f.controls,true,false);
 assert.deepEqual(f.selection.ids(),[1,2,90]);
 f.selection.togglePage([1,2],false);f.sync([1,2]);state(f.controls,false,false);
 assert.deepEqual(f.selection.ids(),[90]);
});
test('changing pages and responsive presentation replaces stale mixed states in every control',()=>{
 const f=fixture();f.selection.togglePage([1,2],true);f.sync([1,2]);state(f.controls,true,false);
 f.sync([3,4]);state(f.controls,false,false);
 f.selection.choose(3,true);f.sync([3,4]);state(f.controls,false,true);
 f.sync([1,2]);state(f.controls,true,false);
});
