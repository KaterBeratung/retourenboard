import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceModule} from './helpers/source-module.js';
const {bindIconMotion}=await sourceModule("export * from './frontend/src/icon-motion.ts';");

// Node has no DOM or CSSAnimation timeline. Only those browser boundaries are
// supplied here; delegation, eligibility and animation lifecycle use real code.
function fixture(){
 const listeners=new Map();let changed;
 const root={documentElement:{dataset:{motion:'normal'}},defaultView:{MutationObserver:class{constructor(callback){changed=callback;}observe(){}}},addEventListener(type,fn){listeners.set(type,fn);}};
 const control={nodeType:1,disabled:false,copied:false,keyboard:true,board:true,icons:[],closest(selector){return selector==='[data-ui="board"]'?(this.board?{}:null):this;},matches(selector){return selector.includes(':disabled')?this.disabled||this.copied:selector===':focus-visible'&&this.keyboard;},contains(node){return node===this||this.icons.includes(node);},querySelectorAll(){return this.icons;}};
 function icon(owner=control,{name='board-symbol-turn',pending=true}={}){
  let done,reject;const effect={animationName:name,cancelled:false,finished:pending?new Promise((resolve,fail)=>{done=resolve;reject=fail;}):Promise.resolve(),cancel(){this.cancelled=true;reject?.();}};
  effect.finished.catch(()=>{});
  const value={nodeType:1,dataset:{},starts:0,closest(selector){return selector.includes(':disabled')?owner.matches(selector)?owner:null:owner;},setAttribute(name,value){assert.equal(name,'data-icon-motion');this.dataset.iconMotion=value;this.starts++;},removeAttribute(name){assert.equal(name,'data-icon-motion');delete this.dataset.iconMotion;},getAnimations(options){assert.deepEqual(options,{subtree:true});return [effect];}};
  owner.icons.push(value);return {value,effect,finish:()=>done?.()};
 }
 bindIconMotion(root);
 return {root,control,icon,emit(type,target=control,extra={}){listeners.get(type)?.({target,pointerType:'mouse',relatedTarget:null,...extra});},changeMotion(value){root.documentElement.dataset.motion=value;changed?.();}};
}
const settle=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};

test('pointer exit lets icon artwork finish while another pointer entry cannot restart it',async()=>{
 const f=fixture(),a=f.icon();f.emit('pointerover');assert.equal(a.value.dataset.iconMotion,'active');f.emit('pointerout');f.emit('pointerover');assert.equal(a.value.starts,1);assert.equal(a.effect.cancelled,false);
 a.finish();await settle();assert.equal(a.value.dataset.iconMotion,undefined);f.emit('pointerover');assert.equal(a.value.starts,2);
});
test('moving between children of a control and focusing with a pointer do not replay its animation',()=>{
 const f=fixture(),a=f.icon();f.emit('pointerover',f.control,{relatedTarget:a.value});assert.equal(a.value.starts,0);f.control.keyboard=false;f.emit('focusin');assert.equal(a.value.starts,0);f.control.keyboard=true;f.emit('focusin');assert.equal(a.value.starts,1);
});
test('touch plays once on release, without hover movement or intercepting the control action',()=>{
 const f=fixture(),a=f.icon();f.emit('pointerover',f.control,{pointerType:'touch'});assert.equal(a.value.starts,0);f.emit('pointerup',f.control,{pointerType:'touch'});assert.equal(a.value.starts,1);f.emit('pointerup',f.control,{pointerType:'mouse'});assert.equal(a.value.starts,1);
});
test('disabled controls, copy confirmation and non-board surfaces keep their own feedback',()=>{
 const f=fixture(),a=f.icon();f.control.disabled=true;f.emit('pointerover');assert.equal(a.value.starts,0);f.control.disabled=false;f.control.copied=true;f.emit('pointerover');assert.equal(a.value.starts,0);f.control.copied=false;f.control.board=false;f.emit('pointerover');assert.equal(a.value.starts,0);
});
test('nested controls animate only the closest action and never the surrounding menu icons',()=>{
 const f=fixture(),outer=f.icon();const inner={...f.control,icons:[]};const nested=f.icon(inner);f.control.icons.push(nested.value);f.emit('pointerover');assert.equal(outer.value.starts,1);assert.equal(nested.value.starts,0);
});
test('disabling motion cancels active artwork immediately and prevents subsequent animation',async()=>{
 const f=fixture(),a=f.icon();f.emit('pointerover');f.changeMotion('reduce');assert.equal(a.effect.cancelled,true);assert.equal(a.value.dataset.iconMotion,undefined);f.emit('pointerover');assert.equal(a.value.starts,1);await settle();
});
test('animation cancellation cleans up and unrelated color transitions do not hold the icon active',async()=>{
 const f=fixture(),a=f.icon();f.emit('pointerover');a.effect.cancel();await settle();assert.equal(a.value.dataset.iconMotion,undefined);
 const other=fixture(),color=other.icon(other.control,{name:'color-transition',pending:false});other.emit('pointerover');await settle();assert.equal(color.value.dataset.iconMotion,undefined);
});
test('rebinding the document does not attach duplicate interactions',()=>{
 const f=fixture(),a=f.icon();bindIconMotion(f.root);f.emit('pointerover');assert.equal(a.value.starts,1);
});
