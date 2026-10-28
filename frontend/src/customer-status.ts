import {html,t,addTranslations,setText,apiError,formatDate} from './i18n.js';
import {icon} from './ui.js';
import {switchField} from './switches.js';
import {captureAuthContext} from './auth-context.js';
import {copyText} from './quick-actions.js';
import {markForm,refreshFormState,canLeaveForms} from './unsaved.js';
addTranslations({
 'Die Freigabe ist nicht mehr aktiv. Bitte einen neuen Kundenlink erstellen.':'This sharing link is no longer active. Please create a new customer link.',
 'Die Freigabe wurde inzwischen geändert. Bitte erneut öffnen.':'Sharing settings have changed. Please open them again.',
 'Kundenstatus teilen':'Share customer status','Bearbeitungsstand ohne Anmeldung teilen.':'Share the processing status without a sign-in.','Öffentliche Kundenansicht':'Public customer view','Jeder mit dem Link kann diese Angaben lesen. Interne Notizen und Dateien werden nicht geteilt.':'Anyone with the link can read these details. Internal notes and files are not shared.','Öffentlicher Hinweis (optional)':'Public message (optional)','Nur für Kunden bestimmte Informationen eintragen.':'Enter only information intended for customers.','Gültigkeit ab dem Speichern':'Valid from when you save','7 Tage':'7 days','30 Tage':'30 days','90 Tage':'90 days','Kundenlink erstellen':'Create customer link','Freigabe speichern':'Save sharing settings','Link kopieren':'Copy link','Link teilen':'Share link','Link erneuern':'Renew link','Freigabe widerrufen':'Revoke access','Zur Retoure':'Back to return','Aktuellen Stand laden':'Load current state','Aktiv bis':'Active until','Noch kein aktiver Kundenlink.':'No active customer link yet.','Der Link ist abgelaufen oder wurde deaktiviert.':'The link has expired or been disabled.','Link kopiert.':'Link copied.','Freigabe gespeichert.':'Sharing settings saved.','Freigabe widerrufen.':'Access revoked.','Dieser Link ist nur erreichbar, wenn deine Installation für den Empfänger erreichbar ist.':'This link works only if the recipient can reach your installation.','Der bisherige Link wird beim Erneuern sofort ungültig.':'Renewing immediately invalidates the previous link.','Link erneuern, um ihn wieder kopieren zu können.':'Renew the link to make it copyable again.','Vorschau wird geladen …':'Loading preview …','Link konnte nicht geteilt werden. Du kannst ihn kopieren.':'Could not share the link. You can copy it instead.','Freigabe konnte nicht geladen werden.':'Could not load sharing settings.'
});
addTranslations({
 'Ein Kommentar wurde seit der Vorschau geändert. Bitte erneut laden und prüfen.':'A comment has changed since the preview. Please reload and review it.','Ungültiger Kommentarstand.':'Invalid comment version.','Der ausgewählte Kommentar ist zu lang. Bitte intern kürzen.':'The selected comment is too long. Please shorten it internally.','Sichtbare Inhalte':'Visible details','Produkt anzeigen':'Show product','Letzte Aktualisierung anzeigen':'Show last update','Öffentlichen Hinweis anzeigen':'Show public message','Status und Retourennummer bleiben immer sichtbar.':'Status and return number always remain visible.',
 'Kommentare freigeben':'Share comments','Keine Kommentare vorhanden.':'No comments yet.','Kommentare werden geladen …':'Loading comments …','Weitere Kommentare laden':'Load more comments','Kommentare erneut laden':'Reload comments','Kommentare konnten nicht geladen werden.':'Could not load comments.',
 'Ausgewählt':'Selected','Maximal 20 Kommentare. Kunden können diese nur lesen.':'Up to 20 comments. Customers can only read them.','Autoren werden ausgeblendet und @Erwähnungen durch @Team ersetzt. Bitte den Text vor dem Freigeben prüfen.':'Authors are hidden and @mentions are replaced with @Team. Please review the text before sharing.',
 'Freigegebene Texte bleiben als Momentaufnahme erhalten. Spätere interne Änderungen werden nicht automatisch geteilt; gelöschte Kommentare verschwinden.':'Shared text remains a snapshot. Later internal edits are not shared automatically; deleted comments disappear.',
 'Vorschau der sichtbaren Inhalte':'Preview of visible details','Jeder mit dem Link kann die ausgewählten Angaben und Kommentare lesen. Interne Notizen und Dateien werden nicht geteilt.':'Anyone with the link can read the selected details and comments. Internal notes and files are not shared.',
 'Ungültige Auswahl der sichtbaren Inhalte.':'Invalid selection of visible details.','Bitte höchstens 20 gültige Kommentare auswählen.':'Please select up to 20 valid comments.','Ein ausgewählter Kommentar ist nicht mehr verfügbar. Bitte erneut laden.':'A selected comment is no longer available. Please reload.'
});

