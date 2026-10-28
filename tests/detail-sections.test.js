import test from 'node:test';
import assert from 'node:assert/strict';
import * as ui from '../dist/public/ui.js';
import {setLanguage} from '../dist/public/i18n.js';

function surface(){
 const panels=['overview','history','communication'].map(key=>({dataset:{detailPanel:key},hidden:false,draft:{value:'unsaved comment'},set innerHTML(value){throw Error('Panel content must not be replaced');}}));
 const tabs=panels.map(panel=>({dataset:{detailTab:panel.dataset.detailPanel},attrs:{},tabIndex:0,focus(){this.focused=true;},setAttribute(key,value){this.attrs[key]=String(value);},getAttribute(key){return this.attrs[key]??null;}}));
 const body={scrollTop:150};
 const root={querySelectorAll:selector=>selector==='[data-detail-tab]'?tabs:selector==='[data-detail-panel]'?panels:[],querySelector:selector=>selector==='.dialog-body'?body:null};
 return {root,tabs,panels,body};
}
function bind(f){assert.equal(typeof ui.bindDetailSections,'function','shared detail navigation must exist');return ui.bindDetailSections(f.root);}

test('detail navigation exposes one selected section with labelled tabs in both languages',()=>{
 assert.equal(typeof ui.detailSections,'function');
 try{for(const language of ['de','en']){setLanguage(language);const markup=String(ui.detailSections([{key:'overview',label:'Übersicht',content:'<p>Overview data</p>'},{key:'history',label:'Verlauf',content:'<p>History data</p>'}]));
 assert.match(markup,/role="tablist"/);assert.match(markup,/role="tab"[^>]*aria-selected="true"/);assert.match(markup,/aria-controls="detail-panel-history"/);assert.match(markup,/role="tabpanel"[^>]*aria-labelledby="detail-tab-history"[^>]*hidden/);assert.ok(markup.includes(language==='de'?'Übersicht':'Overview'));assert.ok(markup.includes('<p>History data</p>'));}}
 finally{setLanguage('de');}
});

test('switching detail sections preserves comment drafts and shows only the selected content',()=>{
 const f=surface(),draft=f.panels[2].draft,show=bind(f);
 assert.deepEqual(f.panels.map(x=>x.hidden),[false,true,true]);
 f.tabs[2].onclick();assert.deepEqual(f.panels.map(x=>x.hidden),[true,true,false]);assert.equal(f.panels[2].draft,draft);assert.equal(draft.value,'unsaved comment');assert.equal(f.body.scrollTop,0);
 show('history',true);assert.deepEqual(f.panels.map(x=>x.hidden),[true,false,true]);assert.equal(f.tabs[1].focused,true);assert.equal(f.tabs[1].attrs['aria-selected'],'true');assert.deepEqual(f.tabs.map(x=>x.tabIndex),[-1,0,-1]);
 assert.equal(show('missing'),false);assert.deepEqual(f.panels.map(x=>x.hidden),[true,false,true]);
});

test('detail tabs support wrapping arrow keys and Home End without intercepting other keys',()=>{
 const f=surface();bind(f);let prevented=0;
 const key=(index,key)=>f.tabs[index].onkeydown({key,preventDefault(){prevented++;}});
 key(0,'ArrowLeft');assert.equal(f.tabs[2].attrs['aria-selected'],'true');assert.equal(f.tabs[2].focused,true);
 key(2,'ArrowRight');assert.equal(f.tabs[0].attrs['aria-selected'],'true');
 key(0,'End');assert.equal(f.tabs[2].attrs['aria-selected'],'true');
 key(2,'Home');assert.equal(f.tabs[0].attrs['aria-selected'],'true');
 key(0,'Tab');assert.equal(prevented,4);
});
