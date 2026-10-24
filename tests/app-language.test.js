import test from 'node:test';
import assert from 'node:assert/strict';
const language=await import('../dist/public/i18n.js').catch(()=>({}));
const notifications=await import('../dist/public/notifications.js').catch(()=>({}));

test('language buttons synchronize all switchers and preserve keyboard focus',()=>{
 const originalDocument=globalThis.document,originalWindow=globalThis.window;
 const listeners={},groups=[{},{}],buttons=['de','en','de','en'].map(value=>({
   dataset:{languageButton:value},attributes:{},setAttribute(name,value){this.attributes[name]=value;}
 }));
 groups.forEach(group=>{group.dataset={};group.setAttribute=()=>{};});
 const doc={documentElement:{lang:'de'},activeElement:buttons[1],
   addEventListener:(name,handler)=>listeners[name]=handler,
   createTreeWalker:()=>({nextNode:()=>null}),
   querySelectorAll:selector=>selector==='[data-language-switch]'?groups:selector==='[data-language-button]'?buttons:[]
 };
 globalThis.document=doc;globalThis.window={dispatchEvent(){}};
 try{
   language.setLanguage('de');language.initLanguage();
   assert.equal(typeof listeners.click,'function','The segmented switch needs a click handler');
   listeners.click({target:{closest:selector=>selector==='[data-language-button]'?buttons[1]:null}});
   assert.equal(language.getLanguage(),'en');assert.equal(doc.documentElement.lang,'en');
   assert.deepEqual(buttons.map(button=>button.attributes['aria-pressed']),['false','true','false','true']);
   assert.deepEqual(groups.map(group=>group.dataset.language),['en','en']);
   assert.equal(doc.activeElement,buttons[1]);
 }finally{globalThis.document=originalDocument;globalThis.window=originalWindow;language.setLanguage('de');}
});

test('English trusted UI templates preserve user data and HTML escaping',()=>{
 assert.equal(typeof language.setLanguage,'function','The app needs a language controller');
 language.setLanguage('en');
 const user='Anmelden <script>alert(1)</script>';
 const output=language.html`<h1>Willkommen zurück</h1><label><span>Benutzername</span><input name="username" value="${user.replaceAll('<','&lt;').replaceAll('>','&gt;')}" placeholder="Dein Name"></label><p>${user.replaceAll('<','&lt;').replaceAll('>','&gt;')}</p>`;
 assert.match(output,/Welcome back/);
 assert.match(output,/Username/);
 assert.match(output,/placeholder="Your name"/);
 assert.equal(output.match(/Anmelden &lt;script&gt;alert\(1\)&lt;\/script&gt;/g).length,2);
 assert.doesNotMatch(output,/<script>/);
 language.setLanguage('de');
});
test('English visible status labels leave German stored option values intact',()=>{
 assert.equal(typeof language.html,'function');
 language.setLanguage('en');
 const output=language.html`<select name="status"><option value="Abgeschlossen">Abgeschlossen</option><option value="In Prüfung">In Prüfung</option></select>`;
 assert.match(output,/value="Abgeschlossen"/);assert.match(output,/Completed/);
 assert.match(output,/value="In Prüfung"/);assert.match(output,/Under review/);
 language.setLanguage('de');
});
test('the language preference persists and invalid values keep a supported language',()=>{
 assert.equal(typeof language.setLanguage,'function');
 const saved=new Map();const storage={getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)};
 language.setLanguage('en',{storage});assert.equal(saved.get('retourenboard.language'),'en');
 assert.equal(language.getLanguage(),'en');
 language.setLanguage('invalid',{storage});assert.equal(language.getLanguage(),'en');
 language.setLanguage('de',{storage});assert.equal(language.getLanguage(),'de');
});
test('runtime HTML translation only marks trusted source text, never interpolation text',()=>{
 assert.equal(typeof language.html,'function');
 language.setLanguage('en');
 const message='Änderungen gespeichert.';
 const output=language.html`<button>Abbrechen</button><p>${message}</p>`;
 assert.match(output,/Cancel/);assert.match(output,/<p>Änderungen gespeichert\.<\/p>/);
 assert.match(output,/<!--rb-i18n:/);
 language.setLanguage('de');
});
test('API errors and interpolated UI messages use the active language',()=>{
 assert.equal(typeof language.t,'function');
 language.setLanguage('en');
 assert.equal(String(language.t('Die Passwörter stimmen nicht überein.')),'The passwords do not match.');
 assert.equal(String(language.t`Angemeldet als ${'Anmelden'}.`),'Signed in as Anmelden.');
 language.setLanguage('de');
 assert.equal(String(language.t('Abbrechen')),'Abbrechen');
});
test('a blocked browser storage getter still permits language changes',()=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw new Error('Storage denied');}});
 try{assert.doesNotThrow(()=>language.setLanguage('en'));assert.equal(language.getLanguage(),'en');}
 finally{if(original)Object.defineProperty(globalThis,'localStorage',original);else delete globalThis.localStorage;language.setLanguage('de');}
});
test('nested localized UI templates retain German labels when switching back',()=>{
 language.setLanguage('en');const caption=language.t`${language.t('Anmelden')} / ${language.t('Abbrechen')}`;
 assert.equal(String(caption),'Sign in / Cancel');
 language.setLanguage('de');assert.equal(String(caption),'Anmelden / Abbrechen');
});

