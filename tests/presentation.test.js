import test from 'node:test';
import assert from 'node:assert/strict';
const ui=await import('../dist/public/presentation.js').catch(()=>({}));

test('action tooltips stay inside narrow viewports and move below controls near the top edge',()=>{
 assert.equal(typeof ui.tooltipPosition,'function');
 assert.deepEqual(ui.tooltipPosition({left:2,right:38,top:8,bottom:44},{width:180,height:36},{width:390,height:844}),{left:12,top:52});
 assert.deepEqual(ui.tooltipPosition({left:360,right:388,top:700,bottom:736},{width:180,height:36},{width:390,height:844}),{left:198,top:656});
});
test('copy feedback restores the original icon and a repeated copy cannot be cleared by an older timer',()=>{
 assert.equal(typeof ui.confirmCopied,'function');
 const tasks=[],cancelled=[],button={innerHTML:'original icon',dataset:{},isConnected:true};
 const timers={schedule:fn=>{tasks.push(fn);return tasks.length;},cancel:id=>cancelled.push(id)};
 ui.confirmCopied(button,timers);assert.equal(button.dataset.copyState,'copied');assert.match(String(button.innerHTML),/<svg/);
 ui.confirmCopied(button,timers);tasks[0]();assert.equal(button.dataset.copyState,'copied');
 tasks[1]();assert.equal(button.innerHTML,'original icon');assert.equal(button.dataset.copyState,undefined);assert.deepEqual(cancelled,[1]);
});
test('mobile navigation retains canonical destinations and shows creation only when permitted',()=>{
 assert.equal(typeof ui.mobileActions,'function');
 const reader={can:()=>false};
 const readOnly=String(ui.mobileActions(reader,'returns'));
 for(const path of ['/#overview','/#returns','/#products'])assert.ok(readOnly.includes('href="'+path+'"'));
 assert.doesNotMatch(readOnly,/data-mobile-create/);
 assert.match(readOnly,/href="\/#returns"[^>]*aria-current="page"/);
 assert.match(String(ui.mobileActions({can:key=>key==='returnsCreate'},'overview')),/data-mobile-create="returns"/);
 assert.match(String(ui.mobileActions({can:key=>key==='productsCreate'},'products')),/data-mobile-create="products"/);
 assert.doesNotMatch(String(ui.mobileActions({can:()=>true},'admin')),/data-mobile-create/);
});
