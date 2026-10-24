import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const root=process.env.RETOURENBOARD_UI_TEST_ROOT?pathToFileURL(resolve(process.env.RETOURENBOARD_UI_TEST_ROOT)+'/'):new URL('../dist/public/',import.meta.url);
const files=await import(new URL('chat-files.js',root)).catch(()=>({}));
const collaboration=await import(new URL('collaboration-ui.js',root));
const i18n=await import(new URL('i18n.js',root));
const file=(name='Foto.png',size=3,type='image/png')=>new File([new Uint8Array(size)],name,{type});

test('chat file selection rejects unsupported, empty and oversized files without losing the draft',()=>{
  assert.equal(typeof files.createChatFileFlow,'function');
  const flow=files.createChatFileFlow({upload:async()=>({id:1}),maxMb:1});
  flow.select([file()]);
  for(const rejected of [file('Text.txt',2,'text/plain'),file('Leer.pdf',0,'application/pdf'),file('Gross.webp',1048577,'image/webp')]){
    assert.throws(()=>flow.select([rejected]));
    assert.deepEqual(flow.files.map(entry=>entry.file.name),['Foto.png']);
  }
  flow.select([file('Grenze.pdf',1048576,'application/pdf')]);
  assert.equal(flow.files.length,2);
});

test('chat file sends run sequentially and retries retain only unsent files after a partial failure',async()=>{
  assert.equal(typeof files.createChatFileFlow,'function');
  const sent=[];let fail=true;
  const flow=files.createChatFileFlow({maxMb:1,upload:async value=>{sent.push(value.name);if(value.name==='Zwei.pdf'&&fail)throw Error('offline');return {id:sent.length};}});
  flow.select([file('Eins.png'),file('Zwei.pdf',4,'application/pdf'),file('Drei.webp',5,'image/webp')]);
  await assert.rejects(flow.send(),/offline/);
  assert.equal(flow.busy,false);
  assert.deepEqual(flow.files.map(entry=>entry.file.name),['Zwei.pdf','Drei.webp']);
  fail=false;await flow.send();
  assert.deepEqual(sent,['Eins.png','Zwei.pdf','Zwei.pdf','Drei.webp']);
  assert.equal(flow.files.length,0);
});

test('chat file sends preserve new selections and reject duplicate sends while upload is pending',async()=>{
  assert.equal(typeof files.createChatFileFlow,'function');
  let finish;const flow=files.createChatFileFlow({upload:()=>new Promise(resolve=>finish=resolve),maxMb:1});
  flow.select([file()]);const originalId=flow.files[0].id,pending=flow.send();
  await assert.rejects(flow.send(),/bereits/);
  assert.equal(flow.remove(originalId),false,'A file already being sent cannot be cancelled as a pending selection');
  flow.select([file('Neu.jpg',4,'image/jpeg')]);finish({id:1});await pending;
  assert.deepEqual(flow.files.map(entry=>entry.file.name),['Neu.jpg']);
  assert.equal(flow.remove(flow.files[0].id),true);assert.equal(flow.files.length,0);
});

test('chat file upload ignores stale authorization or channel results and stops the rest of the batch',async()=>{
  assert.equal(typeof files.createChatFileFlow,'function');
  let active=true,finish;const delivered=[],sent=[];
  const flow=files.createChatFileFlow({maxMb:1,active:()=>active,onUploaded:row=>delivered.push(row),upload:value=>{sent.push(value.name);return new Promise(resolve=>finish=resolve);}});
  flow.select([file(),file('Zwei.jpg',4,'image/jpeg')]);const pending=flow.send();active=false;finish({id:9});await pending;
  assert.deepEqual(sent,['Foto.png']);assert.deepEqual(delivered,[]);assert.equal(flow.files.length,2);
});

test('chat attachments escape filenames and offer image previews and PDF downloads in file-only messages',()=>{
  const out=collaboration.renderMessage({id:1,author:{id:2,displayName:'Max'},text:'',mentions:[],createdAt:'2026-10-12T08:00:00Z',canEdit:false,canDelete:true,attachments:[{id:3,originalName:'<img onerror="bad">.png',mediaType:'image/png',size:1024},{id:4,originalName:'Beleg.pdf',mediaType:'application/pdf',size:2048}]},2);
  assert.match(out,/src="\/api\/chat\/attachments\/3\/preview"/);
  assert.match(out,/href="\/api\/chat\/attachments\/4\/download"/);
  assert.match(out,/&lt;img onerror=&quot;bad&quot;&gt;\.png/);
  assert.ok(!out.includes('<img onerror='));
  assert.ok(!out.includes('class="message-text"'),'File-only messages must not add an empty text paragraph');
  assert.ok(!out.includes('data-edit-message'));
});

test('deleted chat attachments never render their filename or usable URL',()=>{
  const out=collaboration.renderMessage({id:1,author:{id:2,displayName:'Max'},deleted:true,text:'',createdAt:'2026-10-12T08:00:00Z',canEdit:false,canDelete:false,attachments:[{id:8,originalName:'Geheim.png',mediaType:'image/png',size:1024}]},2);
  assert.ok(!out.includes('Geheim.png'));assert.ok(!out.includes('/attachments/8/'));assert.match(out,/Nachricht gelöscht/);
});

