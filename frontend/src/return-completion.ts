import {motionScrollBehavior} from './appearance.js';
import {html,t,addTranslations,apiError} from './i18n.js';
import {h,icon} from './ui.js';
import {captureAuthContext} from './auth-context.js';
import {inspectCompletion} from '../shared/return-completion.js';
addTranslations({
 'Abschlussprüfung':'Completion check','Abschluss bereit':'Ready to complete','Vor dem Abschluss ergänzen':'Complete these details first',
 'Lösung und Dokumentation werden beim Abschluss geprüft.':'The outcome and documentation are checked when completing a return.',
 'Für den Abschluss bitte eine abgeschlossene Lösung auswählen.':'Select a decided outcome before completing this return.',
 'Für den Abschluss bitte das Bearbeitungsergebnis in den Notizen dokumentieren.':'Document the result in the notes before completing this return.',
 'Für den Abschluss eines Austauschs ist die Austauschseriennummer erforderlich.':'A replacement serial number is required to complete an exchange.',
 'Die verknüpfte Entsorgung muss zuerst durchgeführt und dokumentiert werden.':'Complete and document the linked disposal first.',
 'Die Seriennummer stimmt nicht mit dem verknüpften Entsorgungsauftrag überein.':'The serial number does not match the linked disposal order.',
 'Für diese Lösung ist ein durchgeführter Entsorgungsauftrag erforderlich.':'This outcome requires a completed disposal order.',
 'Verknüpfte Entsorgung':'Linked disposal','Noch kein Entsorgungsauftrag verknüpft.':'No disposal order linked yet.',
 'Entsorgung erfassen':'Create disposal order','Vorgemerkt':'Planned','Freigegeben':'Approved','Durchgeführt':'Completed','Storniert':'Cancelled',
 'Abschlussdaten ergänzen':'Complete return details','Abschlussprüfung wird geladen …':'Loading completion check …',
 'Wieder öffnen':'Reopen','Retoure wieder öffnen':'Reopen return','Begründung':'Reason','Wiederöffnung begründen und einen offenen Status wählen.':'Give a reason and choose an open status.',
 'Übergabe':'Handover','Retoure übergeben':'Hand over return','Status, Zuständigkeit und nächsten Schritt gemeinsam festlegen.':'Set the status, assignee and next step together.',
 'Für diese Aktion werden Retourenbearbeitung und Statusänderung benötigt.':'This action requires return editing and status permissions.',
 'Abgeschlossene Retouren bitte mit Begründung wieder öffnen.':'Reopen completed returns with a reason.',
 'Diese Retoure ist abgeschlossen. Bitte vor der Bearbeitung mit Begründung wieder öffnen.':'This return is completed. Reopen it with a reason before editing.',
 'Die Retoure wurde inzwischen geändert. Bitte erneut öffnen.':'This return has changed. Open it again.',
 'Bitte einen offenen Bearbeitungsstatus auswählen.':'Choose an open processing status.',
 'Diese Retoure ist bereits offen.':'This return is already open.',
 'Begründung ist erforderlich.':'A reason is required.','Nächster Schritt ist erforderlich.':'A next step is required.',
 'Retourenabschluss vorbereiten':'Prepare return completion','Kein offener Status verfügbar. Bitte im Adminbereich anlegen.':'No open status is available. Create one in administration.',
 'Änderungsgrund':'Reason for change',
 'Die Seriennummer kann bei verknüpfter Entsorgung nicht geändert werden. Bitte den Auftrag zuerst prüfen.':'The serial number cannot be changed while a disposal is linked. Check the order first.',
 'Die Retoure ist abgeschlossen. Bitte vor dem Anlegen eines Entsorgungsauftrags wieder öffnen.':'The return is completed. Reopen it before creating a disposal order.'
});
const states={planned:'Vorgemerkt',approved:'Freigegeben',completed:'Durchgeführt',cancelled:'Storniert'};
export function disposalLinks(items:any[]=[]){return html`<ul class="completion-disposals">${items.map(row=>html`<li><a href="/#disposals?record=${encodeURIComponent(row.disposalNumber)}">${icon('trash')}${h(row.disposalNumber)}</a><span class="status disposal-${row.status}">${h(t(states[row.status]??row.status))}</span></li>`).join('')}</ul>`;}
export function renderCompletion(state:any,disposals:any[]=[]){return html`<section class="completion-check ${state.ok?'is-ready':''}" aria-live="polite"><header>${icon(state.ok?'check':'clock')}<div><h3>Abschlussprüfung</h3><p>${t(state.ok?'Abschluss bereit':'Vor dem Abschluss ergänzen')}</p></div></header>${state.issues.length?html`<ul class="completion-issues">${state.issues.map(issue=>html`<li><button type="button" class="text-link" data-completion-field="${h(issue.field)}">${h(t(issue.message))}</button></li>`).join('')}</ul>`:''}${disposalLinks(disposals.filter(row=>row.disposalNumber))}</section>`;}
export function bindCompletionFields(root:HTMLElement,form:HTMLFormElement){root.querySelectorAll<HTMLElement>('[data-completion-field]').forEach(button=>button.onclick=()=>{const field=form.elements.namedItem(button.dataset.completionField) as HTMLElement;field?.focus();field?.scrollIntoView({block:'center',behavior:motionScrollBehavior()});});}
export function completionDisposals(result:any,item:any){
 if(result.disposals)return result.disposals;const check=result.completion?.disposalCheck;if(!check)return [];
 return [...(check.pending?[{status:'planned',serialNumber:item.serialNumber}]:[]),...(check.matchingCompleted?[{status:'completed',serialNumber:item.serialNumber}]:[]),...(check.mismatched?[{status:'completed',serialNumber:String(item.serialNumber)+'\u0000'}]:[])];
}
export function bindReturnCompletion(ctx:any,dialog:HTMLDialogElement,item:any,{statusOnly=false,onEdit}:any={}){
 const form=dialog.querySelector<HTMLFormElement>('form'),auth=captureAuthContext(ctx),active=()=>auth()&&dialog.open&&dialog.querySelector('form')===form;
 const root=document.createElement('div');root.className='completion-slot';form.querySelector('.dialog-body').append(root);
 let disposals=item.disposalSummary?.items??[],loaded=!item.id,state:any=null,loadError='';
 const input=(name:string)=>form.elements.namedItem(name) as HTMLInputElement;
 const closing=()=>(ctx.masterdata?.statuses??[]).some(row=>row.id===Number(input('statusId')?.value)&&row.isClosed);
 function update(){
  if(!active())return;const data={...item,...Object.fromEntries(new FormData(form))};state=inspectCompletion(data,ctx.masterdata,ctx.config?.rules,disposals);
  root.hidden=!closing();root.innerHTML=!loaded?html('<p class="muted" role="status">Abschlussprüfung wird geladen …</p>'):loadError?html`<p class="form-error" role="alert">${h(loadError)}</p>`:renderCompletion(state,disposals);
  if(statusOnly&&loaded&&!loadError&&!state.ok&&ctx.can('returnsEdit')){const button=document.createElement('button');button.type='button';button.className='btn secondary small';button.textContent=String(t('Abschlussdaten ergänzen'));button.onclick=()=>onEdit?.({...item,statusId:Number(input('statusId').value)});root.append(button);}
  bindCompletionFields(root,form);
  for(const name of ['replacementSerialNumber','notes']){const field=input(name);if(field){const always=name==='notes'&&ctx.config?.rules?.requiredFields?.includes('notes');field.required=!!always||closing()&&(name==='notes'?state.requirements.fields.includes('notes'):state.requirements.replacementSerial);
   const label=field.closest('label')?.querySelector(':scope > span');
   if(label&&!always){label.removeAttribute('data-rb-i18n-text');label.innerHTML=html`${h(t(name==='notes'?'Notizen':field.required?'Austauschseriennummer':'Austauschseriennummer (optional)'))}${field.required?html(' <b>*</b>'):''}`;}
  }}
  form.dispatchEvent(new Event('return-completion-updated'));
  form.querySelectorAll<HTMLButtonElement>('[type=submit]').forEach(button=>button.disabled=closing()&&(!loaded||!!loadError||!state.ok));
 }
 form.addEventListener('input',update);form.addEventListener('change',update);update();
 if(item.id)void ctx.api(`/api/returns/${item.id}/workflow`).then(result=>{if(!active())return;disposals=completionDisposals(result,item);loaded=true;update();}).catch(error=>{if(active()){loaded=true;loadError=String(apiError(error.message));update();}});
 return {valid:()=>!closing()||loaded&&!loadError&&state?.ok,update};
}
export function bindReturnLinkage(ctx:any,item:any,root:HTMLElement){
 const auth=captureAuthContext(ctx),active=()=>auth()&&root.isConnected;let generation=0;
 const render=(items:any[])=>{if(!active())return;root.innerHTML=html`<header><h3>Verknüpfte Entsorgung</h3></header>${items.length?disposalLinks(items):html('<p class="muted">Noch kein Entsorgungsauftrag verknüpft.</p>')}${!item.isClosed&&ctx.can('disposalsCreate')?html`<a class="btn secondary small" href="/#disposals?returnId=${item.id}">${icon('trash')}Entsorgung erfassen</a>`:''}`;};
 if(!ctx.can('disposalsRead')){root.remove();return;}render(item.disposalSummary?.items??[]);const token=++generation;
 void ctx.api(`/api/returns/${item.id}/workflow`).then(result=>{if(active()&&token===generation&&ctx.can('disposalsRead'))render(result.disposals??[]);}).catch(error=>{if(active())ctx.toast(apiError(error.message));});
}
