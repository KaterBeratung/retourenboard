import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceModule} from './helpers/source-module.js';
const {createSectionTransition}=await sourceModule("export * from './frontend/src/section-transition.ts';");

// A page whose decorations record their animations; querySelectorAll answers per selector like the real DOM.
function overviewPage(){
 const effects=[];
 const element=(extra={})=>({isConnected:true,...extra,animate(frames,options){const effect={target:this,frames,options,cancelled:false,cancel(){this.cancelled=true;},finished:new Promise(()=>{})};effects.push(effect);return effect;}});
 const count=element({textContent:'12'}),money=element({textContent:'1.234,50 €'}),zero=element({textContent:'0'});
 const icon=element(),workflowBar=element(),reasonBar=element(),monthBar=element(),eyebrow=element(),summary=element(),heading=element();
 const parts={'.workspace-overview .kpi>strong':[count,money,zero],'.workspace-overview .kpi-icon':[icon],'.workspace-overview .workflow-bar':[workflowBar],'.workspace-overview .reason-bar':[reasonBar],'.workspace-overview .month-bar':[monthBar],'.page-heading .eyebrow':[eyebrow],'.page-heading p':[summary]};
 const root={querySelector:selector=>selector==='.page-heading h1'?heading:null,querySelectorAll:selector=>parts[selector]??[],animate(){assert.fail('The interactive workspace must never animate');}};
 return {root,effects,count,money,zero,icon,workflowBar,reasonBar,monthBar,eyebrow,summary,heading};
}
// Runs the frame loop by hand: each call hands the queued callbacks a timestamp.
function frames(){
 const queue=[];const original=globalThis.requestAnimationFrame;
 globalThis.requestAnimationFrame=callback=>queue.push(callback);
 return {tick(time){for(const callback of queue.splice(0))callback(time);},pending:()=>queue.length,restore(){if(original===undefined)delete globalThis.requestAnimationFrame;else globalThis.requestAnimationFrame=original;}};
}

test('overview decorations enter once: whole numbers count up, icons pop in, bars are drawn, and no tile ever moves',async()=>{
 const loop=frames();
 try{
  const page=overviewPage(),motion=createSectionTransition(page.root,{},()=>true);
  const started=performance.now();
  await motion.run('overview',()=>{});
  const byTarget=target=>page.effects.filter(effect=>effect.target===target);
  assert.equal(page.count.textContent,'0','the count starts at zero');
  assert.equal(byTarget(page.count).length,0,'a whole number counts instead of fading');
  assert.deepEqual(byTarget(page.money)[0].frames,[{opacity:.35},{opacity:1}],'currency fades in');
  assert.deepEqual(byTarget(page.zero)[0].frames,[{opacity:.35},{opacity:1}],'zero has nothing to count and fades in');
  assert.deepEqual(byTarget(page.icon)[0].frames,[{opacity:0,scale:.6},{opacity:1,scale:1}]);
  assert.equal(byTarget(page.icon)[0].options.fill,'backwards','icons stay hidden until their turn');
  assert.deepEqual(byTarget(page.workflowBar)[0].frames[0],{clipPath:'inset(0 100% 0 0)'});
  assert.deepEqual(byTarget(page.reasonBar)[0].frames[0],{clipPath:'inset(0 100% 0 0)'});
  assert.deepEqual(byTarget(page.monthBar)[0].frames[0],{clipPath:'inset(100% 0 0 0)'}, 'month bars rise from the baseline');
  for(const effect of page.effects)assert.ok(effect.frames.every(frame=>frame.transform===undefined&&frame.translate===undefined),'Entrances fade, scale or reveal; they never move a click target');

  loop.tick(started+150);
  const midway=Number(page.count.textContent);assert.ok(midway>0&&midway<12,'the number is on its way: '+page.count.textContent);
  loop.tick(started+5000);
  assert.equal(page.count.textContent,'12','the count always ends on the real value');
  assert.equal(loop.pending(),0,'the frame loop stops when finished');

  const before=page.effects.length;
  await motion.run('overview',()=>{});assert.equal(page.effects.length,before,'live refreshes do not replay the entrance');
  motion.cancel();assert.ok(page.effects.every(effect=>effect.cancelled));
 }finally{loop.restore();}
});

test('a count in progress ends on its real value when the page is left, replaced or motion is switched off',async()=>{
 const loop=frames();
 try{
  for(const interrupt of ['navigate','replace','off']){
   const page=overviewPage();let allowed=true;const motion=createSectionTransition(page.root,{},()=>allowed);
   await motion.run('overview',()=>{});assert.equal(page.count.textContent,'0');
   if(interrupt==='navigate')await motion.run('products',()=>{});
   if(interrupt==='replace')page.count.isConnected=false;
   if(interrupt==='off')allowed=false;
   loop.tick(performance.now());
   assert.equal(page.count.textContent,'12',interrupt);assert.equal(loop.pending(),0,interrupt);
  }
 }finally{loop.restore();}
});

test('a throttled frame loop cannot leave a figure at zero',async()=>{
 const original=globalThis.requestAnimationFrame;
 globalThis.requestAnimationFrame=()=>1;
 const timers=[],setTimer=globalThis.setTimeout;globalThis.setTimeout=(callback)=>{timers.push(callback);return timers.length;};
 try{
  const page=overviewPage(),motion=createSectionTransition(page.root,{},()=>true);
  await motion.run('overview',()=>{});assert.equal(page.count.textContent,'0');
  for(const callback of timers)callback();
  assert.equal(page.count.textContent,'12','the safety timer restores the value');
 }finally{globalThis.setTimeout=setTimer;if(original===undefined)delete globalThis.requestAnimationFrame;else globalThis.requestAnimationFrame=original;}
});

test('without frames or with reduced motion the overview shows its real figures and starts no animation',async()=>{
 const loop=frames();
 try{
  const page=overviewPage();let allowed=false;const motion=createSectionTransition(page.root,{},()=>allowed);
  await motion.run('overview',()=>{});assert.equal(page.effects.length,0);assert.equal(page.count.textContent,'12');assert.equal(loop.pending(),0);
  allowed=true;await motion.run('returns',()=>{});await motion.run('overview',()=>{});assert.ok(page.effects.length>0);
  const entered=[...page.effects];
  await motion.run('products',()=>{});assert.ok(entered.every(effect=>effect.cancelled),'leaving cancels every decoration');
 }finally{loop.restore();}
});

test('a new page lets its label and summary settle just after the title',async()=>{
 const page=overviewPage(),motion=createSectionTransition(page.root,{},()=>true);
 await motion.run('overview',()=>{});await motion.run('returns',()=>{});
 const nudges=page.effects.filter(effect=>[page.heading,page.eyebrow,page.summary].includes(effect.target));
 assert.deepEqual(nudges.map(effect=>effect.target),[page.heading,page.eyebrow,page.summary]);
 assert.ok(nudges.every(effect=>effect.frames.every(frame=>frame.opacity===undefined&&frame.transform===undefined)),'only non-interactive text moves, and it never fades out');
 assert.ok(nudges[2].options.delay>nudges[1].options.delay,'the sentence follows the label');
});