addTranslations({
 'Kommentare & Kundenstatus':'Comments & customer status','Kommentare bleiben intern, bis du sie ausdrücklich freigibst.':'Comments stay internal until you explicitly share them.','Kundenlink':'Customer link','Für Kunden sichtbar':'Visible to customers','Kundenvorschau':'Customer preview','Auswahl wird erst mit „Freigabe speichern“ veröffentlicht.':'Selections are published only when you save sharing settings.','Status und Auftragsnummer bleiben immer sichtbar.':'Status and order number always remain visible.'
});
export type RecordKind='returns'|'disposals';
type Choice={id:number;text:string;createdAt?:string;version?:string};
// Selected copies are deliberately detached from the live internal comment.
export function createCommentSharingState(saved:Choice[]=[]){
 let selected=new Map<number,Choice>(saved.map(c=>[c.id,{...c}]));let published=new Map<number,Choice>(saved.map(c=>[c.id,{...c}]));const candidates=new Map<number,Choice>();
 return {get size(){return selected.size;},has:(id:number)=>selected.has(id),ready:(id:number)=>candidates.has(id),preview:(id:number)=>selected.get(id),
  reset(value:Choice[]){published=new Map(value.map(c=>[c.id,{...c}]));selected=new Map(published);},
  ingest(value:Choice[]){for(const c of value)candidates.set(c.id,{...c});},
  remove(id:number){selected.delete(id);candidates.delete(id);},
  toggle(id:number,checked:boolean){if(!checked){selected.delete(id);return true;}if(selected.has(id))return true;const choice=published.get(id)??candidates.get(id);if(!choice||selected.size>=20)return false;selected.set(id,{...choice});return true;},
  payload(){const entries=[...selected.values()].sort((a,b)=>a.id-b.id);return {commentIds:entries.map(c=>c.id),commentVersions:Object.fromEntries(entries.filter(c=>c.version).map(c=>[c.id,c.version]))};}
 };
}
const optionLabels={showProduct:'Produkt anzeigen',showUpdated:'Letzte Aktualisierung anzeigen',showPublicNote:'Öffentlichen Hinweis anzeigen'};
export function renderCustomerShareControls(ctx:any,kind:RecordKind){return ctx.can(kind+'Share')?html`<form data-customer-share data-unsaved-notice="hidden">
 <div class="customer-share-heading"><h4>${icon('globe')}Kundenlink</h4><p class="customer-share-state" data-share-state role="status">Vorschau wird geladen …</p></div>
 <p class="customer-share-notice">Jeder mit dem Link kann die ausgewählten Angaben und Kommentare lesen. Interne Notizen und Dateien werden nicht geteilt.</p>
 <div class="customer-share-link" data-share-link hidden><label class="field"><span>Kurzlink</span><input type="url" readonly data-share-url aria-label="Kurzlink"></label><div class="customer-share-tools"><button type="button" class="btn secondary small" data-share-copy>${icon('copy')}Link kopieren</button><button type="button" class="btn secondary small" data-share-native>${icon('upload')}Link teilen</button><a class="btn secondary small" data-share-preview target="_blank" rel="noopener noreferrer">${icon('eye')}Öffnen</a></div></div>
 <fieldset class="customer-share-options"><legend>Sichtbare Inhalte</legend>${Object.entries(optionLabels).map(([key,label])=>switchField(key,t(label),true)).join('')}<small>${t(kind==='disposals'?'Status und Auftragsnummer bleiben immer sichtbar.':'Status und Retourennummer bleiben immer sichtbar.')}</small></fieldset>
 <div class="customer-share-fields"><label class="field"><span>Öffentlicher Hinweis (optional)</span><textarea name="publicNote" maxlength="1000" rows="2" placeholder="Nur für Kunden bestimmte Informationen eintragen."></textarea></label><label class="field"><span>Gültigkeit ab dem Speichern</span><select name="days"><option value="7">7 Tage</option><option value="30" selected>30 Tage</option><option value="90">90 Tage</option></select></label></div>
 <input type="hidden" name="commentSelection" value="[]"><p class="customer-share-selection"><span data-share-comment-count>0 / 20</span> · ${t('Auswahl wird erst mit „Freigabe speichern“ veröffentlicht.')}</p>
 <small>Autoren werden ausgeblendet und @Erwähnungen durch @Team ersetzt. Bitte den Text vor dem Freigeben prüfen.</small>
 <small>Freigegebene Texte bleiben als Momentaufnahme erhalten. Spätere interne Änderungen werden nicht automatisch geteilt; gelöschte Kommentare verschwinden.</small>
 <p class="form-error" data-share-error role="alert" hidden></p><button type="button" class="text-link" data-share-reload hidden>Aktuellen Stand laden</button>
 <div class="customer-share-save"><span class="muted" data-unsaved role="status"></span><button type="submit" class="btn primary" data-share-save disabled>${icon('check')}Kundenlink erstellen</button></div>
 <div class="customer-share-management" data-share-management hidden><button type="button" class="btn secondary small" data-share-renew>${icon('refresh')}Link erneuern</button><button type="button" class="btn danger small" data-share-revoke>${icon('close')}Freigabe widerrufen</button><small>Der bisherige Link wird beim Erneuern sofort ungültig.</small></div>
 <small>Dieser Link ist nur erreichbar, wenn deine Installation für den Empfänger erreichbar ist.</small></form>`:'';}
