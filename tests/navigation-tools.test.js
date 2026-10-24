import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceModule} from './helpers/source-module.js';

const tools=await sourceModule("export * from './frontend/src/navigation-tools.ts';");

test('admin data tools show only permitted actions without a second sidebar group',()=>{
  assert.equal(typeof tools.renderDataTools,'function');
  const ctx={unlocked:true,can:key=>key==='returnsImport'};
  const markup=String(tools.renderDataTools(ctx));
  assert.match(markup,/data-tool-action="import"/);
  assert.doesNotMatch(markup,/data-tool-action="export"|id="sidebar-import"|<details|<summary/);
  ctx.can=key=>key==='productsExport';
  assert.match(String(tools.renderDataTools(ctx)),/data-tool-action="export"/);
  assert.doesNotMatch(String(tools.renderDataTools(ctx)),/data-tool-action="import"/);
  ctx.unlocked=false;
  assert.doesNotMatch(String(tools.renderDataTools(ctx)),/data-tool-action=/);
});

test('admin and workspace tools use per-entity rights and never expose locked actions',()=>{
  assert.equal(typeof tools.navigationToolRights,'function');
  const permissions=new Set(['returnsImport','productsExport']);
  const ctx={unlocked:true,can:key=>permissions.has(key)};
  assert.deepEqual(tools.navigationToolRights(ctx),{import:true,export:true});
  permissions.delete('returnsImport');
  assert.deepEqual(tools.navigationToolRights(ctx),{import:false,export:true});
  ctx.unlocked=false;
  assert.deepEqual(tools.navigationToolRights(ctx),{import:false,export:false});
  ctx.unlocked=true;
  assert.deepEqual(tools.navigationToolRights(ctx,false),{import:false,export:false});
});

test('data-tool actions recheck current rights before opening existing workflows',()=>{
  assert.equal(typeof tools.bindDataTools,'function');
  const calls=[],buttons=['import','export'].map(action=>({dataset:{toolAction:action},addEventListener(type,callback){this.click=callback;}}));
  const rights=new Set(['returnsImport','productsExport']),ctx={unlocked:true,can:key=>rights.has(key),ensureUnlocked:fn=>fn()};
  tools.bindDataTools(ctx,{querySelectorAll:()=>buttons},{import:()=>calls.push('import'),export:()=>calls.push('export')});
  buttons[0].click();buttons[1].click();assert.deepEqual(calls,['import','export']);
  rights.clear();buttons[0].click();buttons[1].click();assert.equal(calls.length,2);
  rights.add('returnsImport');ctx.ensureUnlocked=fn=>{rights.clear();fn();};buttons[0].click();assert.equal(calls.length,2);
});