test('shared comments and edit composer do not offer chat file uploads',()=>{
  assert.ok(!collaboration.composer().includes('data-chat-file'));
});

test('text send errors do not overwrite the separate chat file upload error',async()=>{
  const text={value:'Text',addEventListener(){}},button={},fileError={hidden:false,textContent:'Upload offline',setAttribute(){}},textError={hidden:true,setAttribute(){}},menu={addEventListener(){}},picker={};
  const nodes={'textarea':text,'[type=submit]':button,'.form-error':fileError,'.form-error:not([data-chat-file-error])':textError,'.mention-menu':menu,'[data-mention-picker]':picker};
  const form={isConnected:true,closest:()=>null,querySelector:selector=>nodes[selector]};
  collaboration.bindComposer({unlocked:true},form,{people:async()=>[],post:async()=>{throw Error('Text offline');},after:()=>{}});
  await form.onsubmit({preventDefault(){}});
  assert.equal(textError.textContent,'Text offline');assert.equal(textError.hidden,false);
  assert.equal(fileError.textContent,'Upload offline');assert.equal(fileError.hidden,false);
});

test('chat file controls and size validation are available in English',t=>{
  assert.equal(typeof files.chatFileControls,'function');
  i18n.setLanguage('en');t.after(()=>i18n.setLanguage('de'));
  const out=files.chatFileControls({uploadMaxMb:2});
  assert.match(out,/Attach files/);assert.match(out,/Send files/);assert.match(out,/up to 2 MB/);
  const flow=files.createChatFileFlow({upload:async()=>({id:1}),maxMb:1});
  assert.throws(()=>flow.select([file('Gross.png',1048577)]),/A file is too large.*1 MB per file is allowed/);
});

test('unsent files remain protected after text sends and successful file sends retain a newer text draft',async t=>{
  assert.equal(typeof files.bindChatFiles,'function');
  const previous={document:globalThis.document,FormData:globalThis.FormData};
  const element=()=>({value:'',hidden:true,disabled:false,dataset:{},setAttribute(){},addEventListener(type,fn){this[type]=fn;},querySelectorAll:()=>[]});
  const input=element(),picker=element(),send=element(),selected=element(),status=element(),error=element(),draft=element(),text=element(),textSend=element(),textError=element(),mentionMenu=element(),mentionPicker=element();
  const nodes={'[data-chat-file-input]':input,'[data-chat-file-pick]':picker,'[data-chat-file-send]':send,'[data-chat-file-selection]':selected,'[data-chat-file-status]':status,'[data-chat-file-error]':error,'[name=chatAttachmentDraft]':draft,'textarea':text,'[type=submit]':textSend,'.form-error':textError,'.form-error:not([data-chat-file-error])':textError,'.mention-menu':mentionMenu,'[data-mention-picker]':mentionPicker};
  const form={dataset:{},isConnected:true,closest:()=>null,querySelector:selector=>selector==='.unsaved-status'?form.unsaved:nodes[selector],prepend:node=>form.unsaved=node};
  globalThis.document={createElement:()=>element()};globalThis.FormData=class extends Map{constructor(){super([['text',text.value],['chatAttachmentDraft',draft.value]]);}};
  t.after(()=>{globalThis.FormData=previous.FormData;if(previous.document===undefined)delete globalThis.document;else globalThis.document=previous.document;});
  let finishUpload;const ctx={unlocked:true,config:{uploadMaxMb:1},api:(path,options)=>{
    assert.equal(path,'/api/chat/channels/7/attachments');assert.equal(options.method,'POST');assert.equal(options.file.name,'Neu.jpg');
    return new Promise(resolve=>finishUpload=resolve);
  }};
  const binder=files.bindChatFiles(ctx,form,{channelId:7,active:()=>true,after:()=>{}});
  collaboration.bindComposer(ctx,form,{post:async()=>({id:2}),people:async()=>[],after:()=>{},afterClear:binder.resetTextBaseline});
  input.files=[file()];input.change({target:input});assert.equal(form.dataset.dirty,'true');
  text.value='Textnachricht';await form.onsubmit({preventDefault(){}});assert.equal(text.value,'');assert.equal(form.dataset.dirty,'true','Sending text must retain attachment dirty state');
  binder.flow.remove(binder.flow.files[0].id);assert.equal(form.dataset.dirty,'false','Cancelling an otherwise empty draft must remove dirty state');
  text.value='Nächster Entwurf';input.files=[file('Neu.jpg',4,'image/jpeg')];input.change({target:input});binder.flow.remove(binder.flow.files[0].id);assert.equal(form.dataset.dirty,'true','Cancelling files must preserve an unsent text draft');
  input.change({target:input});const pending=send.onclick();text.value='Noch neuerer Text';finishUpload({id:3});await pending;
  assert.equal(text.value,'Noch neuerer Text');assert.equal(form.dataset.dirty,'true');assert.equal(draft.value,'');assert.equal(binder.flow.files.length,0);
});
