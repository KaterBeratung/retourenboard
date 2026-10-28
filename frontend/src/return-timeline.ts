import {html,t,addTranslations,setText,apiError} from './i18n.js';
import {h,icon} from './ui.js';
import {returnTimestamp,masterValue} from './inventory-display.js';
import {captureAuthContext} from './auth-context.js';
addTranslations({
 'Verlauf':'Timeline','Die wichtigsten Schritte an diesem Vorgang.':'Key activity on this return.',
 'Retoure erfasst':'Return created','Status geändert':'Status changed','Zuständigkeit geändert':'Responsibility changed','Nächster Schritt geändert':'Next step changed',
 'Kommentar hinzugefügt':'Comment added','Datei hochgeladen':'File uploaded','Aktivität':'Activity',
 'Ältere Aktivitäten laden':'Load older activity','Noch keine weiteren Aktivitäten.':'No further activity yet.',
 'Verlauf wird geladen …':'Loading timeline …','Verlauf aktualisieren':'Refresh timeline','System':'System',
 'Die neuesten Aktivitäten zuerst. Zusammengehörige Änderungen werden gemeinsam angezeigt.':'Latest activity first. Related changes are shown together.',
 'Mehr anzeigen':'Show more','Weniger anzeigen':'Show less'
});
const labels={created:'Retoure erfasst',status:'Status geändert',assignment:'Zuständigkeit geändert',nextStep:'Nächster Schritt geändert',comment:'Kommentar hinzugefügt',attachment:'Datei hochgeladen'};
const shapes={created:'return',status:'refresh',assignment:'users',nextStep:'arrow',comment:'chat',attachment:'file'};
// Only parts from the same recorded write are grouped; equal timestamps alone are insufficient.
function activityGroups(items:any[]){
 const groups:any[][]=[],audit=new Map<string,any[]>();
 for(const entry of items){const operation=String(entry.id).match(/^audit:(\d+):(created|status|assignment|nextStep)$/),key=operation?operation[1]+':'+entry.at:null;
  if(key&&audit.has(key))audit.get(key).push(entry);else{const group=[entry];groups.push(group);if(key)audit.set(key,group);}
 }
 return groups;
}
export function renderTimelineItems(items:any[],masters:any){
 return html`<ol class="return-timeline-list">${activityGroups(items).map(parts=>{
  const primary=parts.find(row=>row.type==='created')??parts.find(row=>row.type==='status')??parts[0],rest=parts.filter(row=>row!==primary);
  const detail=(entry:any)=>{const status=(prefix:string)=>masterValue(masters,{statusId:entry[prefix+'Id'],status:entry[prefix]},'status');return entry.type==='status'&&entry.fromStatus&&entry.toStatus?html`${h(status('fromStatus'))} ${icon('arrow')} ${h(status('toStatus'))}`:h(entry.text||'—');};
  const long=parts.some(row=>Boolean(row.text));
  return html`<li class="timeline-event${primary.type==='created'?' timeline-created':''}" data-timeline-id="${h(primary.id)}" tabindex="-1"><span class="timeline-symbol">${icon(shapes[primary.type]||'clock')}</span><div class="timeline-event-body"><header><strong>${t(labels[primary.type]||'Aktivität')}</strong><span>${returnTimestamp(primary.at)}</span></header><small>${h(primary.actorName||t('System'))}</small>${primary.reopenReason?html`<p class="timeline-text"><strong>${t('Änderungsgrund')}:</strong> ${h(primary.reopenReason)}</p>`:''}${primary.text?html`<p class="timeline-text">${detail(primary)}</p>`:''}${rest.length?html`<dl class="timeline-changes">${rest.map(entry=>html`<div data-timeline-part="${h(entry.id)}"><dt>${t(({assignment:'Verantwortliche Person',nextStep:'Nächster Schritt'})[entry.type]??labels[entry.type]??'Aktivität')}</dt><dd class="timeline-text">${detail(entry)}</dd></div>`).join('')}</dl>`:''}${long?html`<button class="text-link timeline-expand" type="button" aria-expanded="false">Mehr anzeigen</button>`:''}</div></li>`;
 }).join('')}</ol>`;
}
const timelineBindings=new WeakMap<object,()=>void>();
export function bindReturnTimeline(ctx:any,item:any,root:HTMLElement){
 if(!root)return;
 const current=captureAuthContext(ctx),dialog=root.closest('dialog'),active=()=>current()&&root.isConnected&&dialog?.open!==false;
 root.innerHTML=html`<header class="timeline-heading"><div><h3>${icon('clock')}Verlauf</h3><p class="muted">Die neuesten Aktivitäten zuerst. Zusammengehörige Änderungen werden gemeinsam angezeigt.</p></div><button class="icon-btn" type="button" data-timeline-refresh aria-label="Verlauf aktualisieren">${icon('refresh')}</button></header><div class="timeline-content" aria-live="polite"><p class="muted" role="status">Verlauf wird geladen …</p></div><button class="btn secondary small" type="button" data-timeline-older hidden>Ältere Aktivitäten laden</button>`;
 let cursor:string|null=null,entries:any[]=[],busy=false,pendingRefresh=false,painted:string|null=null;
 const content=root.querySelector<HTMLElement>('.timeline-content'),older=root.querySelector<HTMLButtonElement>('[data-timeline-older]'),refresh=root.querySelector<HTMLButtonElement>('[data-timeline-refresh]');
 function updateOverflow(){if(!active())return;for(const button of content.querySelectorAll<HTMLButtonElement>('.timeline-expand')){const row=button.closest<HTMLElement>('.timeline-event');button.hidden=!row.classList.contains('expanded')&&![...row.querySelectorAll<HTMLElement>('.timeline-text')].some(text=>text.scrollHeight>text.clientHeight+1);}}
 function paint(){
  const markup=String(entries.length?renderTimelineItems(entries,ctx.masterdata):html('<p class="muted">Noch keine weiteren Aktivitäten.</p>'));if(markup===painted){root.querySelector('.timeline-error')?.remove?.();return;}
  const expanded=new Set([...content.querySelectorAll<HTMLElement>('.timeline-event.expanded')].map(row=>row.dataset.timelineId)),focused=document.activeElement as HTMLElement,focusId=content.contains?.(focused)?focused.closest<HTMLElement>('[data-timeline-id]')?.dataset.timelineId:null;
  content.innerHTML=markup;painted=markup;
  content.querySelectorAll<HTMLButtonElement>('.timeline-expand').forEach(button=>{const row=button.closest<HTMLElement>('.timeline-event'),show=(value:boolean)=>{button.setAttribute('aria-expanded',String(value));row.classList.toggle('expanded',value);setText(button,t(value?'Weniger anzeigen':'Mehr anzeigen'));button.hidden=false;};if(expanded.has(row.dataset.timelineId))show(true);button.onclick=()=>show(button.getAttribute('aria-expanded')!=='true');});
  updateOverflow();
  if(focusId){const row=[...content.querySelectorAll<HTMLElement>('[data-timeline-id]')].find(row=>row.dataset.timelineId===focusId);(row?.querySelector<HTMLElement>('.timeline-expand')??row)?.focus({preventScroll:true});}
 }
 async function load(append=false){
  if(!active())return;if(busy){if(!append)pendingRefresh=true;return;}busy=true;older.disabled=true;refresh.disabled=true;
  try{const query=new URLSearchParams({limit:'30'});if(append&&cursor)query.set('before',cursor);
   const data=await ctx.api(`/api/returns/${item.id}/timeline?${query}`);if(!active())return;
   entries=append?[...entries,...data.items.filter(entry=>!entries.some(old=>old.id===entry.id))]:data.items;cursor=data.nextCursor;
   if(!pendingRefresh)paint();older.hidden=!cursor;
  }catch(err){if(active()){let error=root.querySelector<HTMLElement>('.timeline-error');if(!error){error=document.createElement('p');error.className='form-error timeline-error';error.setAttribute('role','alert');content.prepend(error);}setText(error,apiError(err.message));}}
  finally{busy=false;if(active()){older.disabled=false;refresh.disabled=false;if(pendingRefresh){pendingRefresh=false;void load();}}}
 }
 older.onclick=()=>void load(true);refresh.onclick=()=>void load();
 let observer:ResizeObserver;if(dialog)timelineBindings.get(dialog)?.();if(typeof ResizeObserver!=='undefined'){observer=new ResizeObserver(updateOverflow);observer.observe(content);}
 if(dialog){const activity=()=>{if(active())void load();};dialog.addEventListener('return-activity-changed',activity);timelineBindings.set(dialog,()=>{dialog.removeEventListener?.('return-activity-changed',activity);observer?.disconnect();});}
 void load();
}
