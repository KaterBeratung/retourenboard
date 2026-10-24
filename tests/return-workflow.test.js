import test from 'node:test';
import assert from 'node:assert/strict';
import * as display from '../dist/public/inventory-display.js';
import {english} from '../dist/public/i18n-catalog.js';
import {addTranslations,setLanguage,refreshTranslations} from '../dist/public/i18n.js';

addTranslations(english);
test('return timing shows creation time separately from the optional receipt date',()=>{
  assert.equal(typeof display.returnTiming,'function','Return timing renderer is available');
  const row={createdAt:'2026-10-09T08:15:00Z',receiptDate:'2026-10-01'};
  const rendered=String(display.returnTiming(row));
  assert.match(rendered,/datetime="2026-10-09T08:15:00Z"/);
  assert.match(rendered,/Erfasst|return-time/);
  assert.match(rendered.replace(/<!--[\s\S]*?-->/g,''),/Eingang: 01\.10\.2026/);
  assert.doesNotMatch(String(display.returnTiming({...row,receiptDate:''})),/Eingang:/);
  assert.doesNotMatch(String(display.returnTiming(row,true)),/Eingang:/);
  assert.equal(row.createdAt,'2026-10-09T08:15:00Z');
});
test('missing and invalid creation times never borrow the receipt date or render Invalid Date',()=>{
  assert.equal(typeof display.returnTimestamp,'function','Timestamp renderer is available');
  for(const value of [undefined,'','not-a-date','<script>'])assert.equal(String(display.returnTimestamp(value)),'—');
  assert.match(String(display.returnTimestamp('2026-10-09T08:15:00Z')),/<time datetime="2026-10-09T08:15:00Z">/);
});
test('creation and receipt dates change language in an already rendered view',()=>{
 setLanguage('de');
 const output=String(display.returnTiming({createdAt:'2026-10-09T08:15:00Z',receiptDate:'2026-10-01'}));
 const comments=[...output.matchAll(/<!--rb-i18n:([^>]+)-->(.*?)<!--\/rb-i18n-->/g)].map(match=>({data:'rb-i18n:'+match[1],nextSibling:{nodeType:3,nodeValue:match[2]}}));
 const created=comments.find(node=>node.nextSibling.nodeValue==='09.10.2026');
 const received=comments.find(node=>node.nextSibling.nodeValue==='01.10.2026');
 assert.ok(created,'Creation date participates in the live language refresh');
 assert.ok(received,'Receipt date participates in the live language refresh');
 const root={createTreeWalker(){let i=0;return {nextNode:()=>comments[i++]};},querySelectorAll:()=>[]};
 try{setLanguage('en');refreshTranslations(root);assert.equal(created.nextSibling.nodeValue,'09/10/2026');assert.equal(received.nextSibling.nodeValue,'01/10/2026');}finally{setLanguage('de');}
});
test('workflow orders open stages before closed stages without losing custom or archived used statuses',()=>{
  assert.equal(typeof display.workflowStatuses,'function','Workflow ordering is available');
  const entries=[
    {id:1,name:'Fertig',active:true,isClosed:true,tone:'done'},
    {id:2,name:'Warten',active:true,isClosed:false,tone:'neutral'},
    {id:3,name:'Prüfen',active:true,isClosed:false,tone:'checking'},
    {id:4,name:'Eingang',active:true,isClosed:false,tone:'received'},
    {id:5,name:'Alte Bearbeitung',active:false,isClosed:false,tone:'working'},
    {id:6,name:'Nicht verwendet',active:false,isClosed:false,tone:'received'}
  ];
  const rows=[{statusId:5,status:'Alte Bearbeitung'},{statusId:1,status:'Fertig'}];
  assert.deepEqual(display.workflowStatuses(entries,rows).map(s=>s.id),[4,3,5,2,1]);
  assert.deepEqual(entries.map(s=>s.id),[1,2,3,4,5,6]);
});
test('workflow counts use status IDs, exposes direct filters and separates completed returns',()=>{
  assert.equal(typeof display.renderReturnWorkflow,'function','Workflow renderer is available');
  const entries=[{id:12,name:'Eingegangen',active:true,tone:'received',isClosed:false},{id:15,name:'Abgeschlossen',active:true,tone:'done',isClosed:true}];
  const rows=[{statusId:12,status:'Alter Name'},{statusId:12,status:'Eingegangen'},{statusId:15,status:'Abgeschlossen'}];
  const output=String(display.renderReturnWorkflow(entries,rows));
  assert.match(output,/data-workflow-status="Eingegangen"/);
  assert.match(output,/workflow-count">2</);
  assert.match(output,/Offene Vorgänge/);
  assert.match(output,/Abgeschlossen/);
  assert.doesNotMatch(output,/<progress/);
  assert.match(String(display.renderReturnWorkflow([{id:25,name:'<img onerror=bad>',active:true,tone:'unknown'}],[])),/&lt;img onerror=bad&gt;/);
  try {setLanguage('en');assert.match(String(display.renderReturnWorkflow(entries,rows)),/Open returns/);}finally{setLanguage('de');}
});
