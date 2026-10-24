import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceModule} from './helpers/source-module.js';
const {createSectionTransition}=await sourceModule("export * from './frontend/src/section-transition.ts';");
test('overview numbers enter once, without moving cards, and do not replay during live refresh',async()=>{
 const effects=[];const value={animate(frames,options){const effect={frames,options,cancelled:false,cancel(){this.cancelled=true;},finished:new Promise(()=>{})};effects.push(effect);return effect;}};
 const root={querySelector:()=>null,querySelectorAll:()=>[value],animate(){assert.fail('The interactive workspace must never animate');}};
 const motion=createSectionTransition(root,{},()=>true);await motion.run('overview',()=>{});assert.equal(effects.length,1);
 assert.ok(effects[0].frames.every(frame=>frame.transform===undefined&&frame.translate===undefined),'Number entrances only fade; click targets never move');
 await motion.run('overview',()=>{});assert.equal(effects.length,1);motion.cancel();assert.equal(effects[0].cancelled,true);
});
test('overview respects reduced motion and cancels its values on navigation',async()=>{
 const effects=[],root={querySelector:()=>null,querySelectorAll:()=>[{animate(){let e={cancelled:false,cancel(){this.cancelled=true;},finished:new Promise(()=>{})};effects.push(e);return e;}}]};
 let allowed=false;const motion=createSectionTransition(root,{},()=>allowed);await motion.run('overview',()=>{});assert.equal(effects.length,0);
 allowed=true;await motion.run('returns',()=>{});await motion.run('overview',()=>{});assert.equal(effects.length,1);await motion.run('products',()=>{});assert.equal(effects[0].cancelled,true);
});