export function bindCustomerShareControls(ctx:any,kind:RecordKind,item:any,host:HTMLElement){
 const form=host.querySelector<HTMLFormElement>('[data-customer-share]');if(!form||!ctx.can(kind+'Share'))return {onComments(){}};
 const auth=captureAuthContext(ctx),path='/api/'+kind+'/'+item.id+'/customer-status',note=form.elements.namedItem('publicNote') as HTMLTextAreaElement,days=form.elements.namedItem('days') as HTMLSelectElement,selection=form.elements.namedItem('commentSelection') as HTMLInputElement,error=form.querySelector<HTMLElement>('[data-share-error]'),state=createCommentSharingState();
 let data:any=null,busy=false,sharedUrl='',log:HTMLElement=null,rows:any[]=[],generation=0,reviewGeneration=0;
 const reviewed=new Map<number,string>(),pending=new Set<number>();
 const current=()=>auth()&&form.isConnected&&Boolean(form.closest('dialog')?.open)&&ctx.can(kind+'Share');
 const option=(key:string)=>form.elements.namedItem(key) as HTMLInputElement;
 function syncSelection(dirty=true){selection.value=JSON.stringify(state.payload().commentIds);setText(form.querySelector('[data-share-comment-count]'),t('Ausgewählt')+': '+state.size+' / 20');if(dirty&&data)refreshFormState(form);}
 function decorate(){
  if(!log||!current())return;
  for(const row of rows){
   const card=log.querySelector<HTMLElement>('[data-message="'+row.id+'"]');if(!card||card.classList.contains('message-edit'))continue;
   let control=card.querySelector<HTMLElement>('[data-comment-sharing]');
   if(row.deleted){control?.remove();continue;}
   if(!control){control=document.createElement('div');control.dataset.commentSharing=String(row.id);control.className='comment-sharing';control.innerHTML=String(html`${switchField('',t('Für Kunden sichtbar'),false)}<div class="comment-public-preview" hidden><span>Kundenvorschau</span><p></p></div>`);card.append(control);
    const input=control.querySelector<HTMLInputElement>('input');input.onchange=()=>{if(!state.toggle(row.id,input.checked))input.checked=false;syncSelection();decorate();};
   }
   const input=control.querySelector<HTMLInputElement>('input'),preview=control.querySelector<HTMLElement>('.comment-public-preview'),copy=state.preview(row.id);
   input.checked=state.has(row.id);input.disabled=busy||!data||pending.has(row.id)||!state.has(row.id)&&(!state.ready(row.id)||state.size>=20);
   preview.hidden=!copy;const text=preview.querySelector('p');if(text.textContent!==(copy?.text??''))setText(text,copy?.text??'');
  }
 }
 async function onComments(nextLog:HTMLElement,nextRows:any[]){
  log=nextLog;rows=nextRows;const epoch=++reviewGeneration,owner=generation;
  for(const row of rows)if(row.deleted){state.remove(row.id);reviewed.delete(row.id);}syncSelection();
  const missing=rows.filter(row=>!row.deleted&&reviewed.get(row.id)!==JSON.stringify([row.text,row.createdAt,row.editedAt]));
  pending.clear();for(const row of missing)pending.add(row.id);decorate();
  try{for(let i=0;i<missing.length;i+=50){const chunk=missing.slice(i,i+50),value=await ctx.api(path+'/comments?ids='+chunk.map(row=>row.id).join(','));if(!current()||owner!==generation||epoch!==reviewGeneration)return;state.ingest(value.items);for(const row of chunk){reviewed.set(row.id,JSON.stringify([row.text,row.createdAt,row.editedAt]));pending.delete(row.id);}decorate();}}
  catch{if(current()&&owner===generation&&epoch===reviewGeneration){pending.clear();fail({message:t('Kommentare konnten nicht geladen werden.')});decorate();}}
 }
 function lock(value:boolean){busy=value;for(const el of form.querySelectorAll<HTMLButtonElement|HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>('button,input:not([type=hidden]),textarea,select'))el.disabled=value;note.disabled=value||!option('showPublicNote').checked;form.querySelector<HTMLButtonElement>('[data-share-save]').disabled=value||!data;decorate();}
 function apply(value:any){
  generation++;reviewGeneration++;pending.clear();data=value;state.reset(value.selectedComments??[]);for(const key of Object.keys(optionLabels))option(key).checked=value.options?.[key]!==false;note.value=value.publicNote??'';days.value='30';sharedUrl=value.path?new URL(value.path,value.publicOrigin||location.origin).href:'';
  form.querySelector<HTMLElement>('[data-share-link]').hidden=!sharedUrl;form.querySelector<HTMLInputElement>('[data-share-url]').value=sharedUrl;form.querySelector<HTMLAnchorElement>('[data-share-preview]').href=sharedUrl||'#';form.querySelector<HTMLElement>('[data-share-management]').hidden=!value.active;form.querySelector<HTMLElement>('[data-share-native]').hidden=typeof navigator.share!=='function';
  setText(form.querySelector('[data-share-state]'),value.active?sharedUrl?t('Aktiv bis')+': '+formatDate(value.expiresAt,{day:'2-digit',month:'2-digit',year:'numeric'}):t('Link erneuern, um ihn wieder kopieren zu können.'):t(value.revision?'Der Link ist abgelaufen oder wurde deaktiviert.':'Noch kein aktiver Kundenlink.'));
  form.querySelector('[data-share-save]').innerHTML=String(html`${icon('check')}${t(value.active?'Freigabe speichern':'Kundenlink erstellen')}`);form.querySelector<HTMLElement>('[data-share-reload]').hidden=true;syncSelection(false);lock(false);markForm(form,false);if(log)void onComments(log,rows);
 }
 function fail(err:any){if(!current())return;setText(error,apiError(err.message||t('Freigabe konnte nicht geladen werden.')));error.hidden=false;form.querySelector<HTMLElement>('[data-share-reload]').hidden=false;}
 async function load(){if(busy||!current())return;const owner=++generation;lock(true);error.hidden=true;try{const value=await ctx.api(path);if(current()&&owner===generation)apply(value);}catch(err){fail(err);}finally{if(current()&&owner<=generation)lock(false);}}
 async function save(method:string){if(busy||!data||!current())return;const body={revision:data.revision,publicNote:note.value,days:Number(days.value),options:Object.fromEntries(Object.keys(optionLabels).map(key=>[key,option(key).checked])),...state.payload()};lock(true);error.hidden=true;try{const value=await ctx.api(path,{method,body});if(!current())return;apply(value);ctx.toast(t(method==='DELETE'?'Freigabe widerrufen.':'Freigabe gespeichert.'));}catch(err){fail(err);}finally{if(current())lock(false);}}
 for(const key of Object.keys(optionLabels))option(key).onchange=()=>{note.disabled=!option('showPublicNote').checked;};
 form.onsubmit=event=>{event.preventDefault();void save(data?.active?'PUT':'POST');};
 form.querySelector<HTMLButtonElement>('[data-share-renew]').onclick=()=>void save('POST');form.querySelector<HTMLButtonElement>('[data-share-revoke]').onclick=()=>void save('DELETE');
 form.querySelector<HTMLButtonElement>('[data-share-reload]').onclick=async()=>{if(await canLeaveForms(host)&&current()){reviewed.clear();void load();}};
 form.querySelector<HTMLButtonElement>('[data-share-copy]').onclick=async()=>{if(!sharedUrl||!current())return;try{await copyText(sharedUrl,form);if(current())ctx.toast(t('Link kopiert.'));}catch(err){fail(err);}};
 form.querySelector<HTMLButtonElement>('[data-share-native]').onclick=async()=>{if(!sharedUrl||!current())return;try{await navigator.share({title:String(t('Öffentliche Kundenansicht')),url:sharedUrl});}catch(err){if(err.name!=='AbortError')fail({message:t('Link konnte nicht geteilt werden. Du kannst ihn kopieren.')});}};
 void load();return {onComments};
}
