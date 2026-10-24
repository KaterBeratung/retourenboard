import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceModule} from './helpers/source-module.js';
const {bindChatPanels}=await sourceModule("export {bindChatPanels} from './frontend/src/chat.ts';");
const {composer,t}=await sourceModule("import './frontend/src/chat.ts';export {composer} from './frontend/src/collaboration-ui.ts';export {t} from './frontend/src/i18n.js';");

test('the compact composer keeps its translated placeholder when the language changes',()=>{
 const markup=composer(undefined,undefined,{placeholder:t('Nachricht schreiben …')});
 const metadata=markup.match(/data-rb-i18n-placeholder="([^"]+)"/);
 assert.ok(metadata);assert.deepEqual(JSON.parse(decodeURIComponent(metadata[1])),['Nachricht schreiben …','Write a message …']);
 assert.match(composer(),/Schreibe etwas/,'Comment and editing composers retain their complete hint');
});

function fixture(){
 let narrow=true;const attrs={},handlers={};
 const directoryHeading={focus(){this.focused=true;}};
 const draft={value:'Noch nicht gesendet',files:['foto.png']},log={scrollTop:120},search={value:'Lena',focus(){this.focused=true;}},heading={focus(){this.focused=true;}};
 const root={isConnected:true,setAttribute(key,value){attrs[key]=value;},addEventListener(name,fn){handlers[name]=fn;},querySelector(selector){return selector==='.chat-search>span'?directoryHeading:selector==='#chat-search'?search:selector==='.chat-conversation-heading h2'?heading:null;}};
 Object.defineProperty(root,'innerHTML',{set(){throw Error('Presentation must not replace draft or attachment inputs');}});
 const panels=bindChatPanels(root,{narrow:()=>narrow});
 return{attrs,handlers,root,panels,draft,log,search,heading,directoryHeading,setNarrow(value){narrow=value;}};
}
test('mobile directory and resume preserve mounted draft, attachment selection and scroll state',()=>{
 const f=fixture(),draft=f.draft,log=f.log;
 f.panels.showDirectory();assert.equal(f.attrs['data-chat-pane'],'list');assert.equal(f.panels.isConversationVisible(),false);assert.equal(f.directoryHeading.focused,true);assert.notEqual(f.search.focused,true);
 f.panels.showConversation(true);assert.equal(f.attrs['data-chat-pane'],'conversation');assert.equal(f.heading.focused,true);
 assert.equal(f.draft,draft);assert.equal(f.log,log);assert.equal(f.draft.value,'Noch nicht gesendet');assert.deepEqual(f.draft.files,['foto.png']);assert.equal(f.log.scrollTop,120);
});
test('desktop conversations remain visible when returning from a mobile directory',()=>{
 const f=fixture();f.panels.showDirectory();f.setNarrow(false);assert.equal(f.panels.isConversationVisible(),true);assert.equal(f.attrs['data-chat-pane'],'list');
});
test('back and resume controls use the same panel state without navigation or recreating children',()=>{
 const f=fixture();const click=kind=>f.handlers.click({target:{closest:selector=>selector===`[data-chat-${kind}]`?{}:null}});
 click('back');assert.equal(f.panels.isConversationVisible(),false);click('resume');assert.equal(f.panels.isConversationVisible(),true);
 f.root.isConnected=false;click('back');assert.equal(f.attrs['data-chat-pane'],'conversation');
});
test('modified and secondary current-conversation clicks keep native browser navigation',()=>{
 const handlers={},root={isConnected:true,setAttribute(){},addEventListener(name,fn){handlers[name]=fn;},querySelector(){return null;}};
 bindChatPanels(root,{isCurrentLink:()=>true});
 for(const flags of [{ctrlKey:true},{metaKey:true},{shiftKey:true},{altKey:true},{button:1}]){
  let prevented=false;handlers.click({button:0,...flags,target:{closest:selector=>selector==='a.chat-channel'?{}:null},preventDefault(){prevented=true;}});assert.equal(prevented,false);
 }
});
