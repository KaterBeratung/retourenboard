import {html,t,addTranslations,formatDate,formatNumber} from './i18n.js';
import {h,icon} from './ui.js';
import {masterName} from './inventory-display.js';

addTranslations({
 'Dein nächster Schritt':'Your next step','Meine offenen Retouren':'My open returns','Heute fällig':'Due today','Nicht zugewiesen':'Unassigned',
 'Offene Vorgänge mit einem klaren nächsten Schritt.':'Open returns with a clear next step.',
 'Keine offenen Retouren für dich.':'No open returns assigned to you.','Heute ist nichts fällig.':'Nothing is due today.',
 'Alle offenen Retouren sind zugewiesen.':'All open returns are assigned.','Nächsten Schritt festlegen':'Set the next step',
 'Frist':'Due date','Retouren-Kennzahlen':'Return analytics','Bearbeitungszeit, Gründe und Entwicklung im Überblick.':'Completion time, reasons and trends at a glance.',
 'Durchschnittliche Bearbeitungszeit':'Average completion time','Tage':'days','Belegte Abschlüsse':'Documented completions',
 'Noch kein belegter Abschluss':'No documented completion yet','Häufigste Retourengründe':'Top return reasons','Ohne Grund':'No reason',
 'Noch keine Retouren erfasst.':'No returns recorded yet.','Letzte sechs Monate':'Last six months','Erfasst':'Created','Abgeschlossen':'Completed','Monat':'Month',
 'Abschlusszeiten ohne verlässliches Datum sind nicht enthalten.':'Completions without a reliable date are excluded.',
 'Ältere Abschlüsse ohne belegten Zeitpunkt':'Older completions without a documented time'
});

