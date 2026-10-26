import test from 'node:test';
import assert from 'node:assert/strict';

const priorDocument=globalThis.document,priorWindow=globalThis.window;
globalThis.document={querySelector:()=>null,querySelectorAll:()=>[],getElementById:()=>null,addEventListener(){},createTreeWalker:()=>({nextNode:()=>null}),documentElement:{lang:'de',dataset:{},style:{}}};
globalThis.window={matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}})};
let site;
try{site=await import('../website/dist/site.js');}finally{globalThis.document=priorDocument;globalThis.window=priorWindow;}

const consent='retourenboard.website.privacy',theme='retourenboard.website.theme',language='retourenboard.website.language',motion='retourenboard.website.motion';
function fixture(entries=[]){
 const values=new Map(entries),reads=[];let time=Date.UTC(2026,9,24);
 const raw={getItem:key=>{reads.push(key);return values.get(key)??null;},setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
 assert.equal(typeof site.createPreferencePrivacy,'function');
 const privacy=site.createPreferencePrivacy(()=>raw,()=>time);
 return {privacy,values,reads,raw,advance:days=>{time+=days*86400000;}};
}

test('unanswered website privacy choice never reads or writes saved optional preferences',()=>{
 const f=fixture([[theme,'dark']]);assert.equal(f.privacy.state(),null);
 assert.equal(f.privacy.storage.getItem(theme),null);f.privacy.storage.setItem(language,'en');
 assert.equal(f.privacy.storage.getItem(language),'en');assert.equal(f.values.get(language),undefined);
 assert.equal(f.values.get(theme),'dark');assert.deepEqual(f.reads,[consent]);
});

test('explicit preference opt-in saves the current in-memory choices and restores them on a new visit',()=>{
 const f=fixture();f.privacy.storage.setItem(theme,'dark');f.privacy.storage.setItem(language,'en');
 f.privacy.choose(true);assert.equal(f.values.get(theme),'dark');assert.equal(f.values.get(language),'en');
 const visit=site.createPreferencePrivacy(()=>f.raw,()=>Date.UTC(2026,9,24));assert.equal(visit.state(),true);assert.equal(visit.storage.getItem(theme),'dark');
});

test('withdrawal removes only website preferences and keeps the current page usable without persistence',()=>{
 const f=fixture([['application.setting','keep']]);f.privacy.choose(true);f.privacy.storage.setItem(theme,'dark');f.privacy.storage.setItem(motion,'off');
 f.privacy.choose(false);assert.equal(f.privacy.state(),false);
 assert.equal(f.values.has(theme),false);assert.equal(f.values.has(motion),false);assert.equal(f.values.get('application.setting'),'keep');
 assert.equal(f.privacy.storage.getItem(theme),'dark');f.privacy.storage.setItem(language,'en');assert.equal(f.values.has(language),false);
 const visit=site.createPreferencePrivacy(()=>f.raw,()=>Date.UTC(2026,9,24));assert.equal(visit.state(),false);assert.equal(visit.storage.getItem(language),null);
});

test('expired or malformed consent cannot authorize reading optional preferences',()=>{
 const f=fixture();f.privacy.choose(true);f.privacy.storage.setItem(theme,'dark');f.advance(181);
 assert.equal(f.privacy.state(),null);assert.equal(f.values.has(theme),false);f.privacy.storage.setItem(language,'en');assert.equal(f.values.has(language),false);
 for(const value of ['bad-json',JSON.stringify({version:1,preferences:'true',expiresAt:Date.now()+1000}),JSON.stringify({version:9,preferences:true,expiresAt:Date.now()+1000})]){
  const invalid=fixture([[consent,value],[theme,'dark']]);assert.equal(invalid.privacy.state(),null);assert.equal(invalid.privacy.storage.getItem(theme),null);
 }
});

test('a returning visitor with expired consent has old preferences removed without reading them',()=>{
 const f=fixture();f.privacy.choose(true);f.privacy.storage.setItem(theme,'dark');f.reads.length=0;f.advance(181);
 const visit=site.createPreferencePrivacy(()=>f.raw,()=>Date.UTC(2027,3,23));
 assert.equal(visit.state(),null);assert.equal(f.values.has(theme),false);assert.equal(f.values.has(consent),false);assert.deepEqual(f.reads,[consent]);
});

test('blocked browser storage leaves in-page controls usable and never enables optional disk access by default',()=>{
 assert.equal(typeof site.createPreferencePrivacy,'function');
 const p=site.createPreferencePrivacy(()=>{throw Error('Blocked');});assert.equal(p.state(),null);
 p.storage.setItem(theme,'light');assert.equal(p.storage.getItem(theme),'light');assert.doesNotThrow(()=>p.choose(false));assert.equal(p.state(),false);
});

test('a choice withdrawn in another tab prevents subsequent optional writes',()=>{
 const f=fixture();f.privacy.choose(true);const other=site.createPreferencePrivacy(()=>f.raw,()=>Date.UTC(2026,9,24));assert.equal(other.state(),true);
 f.privacy.choose(false);other.sync();assert.equal(other.state(),false);other.storage.setItem(theme,'dark');assert.equal(f.values.has(theme),false);
});

test('privacy storage is limited to recognized preference keys and values',()=>{
 const f=fixture();f.privacy.choose(true);f.privacy.storage.setItem('unrelated','secret');f.privacy.storage.setItem(theme,'invalid');
 assert.equal(f.values.has('unrelated'),false);assert.equal(f.values.has(theme),false);assert.equal(f.privacy.storage.getItem('unrelated'),null);
});


function bannerFixture(privacy){
 const events={},openerEvents={},choiceEvents={};
 const banner={open:false,showCount:0,closeCount:0,focus(){},showModal(){this.open=true;this.showCount++;},close(){this.open=false;this.closeCount++;events.close?.();},addEventListener(name,fn){events[name]=fn;}};
 const opener={hidden:true,focusCount:0,focus(){this.focusCount++;},addEventListener(name,fn){openerEvents[name]=fn;}};
 const choices=['necessary','remember'].map(value=>({dataset:{privacyChoice:value},addEventListener(name,fn){choiceEvents[value]=fn;}}));
 const page={querySelector:selector=>selector==='#privacy-banner'?banner:null,querySelectorAll:selector=>selector==='[data-privacy-open]'?[opener]:choices};
 site.bindPrivacyBanner(page,privacy);
 return {banner,opener,events,open:()=>openerEvents.click(),choose:value=>choiceEvents[value]()};
}

test('a first visit opens the privacy dialog modally without granting storage consent',()=>{
 const f=fixture(),ui=bannerFixture(f.privacy);
 assert.equal(ui.banner.open,true);assert.equal(ui.banner.showCount,1);assert.equal(f.privacy.state(),null);
 assert.deepEqual(f.reads,[consent]);assert.equal(ui.opener.hidden,false);
});

test('saved choices skip the initial dialog, while the footer can reopen it and restore focus after a choice',()=>{
 for(const remember of [true,false]){
  const f=fixture();f.privacy.choose(remember);const ui=bannerFixture(f.privacy);
  assert.equal(ui.banner.open,false);assert.equal(ui.banner.showCount,0);
  ui.open();assert.equal(ui.banner.open,true);ui.choose(remember?'necessary':'remember');
  assert.equal(ui.banner.open,false);assert.equal(f.privacy.state(),!remember);assert.equal(ui.opener.focusCount,1);
 }
});

test('a privacy choice synchronized from another tab closes the modal and a cleared choice reopens it once',()=>{
 const f=fixture(),ui=bannerFixture(f.privacy);
 const other=site.createPreferencePrivacy(()=>f.raw,()=>Date.UTC(2026,9,24));other.choose(false);f.privacy.sync();
 assert.equal(ui.banner.open,false);assert.equal(f.privacy.state(),false);
 f.raw.removeItem(consent);f.privacy.sync();f.privacy.sync();
 assert.equal(ui.banner.open,true);assert.equal(ui.banner.showCount,2);
});

test('dismissing a privacy dialog never grants optional storage and the footer remains available',()=>{
 const f=fixture(),ui=bannerFixture(f.privacy);ui.banner.close();
 assert.equal(f.privacy.state(),null);assert.equal(f.values.has(consent),false);
 ui.open();assert.equal(ui.banner.open,true);ui.choose('necessary');assert.equal(f.privacy.state(),false);
});
