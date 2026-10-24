import test from 'node:test';
import assert from 'node:assert/strict';

const previousDocument=globalThis.document,previousWindow=globalThis.window;
globalThis.document={querySelector:()=>null,querySelectorAll:()=>[],getElementById:()=>null,addEventListener(){},createTreeWalker:()=>({nextNode:()=>null}),documentElement:{lang:'de',dataset:{},style:{}}};
globalThis.window={matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}})};
let site;
try{site=await import('../website/dist/site.js');}finally{globalThis.document=previousDocument;globalThis.window=previousWindow;}

function fixture(){
 const events={},queryEvents={},menuEvents={},inside={inside:true},link={inside:true,closest:()=>({})};
 const summary={focused:false,focus(){this.focused=true;}};
 const menu={open:false,contains:target=>target?.inside===true,querySelector:()=>summary,addEventListener(name,fn){menuEvents[name]=fn;}};
 const page={querySelector:()=>menu,addEventListener(name,fn){events[name]=fn;}};
 const query={matches:true,addEventListener(name,fn){queryEvents[name]=fn;}};
 assert.equal(typeof site.bindMobileMenu,'function');site.bindMobileMenu(page,query);
 return {menu,summary,events,menuEvents,queryEvents,inside,link};
}

test('Escape closes the mobile menu and restores focus only while it is open',()=>{
 const f=fixture();f.events.keydown({key:'Escape'});assert.equal(f.summary.focused,false);
 f.menu.open=true;f.events.keydown({key:'Escape'});assert.equal(f.menu.open,false);assert.equal(f.summary.focused,true);
});
test('mobile navigation closes after a link or outside click but preserves interactions inside',()=>{
 const f=fixture();f.menu.open=true;f.events.click({target:f.inside});assert.equal(f.menu.open,true);
 f.menuEvents.click({target:f.link});assert.equal(f.menu.open,false);
 f.menu.open=true;f.events.click({target:{}});assert.equal(f.menu.open,false);
});
test('changing the layout breakpoint resets an open menu',()=>{
 const f=fixture();f.menu.open=true;f.queryEvents.change();assert.equal(f.menu.open,false);
});
