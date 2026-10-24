import test from 'node:test';
import assert from 'node:assert/strict';
import {matchesReturnScope,parseDesignRoute} from '../dist/public/design.js';
import {savedFilterStore} from '../dist/public/workspace-tools.js';
test('today queue keeps its canonical filter and excludes closed or other-day returns',()=>{
 assert.equal(parseDesignRoute('#returns?scope=today').scope,'today');
 for(const [row,expected] of [[{isClosed:false,dueDate:'2026-10-13'},true],[{isClosed:true,dueDate:'2026-10-13'},false],[{isClosed:false,dueDate:'2026-10-12'},false],[{isClosed:false},false]])assert.equal(matchesReturnScope(row,'today','2026-10-13'),expected);
});
test('saving the due-today view keeps its day filter when restored',()=>{
 const data=new Map(),store=savedFilterStore({getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)},7);
 const result=store.save('Today',{view:'returns',scope:'today'});assert.equal(result.ok,true);assert.equal(store.list()[0].state.scope,'today');
});
