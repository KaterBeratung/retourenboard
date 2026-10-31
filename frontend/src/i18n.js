// Only authentication and common labels are public. The full application catalog
// is registered by app.js after bootstrap has confirmed the session.
const dictionary={

 "Mit Microsoft anmelden":"Sign in with Microsoft",
 "Anmelden mit":"Sign in with",
 "oder mit Passwort":"or use your password",
 "Deine SSO-Identität wurde bestätigt. Ein Administrator muss den Zugang noch freigeben. Melde dich danach erneut an.":"Your SSO identity has been verified. An administrator must approve your access. Sign in again afterwards.",
 "SSO-Anmeldung wurde abgebrochen oder ist abgelaufen. Bitte erneut versuchen.":"SSO sign-in was cancelled or expired. Please try again.",
 "SSO-Anmeldung ist abgelaufen oder ungültig. Bitte erneut starten.":"SSO sign-in has expired or is invalid. Please start again.",
 "SSO-Anmeldung wurde abgebrochen. Bitte erneut versuchen.":"SSO sign-in was cancelled. Please try again.",
 "SSO-Anmeldung konnte nicht sicher bestätigt werden. Bitte erneut versuchen.":"SSO sign-in could not be securely verified. Please try again.",
 "SSO-Anbieter ist nicht erreichbar oder fehlerhaft eingerichtet.":"The SSO provider is unavailable or incorrectly configured.",
 "Zu viele SSO-Anmeldeversuche. Bitte später erneut versuchen.":"Too many SSO sign-in attempts. Please try again later.",
 "SSO ist momentan ausgelastet. Bitte erneut versuchen.":"SSO is currently busy. Please try again.",
 "SSO ist deaktiviert.":"SSO is disabled.",
 "SSO-Anbieter ist deaktiviert.":"The SSO provider is disabled.",
 "SSO-Anbieter nicht gefunden.":"SSO provider not found.",
 "SSO-Anbieter ist nicht vollständig eingerichtet.":"The SSO provider is not fully configured.",
 "Bitte vor dem Wechsel des Anmeldekontos abmelden.":"Please sign out before switching accounts.",
 "Bitte die öffentliche SSO-Adresse in den Servereinstellungen konfigurieren und den Server gegebenenfalls neu starten.":"Configure the public SSO address in server settings and restart the server if needed.",
 "SSO-Anfrage konnte nicht angenommen werden. Bitte Administrator kontaktieren.":"The SSO access request could not be accepted. Please contact your administrator.",
 "SSO-Identität ist ungültig.":"The SSO identity is invalid.",
 'Anmelden · retourenboard.':'Sign in · retourenboard.',
 'Auf Ko-fi unterstützen':'Support on Ko-fi',
 'Auf Ko-fi unterstützen (öffnet in neuem Tab)':'Support on Ko-fi (opens in a new tab)',
 'Willkommen zurück':'Welcome back','Ersten Administrator anlegen':'Create the first administrator',
 'Richte deinen persönlichen Zugang ein. Dieser erste Account verwaltet weitere Konten.':'Set up your personal access. This first account manages other accounts.',
 'Melde dich mit deinem persönlichen Konto an.':'Sign in with your personal account.',
 'Dein erster Account erhält Administratorrechte. Weitere Personen werden später im Adminbereich hinzugefügt.':'Your first account receives administrator access. Add other people in administration later.',
 'Benutzername':'Username','Anzeigename':'Display name','Dein Name':'Your name','z. B. Max':'e.g. Max',
 '3–64 Zeichen: Buchstaben, Zahlen, Punkt, Bindestrich oder Unterstrich.':'3–64 characters: letters, numbers, periods, hyphens or underscores.',
 'Passwort':'Password','Neues Passwort':'New password','Passwort bestätigen':'Confirm password','Dein Passwort':'Your password',
 'Passwort anzeigen':'Show password','Passwort verbergen':'Hide password',
 'Mindestens 12 Zeichen.':'At least 12 characters.','Leer lassen, um das bisherige Passwort zu behalten. Mindestens 12 Zeichen für ein neues Passwort.':'Leave blank to keep the current password. Use at least 12 characters for a new password.',
 'Administrator anlegen':'Create administrator','Anmelden':'Sign in','Abmelden':'Sign out','Abbrechen':'Cancel','Schließen':'Close','Zurück':'Back','Bestätigen':'Confirm',
 'Dein gemeinsamer Retouren-Arbeitsplatz.':'Your shared returns workspace.',
 'Retouren mit Seriennummer erfassen':'Log returns with serial numbers','Scannen und Etiketten drucken':'Scan and print labels','Bearbeitungsstand mit Kundschaft teilen':'Share the processing status with customers',
 'Die Passwörter stimmen nicht überein.':'The passwords do not match.',
 'Zweiter Anmeldeschritt':'Second sign-in step','Gib deinen App-Code oder einen einmaligen Recoverycode ein.':'Enter your app code or a single-use recovery code.',
 '2FA- oder Recoverycode':'2FA or recovery code','Authenticator verbinden':'Connect an authenticator',
 'Scanne den QR-Code mit deiner Authenticator-App und gib den aktuellen sechsstelligen Code ein.':'Scan the QR code with your authenticator app and enter the current six-digit code.',
 'QR-Code für die Authenticator-App':'QR code for your authenticator app','Manueller Einrichtungsschlüssel':'Manual setup key','App-Code':'App code','Code prüfen':'Verify code',
 'Recoverycodes sichern':'Save recovery codes','Jeder Code gilt einmal. Bewahre die Codes getrennt von deinem Gerät auf.':'Each code can be used once. Keep the codes separate from your device.',
 'Als Textdatei speichern':'Save as a text file','Ich habe meine Recoverycodes sicher gespeichert.':'I have saved my recovery codes securely.',
 'Verbindung fehlgeschlagen':'Connection failed','Erneut versuchen':'Try again','Anmeldung wird geladen …':'Loading sign-in …',
 'Deine Anmeldung hat sich geändert. Bitte erneut versuchen.':'Your sign-in has changed. Please try again.','Anfrage fehlgeschlagen.':'Request failed.',
 'Bitte zuerst anmelden.':'Please sign in first.','Code ungültig.':'Invalid code.','Benutzername oder Passwort falsch.':'Incorrect username or password.',
 'Angemeldet als':'Signed in as','Farbschema wechseln':'Change color scheme','Hell oder Dunkel auswählen':'Choose light or dark',
 'Hell':'Light','Dunkel':'Dark','Sprache auswählen':'Choose language','Sprache':'Language',
 'Abgeschlossen':'Completed','In Prüfung':'Under review',
 'Anmeldedaten sind nicht korrekt.':'Incorrect sign-in details.',
 'Zu viele Fehlversuche. Bitte nach 15 Minuten erneut versuchen.':'Too many failed attempts. Please try again after 15 minutes.',
 'Zu viele 2FA-Fehlversuche. Bitte nach 15 Minuten erneut versuchen.':'Too many failed 2FA attempts. Please try again after 15 minutes.',
 'Bitte zweiten Anmeldeschritt abschließen.':'Please complete the second sign-in step.',
 'Anmeldeschritt abgelaufen. Bitte erneut anmelden.':'The sign-in step has expired. Please sign in again.',
 '2FA-Code ist ungültig. Bitte einen neuen Code oder Recoverycode eingeben.':'Invalid 2FA code. Enter a new code or a recovery code.',
 '2FA-Code ist ungültig oder bereits verwendet. Bitte den nächsten App-Code abwarten oder einen Recoverycode eingeben.':'The 2FA code is invalid or has already been used. Wait for the next app code or enter a recovery code.',
 'Konto ist nicht verfügbar.':'The account is unavailable.','Einrichtung abgelaufen.':'Setup has expired.',
 'Einrichtung abgelaufen oder bereits bestätigt. Bitte neu beginnen.':'Setup has expired or has already been confirmed. Please start again.',
 'App-Code ist ungültig.':'Invalid app code.','Bitte zuerst die Sicherung der Recoverycodes bestätigen.':'Please confirm that you have saved the recovery codes first.',
 'Passwort muss zwischen 12 und 256 Zeichen enthalten.':'The password must contain between 12 and 256 characters.',
 'Benutzername: 3–64 Zeichen aus Buchstaben, Ziffern, Punkt, Bindestrich oder Unterstrich.':'Username: 3–64 characters using letters, numbers, periods, hyphens or underscores.',
 'Anzeigename: maximal 100 Zeichen.':'Display name: at most 100 characters.',
 'Dieser Benutzername ist bereits vergeben.':'This username is already in use.',
 'Die Ersteinrichtung ist bereits abgeschlossen.':'Initial setup has already been completed.',
 'Bitte zuerst den Administrator einrichten.':'Please set up the administrator first.',
 'retourenboard. · Retourenverwaltung':'retourenboard. · Returns management',
 'Mein Konto · retourenboard.':'My account · retourenboard.',
 'Administration · retourenboard.':'Administration · retourenboard.'
};
const preferenceKey='retourenboard.language';
let language='de';
try{const saved=globalThis.localStorage?.getItem(preferenceKey);if(saved==='en'||saved==='de')language=saved;}catch{}
export const getLanguage=()=>language;
export const locale=()=>language==='en'?'en-GB':'de-DE';
function reverseTranslations(){
 const index=new Map();
 // Preserve Object.keys ordering, including duplicate English aliases.
 for(const key of Object.keys(dictionary))if(!index.has(dictionary[key]))index.set(dictionary[key],key);
 return index;
}
let reverseDictionary=reverseTranslations();
export function addTranslations(entries){Object.assign(dictionary,entries);reverseDictionary=reverseTranslations();if(typeof document!=='undefined')refreshTranslations(document);}
function translate(source){
 const string=String(source??''),key=string.trim();
 if(language==='de'||!Object.hasOwn(dictionary,key))return string;
 return string.slice(0,string.indexOf(key))+dictionary[key]+string.slice(string.indexOf(key)+key.length);
}
export class LocalizedText extends String{
 constructor(de,en){super(language==='en'?en:de);this.de=de;this._en=en;}
 get en(){if(this._en!==this.de)return this._en;const previous=language;language='en';const translated=translate(this.de);language=previous;return translated;}
 toString(){return language==='en'?this.en:this.de;}
 valueOf(){return this.toString();}
 [Symbol.toPrimitive](){return this.toString();}
}
/** @returns {any} */
export function t(source,...values){
 if(source instanceof LocalizedText)return source;
 if(Array.isArray(source)&&Object.hasOwn(source,'raw')){
  const de=source.reduce((s,part,i)=>s+part+(i<values.length?(values[i] instanceof LocalizedText?values[i].de:String(values[i]??'')):''),'');
  const previous=language;language='en';const en=source.reduce((s,part,i)=>s+translate(part)+(i<values.length?(values[i] instanceof LocalizedText?values[i].en:String(values[i]??'')):''),'');language=previous;
  return new LocalizedText(de,en);
 }
 const raw=String(source??''),de=Object.hasOwn(dictionary,raw.trim())?raw:(reverseDictionary.get(raw)??raw),previous=language;language='en';const en=translate(de);language=previous;
 return new LocalizedText(de,en);
}
export function escapedText(value,escape){return value instanceof LocalizedText?new LocalizedText(escape(value.de),escape(value.en)):escape(value);}
const encode=value=>encodeURIComponent(JSON.stringify(value));
const marker=(de,en)=>de===en?de:`<!--rb-i18n:${encode([de,en])}-->${language==='en'?en:de}<!--/rb-i18n-->`;
const placeholder=/\uE000(\d+)\uE001/g;
function fill(source,values,marked=false){return source.replace(placeholder,(_,index)=>{const value=values[Number(index)];return marked&&value instanceof LocalizedText?marker(value.de,value.en):String(value??'');});}
function fragments(source){return source.split(/(\uE000\d+\uE001)/g).map(part=>part.startsWith('\uE000')?part:marker(part,t(part).en)).join('');}
// The tag sees source literals separately from interpolated data. Only trusted
// literal text and accessible labels are translated; names/messages stay opaque.
export function html(strings,...values){
 const source=typeof strings==='string'?strings:strings.reduce((s,part,i)=>s+part+(i<values.length?`\uE000${i}\uE001`:''),'');
 const parts=source.split(/(<!--[\s\S]*?-->|<[^>]*>)/g);
 let rawText='';
 const result=parts.map(part=>{
  if(rawText&&!part.startsWith(`</${rawText}`))return fill(part,values);
  if(/^<\/(?:script|style|textarea|title)\b/i.test(part))rawText='';
  const rawTag=part.match(/^<(script|style|textarea|title)\b/i);if(rawTag)rawText=rawTag[1].toLowerCase();
  if(!part.startsWith('<'))return fill(fragments(part),values,true);
  if(part.startsWith('<!--'))return fill(part,values);
  return fill(part.replace(/\b(title|placeholder|aria-label|alt)="([^"]*)"/g,(_,name,text)=>{
   if(name==='placeholder'&&/^Artikelnummer;/.test(text))return `${name}="${text}"`;
   const de=fill(text,values.map(v=>v instanceof LocalizedText?v.de:v)),en=fill(text.split(/(\uE000\d+\uE001)/g).map(piece=>piece.startsWith('\uE000')?piece:t(piece).en).join(''),values.map(v=>v instanceof LocalizedText?v.en:v));
   return `${name}="${language==='en'?en:de}"${de===en?'':` data-rb-i18n-${name}="${encode([de,en])}"`}`;
  }),values);
 }).join('');
 return result;
}
const decode=value=>String(value).replace(/&(?:amp|lt|gt|quot|#39|#10|#(\d+));/g,(match,num)=>num?String.fromCodePoint(Number(num)):({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'",'&#10;':'\n'}[match]??match));
export function refreshTranslations(root){
 const doc=root.ownerDocument??root;
 if(!doc.createTreeWalker)return;
 const walker=doc.createTreeWalker(root,128);let node;
 while((node=walker.nextNode())){
  if(!node.data.startsWith('rb-i18n:'))continue;
  try{const pair=JSON.parse(decodeURIComponent(node.data.slice(8)));const next=node.nextSibling;if(next?.nodeType===3)next.nodeValue=decode(pair[language==='en'?1:0]);}catch{}
 }
 for(const element of root.querySelectorAll('[data-rb-i18n-title],[data-rb-i18n-placeholder],[data-rb-i18n-aria-label],[data-rb-i18n-alt],[data-rb-i18n-text],[data-i18n]')){
  if(element.hasAttribute('data-i18n'))element.textContent=String(t(element.getAttribute('data-i18n')));
  const text=element.getAttribute('data-rb-i18n-text');if(text){try{const pair=JSON.parse(decodeURIComponent(text));element.textContent=pair[language==='en'?1:0];}catch{}}
  for(const name of ['title','placeholder','aria-label','alt']){
   const value=element.getAttribute('data-rb-i18n-'+name);if(!value)continue;
   try{const pair=JSON.parse(decodeURIComponent(value));element.setAttribute(name,decode(pair[language==='en'?1:0]));}catch{}
  }
 }
 for(const select of root.querySelectorAll('[data-language-select]')){select.value=language;select.setAttribute('aria-label',String(t('Sprache auswählen')));}
 for(const group of root.querySelectorAll('[data-language-switch]')){group.dataset.language=language;group.setAttribute('aria-label',String(t('Sprache auswählen')));}
 for(const button of root.querySelectorAll('[data-language-button]'))button.setAttribute('aria-pressed',String(button.dataset.languageButton===language));
}
export function setText(element,value){
 if(!element)return;
 if(value instanceof LocalizedText)element.setAttribute?.('data-rb-i18n-text',encode([value.de,value.en]));
 else element.removeAttribute?.('data-rb-i18n-text');
 element.textContent=String(value??'');
}
// Status/master-data names are editable persisted data, including exact matches
// with a seeded name. They keep their original text in both languages.
export function statusLabel(value){return value;}
export function formatDate(value,options,method='toLocaleString'){
 const date=value instanceof Date?value:new Date(value);
 return new LocalizedText(date[method]('de-DE',options),date[method]('en-GB',options));
}
export function formatNumber(value,options){return new LocalizedText(Number(value).toLocaleString('de-DE',options),Number(value).toLocaleString('en-GB',options));}
export function apiError(message){
 const source=String(message??''),labels=['Gerätebezeichnung','Seriennummer / Gerätekennung','Durchführungsdatum','Verfahren','Ausführende Person / Dienstleister','Stornierungsgrund','Korrekturgrund','Freigegeben durch','Dokumentiert durch','Person','Grund','Lagerort','Referenz','Produktname','Artikelnummer','Seriennummer','Austauschseriennummer','Bestellnummer','Kundenreferenz','Sendungsnummer','Eingangsdatum','Retourennummer','Lieferant','Hersteller','Kategorie','Retourengrund','Zustand','Status','Lösung','Notizen','Beschreibung','Name','Anzeigename','Benutzername','EAN'];
 for(const label of labels){
  const translated=t(label).en;
  if(source===`${label} ist erforderlich.`||source===`${translated} is required.`)return new LocalizedText(`${label} ist erforderlich.`,`${translated} is required.`);
  if(source===`${label}: ungültiger Text.`)return new LocalizedText(source,`${translated}: invalid text.`);
  const german=source.match(new RegExp(`^${label}: maximal (\\d+) Zeichen erlaubt\\.$`)),english=source.match(new RegExp(`^${translated}: at most (\\d+) characters are allowed\\.$`)),limit=german?.[1]??english?.[1];
  if(limit)return new LocalizedText(`${label}: maximal ${limit} Zeichen erlaubt.`,`${translated}: at most ${limit} characters are allowed.`);
 }
 const key=source.match(/^Ungültiger Wert für (reason|condition|status|resolution)\.$/);
 if(key){const label={reason:'Retourengrund',condition:'Zustand',status:'Status',resolution:'Lösung'}[key[1]];return new LocalizedText(source,`Invalid value for ${t(label).en}.`);}
 return t(message);
}
export function setLanguage(next,{storage}={}){
 if(next!=='de'&&next!=='en')return;
 language=next;try{(storage===undefined?globalThis.localStorage:storage)?.setItem(preferenceKey,next);}catch{}
 if(typeof document!=='undefined'){document.documentElement.lang=language;refreshTranslations(document);window.dispatchEvent(new CustomEvent('languagechange',{detail:language}));}
}
export function initLanguage(){
 if(typeof document==='undefined')return;
 document.documentElement.lang=language;
 document.addEventListener('change',event=>{if(event.target.matches?.('[data-language-select]'))setLanguage(event.target.value);});
 document.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-language-button]');
  if(button&&!button.disabled&&button.dataset.languageButton!==language)setLanguage(button.dataset.languageButton);
 });
 refreshTranslations(document);
}
