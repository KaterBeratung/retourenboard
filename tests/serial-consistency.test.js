import test from 'node:test';
import assert from 'node:assert/strict';
import {duplicateSerials} from '../dist/public/form-feedback.js';
import {createSerialQueue} from '../dist/public/scan-intake.js';
import {inspectCompletion} from '../dist/shared/return-completion.js';
import {searchInventory} from '../dist/public/workspace-tools.js';

test('serial advisory and scan queue share Unicode comparisons without changing original values',()=>{
 const pairs=[[' Straße-001 ','STRASSE-001'],['äöü-001','ÄÖÜ-001'],['é-001','e\u0301-001'],['ＡＢＣ-001','abc-001'],['ﬀ-001','FF-001'],['σ-001','ς-001']];
 for(const [original,other] of pairs){
  assert.equal(duplicateSerials([{id:1,serialNumber:original}],other).length,1,original);
  assert.equal(duplicateSerials([{id:1,replacementSerialNumber:original}],other).length,1,original);
  assert.equal(duplicateSerials([{id:1,serialNumber:original}],other,1).length,0);
  const queue=createSerialQueue();assert.equal(queue.add([original,other]).added,1,original);
  assert.equal(queue.rows()[0].serialNumber,original.trim());
 }
 for(const [a,b] of [['O-001','0-001'],['A-B','AB'],['A B','AB'],['ä-001','a-001'],['İ-001','I-001']]){
  assert.equal(duplicateSerials([{id:1,serialNumber:a}],b).length,0,a);
  assert.equal(createSerialQueue().add([a,b]).added,2,a);
 }
});

test('linked disposal completion and inventory serial search use the same comparison as lookup',()=>{
 const row={serialNumber:'STRASSE-001',resolutionId:1},masters={resolutions:[{id:1,builtinKey:'resolutions.credit'}]};
 const state=inspectCompletion(row,masters,{},[{status:'completed',serialNumber:'Straße-001'}]);
 assert.equal(state.disposalCheck.mismatched,false);assert.equal(state.ok,true);
 assert.equal(searchInventory({returns:[{id:1,returnNumber:'RET-1',serialNumber:'Straße-001'}]},'STRASSE-001').length,1);
});