test('permission summaries retain both languages for in-place switching without reloading accounts',async()=>{
 const {permissionSummary}=await import('../dist/public/permission-editor.js');
 language.addTranslations((await import('../frontend/src/i18n-catalog.js')).english);
 language.setLanguage('en');
 try{
  const admin=permissionSummary({role:'admin'}),member=permissionSummary({role:'member'});
  assert.equal(String(admin),'All permissions');
  assert.match(String(member),/^Default · \d+ Permissions$/);
  assert.match(language.html`<span>${admin}</span>`,/<!--rb-i18n:/);
  language.setLanguage('de');
  assert.equal(String(admin),'Alle Rechte');
  assert.match(String(member),/^Standard · \d+ Rechte$/);
 }finally{language.setLanguage('de');}
});
test('structured validation errors translate UI field labels and keep numeric limits',async()=>{
 assert.equal(typeof language.apiError,'function');
 language.setLanguage('en');
 language.addTranslations((await import('../frontend/src/i18n-catalog.js')).english);
 assert.equal(String(language.apiError('Produktname ist erforderlich.')),'Product name is required.');
 assert.equal(String(language.apiError('Seriennummer: maximal 250 Zeichen erlaubt.')),'Serial number: at most 250 characters are allowed.');
 assert.equal(String(language.apiError('Austauschseriennummer: maximal 250 Zeichen erlaubt.')),'Replacement serial number: at most 250 characters are allowed.');
 assert.equal(String(language.apiError('Ungültiger Wert für status.')),'Invalid value for Status.');
 assert.equal(String(language.apiError('Unbekannter Lieferant: Anmelden')),'Unbekannter Lieferant: Anmelden');
 language.setLanguage('de');
});
test('known notification templates translate while return identifiers and chat previews stay opaque',async()=>{
 assert.equal(typeof notifications.notificationCopy,'function');
 language.addTranslations((await import('../frontend/src/i18n-catalog.js')).english);language.setLanguage('en');
 const returned=notifications.notificationCopy({kind:'newReturn',title:'Neue Retoure',message:'Anmelden wurde angelegt.'});
 assert.equal(String(returned.title),'New return');assert.equal(String(returned.message),'Anmelden was created.');
 const imported=notifications.notificationCopy({kind:'newReturn',title:'Retouren importiert',message:'12 Retouren wurden importiert.'});
 assert.equal(String(imported.message),'12 returns were imported.');
 const overdue=notifications.notificationCopy({kind:'overdue',title:'Retoure überfällig',message:'Abbrechen hat die Bearbeitungsfrist überschritten.'});
 assert.equal(String(overdue.message),'Abbrechen has exceeded its processing deadline.');
 const chat=notifications.notificationCopy({kind:'chatMessage',title:'Neue Chatnachricht',message:'Anmelden'});
 assert.equal(String(chat.title),'New chat message');assert.equal(chat.message,'Anmelden');
 language.setLanguage('de');assert.equal(String(returned.message),'Anmelden wurde angelegt.');
});
