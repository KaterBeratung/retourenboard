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
 'Mehr anzeigen':'Show more','Weniger anzeigen':'Show less'
});
const labels={created:'Retoure erfasst',status:'Status geändert',assignment:'Zuständigkeit geändert',nextStep:'Nächster Schritt geändert',comment:'Kommentar hinzugefügt',attachment:'Datei hochgeladen'};
const shapes={created:'return',status:'refresh',assignment:'users',nextStep:'arrow',comment:'chat',attachment:'file'};
export function renderTimelineItems(items:any[],masters:any){
 return html`<ol class="return-timeline-list">${items.map(entry=>{
  const status=(prefix:string)=>masterValue(masters,{statusId:entry[prefix+'Id'],status:entry[prefix]},'status');
  const text=entry.type==='status'&&entry.fromStatus&&entry.toStatus?html`${h(status('fromStatus'))} ${icon('arrow')} ${h(status('toStatus'))}`:h(entry.text||'');
  return html`<li class="timeline-event" data-timeline-id="${h(entry.id)}"><span class="timeline-symbol">${icon(shapes[entry.type]||'clock')}</span><div><header><strong>${t(labels[entry.type]||'Aktivität')}</strong><span>${returnTimestamp(entry.at)}</span></header><small>${h(entry.actorName||t('System'))}</small>${entry.text?html`<p class="timeline-text">${text}</p>${entry.text.length>200?html`<button class="text-link timeline-expand" type="button" aria-expanded="false">Mehr anzeigen</button>`:''}`:''}</div></li>`;
 }).join('')}</ol>`;
}
export function bindReturnTimeline(ctx:any,item:any,root:HTMLElement){
 if(!root)return;
 const current=captureAuthContext(ctx),active=()=>current()&&root.isConnected;
 root.innerHTML=html`<header class="timeline-heading"><div><h3>${icon('clock')}Verlauf</h3><p class="muted">Die wichtigsten Schritte an diesem Vorgang.</p></div><button class="icon-btn" type="button" data-timeline-refresh aria-label="Verlauf aktualisieren">${icon('refresh')}</button></header><div class="timeline-content" aria-live="polite"><p class="muted" role="status">Verlauf wird geladen …</p></div><button class="btn secondary small" type="button" data-timeline-older hidden>Ältere Aktivitäten laden</button>`;
 let cursor:string|null=null,entries:any[]=[],busy=false;
 const content=root.querySelector<HTMLElement>('.timeline-content'),older=root.querySelector<HTMLButtonElement>('[data-timeline-older]'),refresh=root.querySelector<HTMLButtonElement>('[data-timeline-refresh]');
 async function load(append=false){
  if(busy||!active())return;busy=true;older.disabled=true;refresh.disabled=true;
  try{const query=new URLSearchParams({limit:'30'});if(append&&cursor)query.set('before',cursor);
   const data=await ctx.api(`/api/returns/${item.id}/timeline?${query}`);if(!active())return;
   entries=append?[...entries,...data.items.filter(entry=>!entries.some(old=>old.id===entry.id))]:data.items;cursor=data.nextCursor;
   content.innerHTML=entries.length?renderTimelineItems(entries,ctx.masterdata):html('<p class="muted">Noch keine weiteren Aktivitäten.</p>');older.hidden=!cursor;
   content.querySelectorAll<HTMLButtonElement>('.timeline-expand').forEach(button=>button.onclick=()=>{const expanded=button.getAttribute('aria-expanded')!=='true';button.setAttribute('aria-expanded',String(expanded));button.closest('.timeline-event').classList.toggle('expanded',expanded);setText(button,t(expanded?'Weniger anzeigen':'Mehr anzeigen'));});
  }catch(err){if(active()){let error=root.querySelector<HTMLElement>('.timeline-error');if(!error){error=document.createElement('p');error.className='form-error timeline-error';error.setAttribute('role','alert');content.prepend(error);}setText(error,apiError(err.message));}}
  finally{busy=false;if(active()){older.disabled=false;refresh.disabled=false;}}
 }
 older.onclick=()=>void load(true);refresh.onclick=()=>void load();
 root.closest('dialog')?.addEventListener('return-activity-changed',()=>{if(active())void load();});
 void load();
}