type CalendarOptions={now?:number;timezone?:string};
const defaultTimezone='Europe/Berlin';
export function workspaceCalendarDay(now=Date.now(),timezone=defaultTimezone){
 let formatter:Intl.DateTimeFormat;
 try{formatter=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'});}
 catch{formatter=new Intl.DateTimeFormat('en-CA',{timeZone:defaultTimezone,year:'numeric',month:'2-digit',day:'2-digit'});}
 const parts=formatter.formatToParts(Number.isFinite(now)?now:Date.now()),get=(type:string)=>parts.find(part=>part.type===type)?.value;
 return `${get('year')}-${get('month')}-${get('day')}`;
}
function calendarDate(value:unknown):string|null{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
 const date=new Date(value+'T12:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value?value:null;
}
function timestamp(value:unknown):number|null{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!calendarDate(value.slice(0,10)))return null;
 const date=Date.parse(value);return Number.isFinite(date)?date:null;
}
export function workspaceActionModel(rows:any[],userId?:number,options:CalendarOptions&{limit?:number}={}){
 const today=workspaceCalendarDay(options.now,options.timezone),open=rows.filter(row=>!row.isClosed),limit=options.limit??3;
 const sort=(items:any[])=>[...items].sort((a,b)=>{
  const first=calendarDate(a.dueDate),second=calendarDate(b.dueDate);
  return (first??'9999').localeCompare(second??'9999')||(timestamp(b.createdAt)??0)-(timestamp(a.createdAt)??0)||a.id-b.id;
 });
 const groups=[
  {key:'mine',title:'Meine offenen Retouren',empty:'Keine offenen Retouren für dich.',route:'#returns?scope=open&assignee=mine',items:open.filter(row=>Number.isSafeInteger(userId)&&userId>0&&row.assignedUserId===userId)},
  {key:'today',title:'Heute fällig',empty:'Heute ist nichts fällig.',route:'#returns?scope=today',items:open.filter(row=>calendarDate(row.dueDate)===today)},
  {key:'unassigned',title:'Nicht zugewiesen',empty:'Alle offenen Retouren sind zugewiesen.',route:'#returns?scope=open&assignee=unassigned',items:open.filter(row=>row.assignedUserId==null)}
 ];
 return {today,groups:groups.map(group=>({...group,total:group.items.length,items:sort(group.items).slice(0,limit)}))};
}
export function workspaceAnalytics(rows:any[],options:CalendarOptions={}){
 const now=options.now??Date.now(),today=workspaceCalendarDay(now,options.timezone),[year,month]=today.split('-').map(Number);
 const months=Array.from({length:6},(_,index)=>{
  const date=new Date(Date.UTC(year,month-6+index,1)),key=date.toISOString().slice(0,7);
  return {key,created:0,completed:0};
 }),byMonth=new Map(months.map(month=>[month.key,month])),reasonCounts=new Map<string,{reason:string;reasonId:number|null;count:number}>();
 let duration=0,durationCount=0,closedWithoutCompletion=0;
 for(const row of rows){
  const created=timestamp(row.createdAt),completed=row.isClosed?timestamp(row.completedAt):null;
  const validCompletion=completed!==null&&completed<=now&&(created===null||completed>=created);
  if(created!==null&&created<=now){const bucket=byMonth.get(workspaceCalendarDay(created,options.timezone).slice(0,7));if(bucket)bucket.created++;}
  if(validCompletion){
   const bucket=byMonth.get(workspaceCalendarDay(completed,options.timezone).slice(0,7));if(bucket)bucket.completed++;
   if(created!==null){duration+=completed-created;durationCount++;}
  }else if(row.isClosed)closedWithoutCompletion++;
  const reason=typeof row.reason==='string'?row.reason:'',reasonId=Number.isSafeInteger(row.reasonId)&&row.reasonId>0?row.reasonId:null,key=reasonId===null?'name:'+reason:'id:'+reasonId;
  const existing=reasonCounts.get(key);if(existing)existing.count++;else reasonCounts.set(key,{reason,reasonId,count:1});
 }
 return {averageCompletionDays:durationCount?duration/durationCount/86400000:null,durationCount,closedWithoutCompletion,
  reasons:[...reasonCounts.values()].sort((a,b)=>b.count-a.count||a.reason.localeCompare(b.reason)).slice(0,5),months};
}
function options(ctx:any):CalendarOptions{return {timezone:ctx.config?.rules?.timezone,now:ctx.insightsNow};}
export function renderWorkspaceActions(ctx:any){
 const model=workspaceActionModel(ctx.returns??[],ctx.session?.user?.id,{...options(ctx),limit:2});
 return html`<section class="workspace-actions" data-overview-section aria-labelledby="workspace-actions-title"><div class="insights-heading"><div><span class="eyebrow">Dein nächster Schritt</span><h2 id="workspace-actions-title">Offene Vorgänge mit einem klaren nächsten Schritt.</h2></div></div><div class="action-queue-grid" data-overview-group="queues">${model.groups.map(group=>html`<section class="panel action-queue" data-overview-card="${group.key}" data-overview-empty="${group.total===0}"><div class="panel-heading"><h3><a href="${h(group.route)}">${t(group.title)} <span class="count-pill">${group.total}</span></a></h3>${icon(group.key==='mine'?'users':group.key==='today'?'calendar':'return')}</div>${group.items.length?html`<ul class="action-queue-list">${group.items.map(row=>html`<li><a class="action-queue-item" href="#returns?detail=${row.id}"><span class="action-queue-record"><strong>${h(row.returnNumber||'—')}</strong><small title="${h(row.productName||'')}">${h(row.productName||'')}</small></span><span class="action-queue-next" title="${h(row.nextStep||t('Nächsten Schritt festlegen'))}">${row.nextStep?h(row.nextStep):t('Nächsten Schritt festlegen')}</span>${calendarDate(row.dueDate)?html`<span class="action-queue-due${row.dueDate<model.today?' overdue':''}">${t('Frist')}: ${h(formatDate(row.dueDate+'T12:00:00',{day:'2-digit',month:'2-digit'},'toLocaleDateString'))}</span>`:''}${icon('arrow')}</a></li>`).join('')}</ul>`:html`<p class="queue-empty">${t(group.empty)}</p>`}<a class="action-queue-all text-link" href="${h(group.route)}">Alle ansehen ${icon('arrow')}</a></section>`).join('')}</div></section>`;
}
export function renderWorkspaceAnalytics(ctx:any){
 const data=workspaceAnalytics(ctx.returns??[],options(ctx)),peak=Math.max(1,...data.months.flatMap(month=>[month.created,month.completed]));
 const reasonLabel=(reason:any)=>reason.reason?masterName(ctx.masterdata,'reasons',reason.reason):t('Ohne Grund');
 return html`<section class="workspace-analytics" data-overview-section aria-labelledby="workspace-analytics-title"><div class="insights-heading"><div><h2 id="workspace-analytics-title">Retouren-Kennzahlen</h2><p>Bearbeitungszeit, Gründe und Entwicklung im Überblick.</p></div></div><div class="analytics-grid" data-overview-group="analytics"><section class="panel completion-metric" data-overview-card="completion" data-overview-empty="${data.averageCompletionDays===null}"><h3>Durchschnittliche Bearbeitungszeit</h3><p class="completion-value">${data.averageCompletionDays===null?'—':formatNumber(data.averageCompletionDays,{maximumFractionDigits:1})}${data.averageCompletionDays!==null?html` <small>Tage</small>`:''}</p><p class="analytics-note">${data.durationCount?html`${t('Belegte Abschlüsse')}: ${data.durationCount}`:t('Noch kein belegter Abschluss')}</p><p class="analytics-note">Abschlusszeiten ohne verlässliches Datum sind nicht enthalten.</p>${data.closedWithoutCompletion?html`<small class="analytics-note">${t('Ältere Abschlüsse ohne belegten Zeitpunkt')}: ${data.closedWithoutCompletion}</small>`:''}</section><section class="panel reason-metric" data-overview-card="reasons" data-overview-empty="${!data.reasons.length}"><h3>Häufigste Retourengründe</h3>${data.reasons.length?html`<ol class="reason-ranking">${data.reasons.map(reason=>html`<li><span>${h(reasonLabel(reason))}</span><strong>${reason.count}</strong></li>`).join('')}</ol>`:html`<p class="analytics-note">Noch keine Retouren erfasst.</p>`}</section><section class="panel trend-metric" data-overview-card="trend" data-overview-empty="${!data.months.some(month=>month.created||month.completed)}"><div class="trend-heading"><h3>Letzte sechs Monate</h3><div class="trend-legend"><span><i class="created-key"></i>Erfasst</span><span><i class="completed-key"></i>Abgeschlossen</span></div></div><div class="trend-table-scroll"><table class="trend-table"><thead><tr><th scope="col">Monat</th><th scope="col">Erfasst</th><th scope="col">Abgeschlossen</th></tr></thead><tbody>${data.months.map(month=>html`<tr><th scope="row">${h(formatDate(month.key+'-01T12:00:00',{month:'short',year:'2-digit'},'toLocaleDateString'))}</th><td><span class="trend-bar created-key" style="width:${Math.round(month.created/peak*100)}%" aria-hidden="true"></span><strong>${month.created}</strong></td><td><span class="trend-bar completed-key" style="width:${Math.round(month.completed/peak*100)}%" aria-hidden="true"></span><strong>${month.completed}</strong></td></tr>`).join('')}</tbody></table></div></section></div></section>`;
}
