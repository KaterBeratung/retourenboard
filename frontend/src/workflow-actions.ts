import {html,t,addTranslations,apiError,setText} from './i18n.js';
import {h,icon,openDialog,trackFormSave} from './ui.js';
import {captureAuthContext} from './auth-context.js';
import {masterLabel} from './inventory-display.js';
addTranslations({
 'Exportieren':'Export',
 'Auswahl':'Selection','Auswahl auf dieser Seite':'Select this page','Auswahl aufheben':'Clear selection','Ausgewählte Retouren':'Selected returns',
 'Status für Auswahl ändern':'Change status for selection','Auswahl exportieren':'Export selection','Retouren gemeinsam bearbeiten':'Update selected returns',
 'Alle ausgewählten Retouren erhalten denselben Status.':'All selected returns will receive the same status.',
 'Bitte einen aktiven Status auswählen.':'Please select an active status.',
 'Maximal':'Up to','Retouren gleichzeitig auswählen.':'returns can be selected at a time.',
 'Retouren ausgewählt':'returns selected','Retouren aktualisiert.':'returns updated.',
 'Keine Retoure ausgewählt.':'No return selected.','Retouren auswählen':'Select returns',
 'Bitte 1 bis 200 unterschiedliche Retouren mit gültigen IDs auswählen.':'Select 1 to 200 different returns with valid IDs.',
 'Der Verlauf muss 1 bis 100 Einträge pro Seite enthalten.':'A timeline page must contain 1 to 100 entries.',
 'Ungültige Verlaufsmarkierung. Bitte den Verlauf erneut öffnen.':'Invalid timeline cursor. Please reopen the timeline.',
 'Ungültige Verlaufsseite.':'Invalid timeline page.','Zuständig (Konto-ID)':'Assigned account ID',
 'Rückgängig':'Undo','Statuswechsel rückgängig gemacht.':'Status change undone.',
 'Rückgängig ist nicht mehr verfügbar. Bitte den aktuellen Status prüfen.':'Undo is no longer available. Please check the current status.',
 'Die Retoure wurde inzwischen geändert. Bitte den aktuellen Status prüfen.':'The return has changed since then. Please check its current status.',
 'Nur dein eigener Statuswechsel kann rückgängig gemacht werden.':'You can only undo your own status change.',
 'Ungültige Rückgängig-Aktion.':'Invalid undo action.'
});
const text=(value:any,max=250)=>typeof value==='string'&&!/[\x00-\x1f]/.test(value)?value.slice(0,max):'';
export function readWorkspaceFilter(hash:string):any|null{
 const [view,query='']=hash.replace(/^#/,'').split('?');if(!['returns','products'].includes(view))return null;
 const params=new URLSearchParams(query),get=(key:string,max=250)=>text(params.get(key),max);
 const candidate=get('scope'),assignee=get('assignee',20);
 return {view,search:get('search',500),scope:(view==='returns'?['open','checking','closed','overdue','today']:['active']).includes(candidate)?candidate:'',status:view==='returns'?get('status'):'',category:view==='products'?get('category'):'',activity:view==='products'&&['active','all','archived'].includes(get('activity'))?get('activity'):'active',reason:view==='returns'?get('reason'):'',assignee:view==='returns'&&(['mine','unassigned'].includes(assignee)||/^[1-9]\d*$/.test(assignee))?assignee:''};
}
export function filterRoute(filter:any){
 const view=filter.view==='products'?'products':'returns',params=new URLSearchParams();
 for(const key of ['search','scope','status','category','activity','reason','assignee'])if(typeof filter[key]==='string'&&filter[key]&&!(key==='activity'&&filter[key]==='active'))params.set(key,filter[key]);
 const safe=readWorkspaceFilter('#'+view+'?'+params),result=new URLSearchParams();
 for(const key of ['search','scope','status','category','activity','reason','assignee'])if(safe[key]&&!(key==='activity'&&safe[key]==='active'))result.set(key,safe[key]);
 return '#'+view+(result.size?'?'+result:'');
}
export function createReturnSelection(limit=200){
 const chosen=new Set<number>();
 const valid=(id:any)=>Number.isSafeInteger(id)&&id>0;
 const validate=(ids:number[])=>{if(ids.some(id=>!valid(id)))throw new Error(t('Ungültige Auswahl.'));if(new Set(ids).size>limit)throw new Error(t`Maximal ${limit} Retouren gleichzeitig auswählen.`);};
 return {
  ids:()=>[...chosen].sort((a,b)=>a-b),has:(id:number)=>chosen.has(id),clear:()=>chosen.clear(),
  choose(id:number,checked:boolean){validate([id]);if(checked){validate([...chosen,id]);chosen.add(id);}else chosen.delete(id);},
  togglePage(ids:number[],checked:boolean){validate(ids);if(checked)validate([...chosen,...ids]);for(const id of ids)if(checked)chosen.add(id);else chosen.delete(id);},
  reconcile(ids:number[]){const available=new Set(ids);for(const id of chosen)if(!available.has(id))chosen.delete(id);},
  all:(ids:number[])=>ids.length>0&&ids.every(id=>chosen.has(id))
 };
}
// Desktop table and mobile cards share native checked/indeterminate states.
export function syncPageSelection(root:ParentNode,selection:ReturnType<typeof createReturnSelection>,ids:number[]){
 const checked=selection.all(ids),indeterminate=!checked&&ids.some(id=>selection.has(id));
 root.querySelectorAll<HTMLInputElement>('[data-select-page]').forEach(input=>{input.checked=checked;input.indeterminate=indeterminate;});
}
export function selectionToolbar(ctx:any,selection:ReturnType<typeof createReturnSelection>){
 const count=selection.ids().length;if(!count)return '';
 return html`<div class="selection-toolbar" role="region" aria-label="Ausgewählte Retouren"><strong aria-live="polite">${icon('check')}<span>${t`${count} Retouren ausgewählt`}</span></strong><div>${ctx.can('returnsStatus')?html`<button class="btn secondary small" type="button" data-bulk-status aria-label="${h(t('Status für Auswahl ändern'))}">${icon('refresh')}<span class="selection-label-full">Status für Auswahl ändern</span><span class="selection-label-compact" aria-hidden="true">Status ändern</span></button>`:''}${ctx.can('returnsExport')?html`<a class="btn secondary small" data-bulk-export aria-label="${h(t('Auswahl exportieren'))}" href="/api/export/returns?${new URLSearchParams({ids:selection.ids().join(',')})}">${icon('download')}<span class="selection-label-full">Auswahl exportieren</span><span class="selection-label-compact" aria-hidden="true">${t('Exportieren')}</span></a>`:''}<button type="button" class="icon-btn" data-selection-clear aria-label="Auswahl aufheben">${icon('close')}</button></div></div>`;
}
export function offerStatusUndo(ctx:any,result:any,message:string){
 const current=captureAuthContext(ctx),undo=result?.undo,expires=Date.parse(undo?.expiresAt),remaining=expires-Date.now();
 if(!undo?.token||!Number.isFinite(expires)||remaining<=0||!ctx.can('returnsStatus')){ctx.toast(message);return;}
 let used=false;
 ctx.toast(message,{label:t('Rückgängig'),durationMs:Math.min(12000,remaining),onAction:async()=>{
  if(used||!current())return;used=true;
  try{
   if(!ctx.can('returnsStatus'))throw new Error(t('Diese Aktion ist nicht erlaubt.'));
   if(Date.now()>=expires)throw new Error(t('Rückgängig ist nicht mehr verfügbar. Bitte den aktuellen Status prüfen.'));
   await ctx.api('/api/returns/status/undo',{method:'POST',body:{token:undo.token}});
   if(!current())return;await ctx.reload();if(current())ctx.toast(t('Statuswechsel rückgängig gemacht.'));
  }catch(error){if(current())ctx.toast(apiError(error.message));}
 }});
}
export function openBulkStatus(ctx:any,ids:number[],after:()=>unknown){
 if(!ids.length){ctx.toast(t('Keine Retoure ausgewählt.'));return;}
 if(!ctx.can('returnsStatus'))return;
 const revisions=Object.fromEntries(ids.map(id=>[id,ctx.returns.find(row=>row.id===id)?.revision]));
 const values=(ctx.masterdata.statuses??[]).filter(s=>s.active),dialog=openDialog({title:t('Retouren gemeinsam bearbeiten'),subtitle:t`${ids.length} Retouren ausgewählt`,body:html`<form><div class="dialog-body"><p class="muted">Alle ausgewählten Retouren erhalten denselben Status.</p><label class="field"><span>Neuer Status</span><select name="statusId" required><option value="">Bitte auswählen</option>${values.map(status=>html`<option value="${status.id}">${h(masterLabel(status))}</option>`).join('')}</select></label><p class="form-error" role="alert" hidden></p></div><div class="dialog-footer"><button type="button" class="btn secondary" data-close>Abbrechen</button><button type="submit" class="btn primary">${icon('check')}Status speichern</button></div></form>`});
 const form:HTMLFormElement=dialog.querySelector('form'),startSave=trackFormSave(form),current=captureAuthContext(ctx);let saving=false;form.onsubmit=async(event)=>{
  event.preventDefault();if(saving||!current())return;saving=true;const committed=startSave(),button=form.querySelector<HTMLButtonElement>('[type=submit]'),error=form.querySelector<HTMLElement>('.form-error');button.disabled=true;error.hidden=true;
  try{if(!ctx.can('returnsStatus'))throw new Error(t('Diese Aktion ist nicht erlaubt.'));const statusId=Number((form.elements.namedItem('statusId') as HTMLSelectElement).value);if(!statusId)throw new Error(t('Bitte einen aktiven Status auswählen.'));
   const result=await ctx.api('/api/returns/bulk/status',{method:'POST',body:{ids,statusId,revisions}});if(!current()||dialog.querySelector('form')!==form)return;if(!committed())return;dialog.close();after();await ctx.reload();if(current())offerStatusUndo(ctx,result,t`${result.updated} Retouren aktualisiert.`);
  }catch(err){if(current()&&dialog.querySelector('form')===form){setText(error,apiError(err.message));error.hidden=false;}}finally{button.disabled=false;saving=false;}
 };
}
