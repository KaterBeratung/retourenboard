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
 'Ältere Abschlüsse ohne belegten Zeitpunkt':'Older completions without a documented time',
 'Anteil aller Retouren':'Share of all returns','Werte als Tabelle':'View data table',
 'Keine Retouren in diesem Zeitraum.':'No returns in this period.',
 'Offene Retouren nach Lieferant':'Open returns by supplier','Anteil aller offenen Retouren':'Share of all open returns','Keine offenen Retouren.':'No open returns.','Ohne Lieferant':'No supplier'
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
 return html`<section class="workspace-actions" data-overview-section aria-labelledby="workspace-actions-title"><div class="insights-heading"><div><span class="eyebrow">Dein nächster Schritt</span><h2 id="workspace-actions-title">Offene Vorgänge mit einem klaren nächsten Schritt.</h2></div></div><div class="action-queue-grid" data-overview-group="queues">${model.groups.map(group=>html`<section class="panel action-queue" data-overview-card="${group.key}" data-overview-empty="${group.total===0}"><div class="panel-heading"><h3><a href="${h(group.route)}">${t(group.title)} <span class="count-pill">${group.total}</span></a></h3><span class="queue-symbol" aria-hidden="true">${icon(group.key==='mine'?'users':group.key==='today'?'calendar':'return')}</span></div>${group.items.length?html`<ul class="action-queue-list">${group.items.map(row=>html`<li><a class="action-queue-item" href="#returns?detail=${row.id}"><span class="action-queue-record"><strong>${h(row.returnNumber||'—')}</strong><small title="${h(row.productName||'')}">${h(row.productName||'')}</small></span><span class="action-queue-next" title="${h(row.nextStep||t('Nächsten Schritt festlegen'))}">${row.nextStep?h(row.nextStep):t('Nächsten Schritt festlegen')}</span>${calendarDate(row.dueDate)?html`<span class="action-queue-due${row.dueDate<model.today?' overdue':''}">${t('Frist')}: ${h(formatDate(row.dueDate+'T12:00:00',{day:'2-digit',month:'2-digit'},'toLocaleDateString'))}</span>`:''}${icon('arrow')}</a></li>`).join('')}</ul>`:html`<p class="queue-empty">${t(group.empty)}</p>`}<a class="action-queue-all text-link" href="${h(group.route)}">Alle ansehen ${icon('arrow')}</a></section>`).join('')}</div></section>`;
}
type Analytics=ReturnType<typeof workspaceAnalytics>;
const monthLabel=(key:string)=>formatDate(key+'-01T12:00:00',{month:'short',year:'2-digit'},'toLocaleDateString');
function renderMonthlyChart(data:Analytics){
 const peak=Math.max(0,...data.months.flatMap(month=>[month.created,month.completed]));
 const roughStep=Math.max(1,peak/4),magnitude=10**Math.floor(Math.log10(roughStep));
 const step=[1,2,5,10].map(value=>value*magnitude).find(value=>value>=roughStep)!,ceiling=step*4;
 const summary=data.months.map(month=>t`${monthLabel(month.key)}: ${t('Erfasst')} ${formatNumber(month.created)}, ${t('Abgeschlossen')} ${formatNumber(month.completed)}`).reduce((previous,current)=>t`${previous}; ${current}`);
 return html`<figure class="trend-figure">
  <div class="monthly-chart" role="img" aria-label="${h(summary)}">
   <div class="chart-y-axis" aria-hidden="true">${[4,3,2,1,0].map(value=>html`<span>${formatNumber(value*step,{notation:'compact',maximumFractionDigits:1})}</span>`).join('')}</div>
   <div class="chart-months" aria-hidden="true">${data.months.map(month=>{
    const createdHeight=month.created/ceiling*180,completedHeight=month.completed/ceiling*180;
    return html`<div class="month-column" title="${h(monthLabel(month.key))}: ${t('Erfasst')} ${formatNumber(month.created)}, ${t('Abgeschlossen')} ${formatNumber(month.completed)}"><svg class="month-bars" viewBox="0 0 100 180" preserveAspectRatio="none" focusable="false"><rect class="month-bar created-key" x="16" y="${180-createdHeight}" width="28" height="${createdHeight}" rx="4"/><rect class="month-bar completed-key" x="56" y="${180-completedHeight}" width="28" height="${completedHeight}" rx="4"/></svg><span class="month-label">${h(monthLabel(month.key))}</span></div>`;
   }).join('')}</div>
  </div>
  ${peak===0?html`<p class="analytics-note chart-empty">Keine Retouren in diesem Zeitraum.</p>`:''}
  <details class="trend-values"><summary>Werte als Tabelle</summary><div class="trend-table-scroll"><table class="trend-table"><caption class="sr-only">Letzte sechs Monate</caption><thead><tr><th scope="col">Monat</th><th scope="col">Erfasst</th><th scope="col">Abgeschlossen</th></tr></thead><tbody>${data.months.map(month=>html`<tr><th scope="row">${h(monthLabel(month.key))}</th><td>${formatNumber(month.created)}</td><td>${formatNumber(month.completed)}</td></tr>`).join('')}</tbody></table></div></details>
 </figure>`;
}
function renderReasonChart(ctx:any,data:Analytics){
 if(!data.reasons.length)return html`<p class="analytics-note">Noch keine Retouren erfasst.</p>`;
 const total=ctx.returns.length;
 return html`<p class="analytics-note reason-note">Anteil aller Retouren</p><ol class="reason-ranking">${data.reasons.map(reason=>{
  const label=reason.reason?masterName(ctx.masterdata,'reasons',reason.reason):t('Ohne Grund');
  const share=reason.count/total,percentage=formatNumber(share,{style:'percent',maximumFractionDigits:1});
  return html`<li aria-label="${h(label)}: ${formatNumber(reason.count)} (${percentage})"><div class="reason-label"><span>${h(label)}</span><strong>${formatNumber(reason.count)}<small>${percentage}</small></strong></div><svg class="reason-track" viewBox="0 0 100 7" preserveAspectRatio="none" aria-hidden="true" focusable="false"><rect class="reason-track-fill" width="100" height="7" rx="3.5"/><rect class="reason-bar" width="${share*100}" height="7" rx="3.5"/></svg></li>`;
 }).join('')}</ol>`;
}
// Figures for the overview strip. Everything derives from the rows already loaded; nothing is requested again.
export function overviewFigures(rows:any[],products:any[]=[],options:CalendarOptions={}){
 const now=options.now??Date.now(),today=workspaceCalendarDay(now,options.timezone),day=86400000,cutoff=now-30*day;
 const open=rows.filter(row=>!row.isClosed),overdue=open.filter(row=>row.overdue===true);
 const todayMs=Date.parse(today+'T12:00:00Z');
 let oldestOverdueDays=0;
 for(const row of overdue){const due=calendarDate(row.dueDate);if(!due)continue;oldestOverdueDays=Math.max(oldestOverdueDays,Math.round((todayMs-Date.parse(due+'T12:00:00Z'))/day));}
 const within=(value:unknown)=>{const time=timestamp(value);return time!==null&&time>=cutoff&&time<=now;};
 const suppliers=new Map<string,{name:string;count:number}>();
 for(const row of open){
  const name=typeof row.supplier==='string'?row.supplier.trim():'',key=Number.isSafeInteger(row.supplierId)&&row.supplierId>0?'id:'+row.supplierId:'name:'+name,entry=suppliers.get(key);
  if(entry)entry.count++;else suppliers.set(key,{name,count:1});
 }
 return {
  open:open.length,overdue:overdue.length,oldestOverdueDays,
  openValueCents:open.reduce((sum,row)=>sum+(Number(row.quantity)||0)*(Number(row.priceCents)||0),0),
  closed30:rows.filter(row=>row.isClosed&&within(row.completedAt)).length,
  created30:rows.filter(row=>within(row.createdAt)).length,
  activeProducts:products.filter(product=>product.active).length,
  suppliers:[...suppliers.values()].sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name)).slice(0,5)
 };
}
function renderSupplierChart(figures:ReturnType<typeof overviewFigures>){
 if(!figures.suppliers.length)return html`<p class="analytics-note">Keine offenen Retouren.</p>`;
 return html`<p class="analytics-note reason-note">Anteil aller offenen Retouren</p><ol class="reason-ranking">${figures.suppliers.map(entry=>{
  const label=entry.name||t('Ohne Lieferant'),share=entry.count/figures.open,percentage=formatNumber(share,{style:'percent',maximumFractionDigits:1});
  return html`<li aria-label="${h(label)}: ${formatNumber(entry.count)} (${percentage})"><div class="reason-label"><span>${h(label)}</span><strong>${formatNumber(entry.count)}<small>${percentage}</small></strong></div><svg class="reason-track" viewBox="0 0 100 7" preserveAspectRatio="none" aria-hidden="true" focusable="false"><rect class="reason-track-fill" width="100" height="7" rx="3.5"/><rect class="reason-bar" width="${share*100}" height="7" rx="3.5"/></svg></li>`;
 }).join('')}</ol>`;
}

export function renderWorkspaceAnalytics(ctx:any){
 const data=workspaceAnalytics(ctx.returns??[],options(ctx)),figures=overviewFigures(ctx.returns??[],ctx.products??[],options(ctx));
 return html`<section class="workspace-analytics" data-overview-section aria-labelledby="workspace-analytics-title">
  <div class="insights-heading"><div><h2 id="workspace-analytics-title">Retouren-Kennzahlen</h2><p>Bearbeitungszeit, Gründe und Entwicklung im Überblick.</p></div></div>
  <div class="analytics-grid" data-overview-group="analytics">
   <section class="panel completion-metric" data-overview-card="completion" data-overview-empty="${data.averageCompletionDays===null}"><div class="analytics-card-heading"><span class="analytics-symbol" aria-hidden="true">${icon('clock')}</span><h3>Durchschnittliche Bearbeitungszeit</h3></div><p class="completion-value">${data.averageCompletionDays===null?'—':formatNumber(data.averageCompletionDays,{maximumFractionDigits:1})}${data.averageCompletionDays!==null?html` <small>Tage</small>`:''}</p><p class="analytics-note completion-count">${data.durationCount?html`${t('Belegte Abschlüsse')}: ${formatNumber(data.durationCount)}`:t('Noch kein belegter Abschluss')}</p><div class="completion-notes"><p class="analytics-note">Abschlusszeiten ohne verlässliches Datum sind nicht enthalten.</p>${data.closedWithoutCompletion?html`<small class="analytics-note">${t('Ältere Abschlüsse ohne belegten Zeitpunkt')}: ${formatNumber(data.closedWithoutCompletion)}</small>`:''}</div></section>
   <section class="panel reason-metric" data-overview-card="reasons" data-overview-empty="${!data.reasons.length}"><h3>Häufigste Retourengründe</h3>${renderReasonChart(ctx,data)}</section>
   <section class="panel supplier-metric" data-overview-card="suppliers" data-overview-empty="${!figures.suppliers.length}"><h3>Offene Retouren nach Lieferant</h3>${renderSupplierChart(figures)}</section>
   <section class="panel trend-metric" data-overview-card="trend" data-overview-empty="${!data.months.some(month=>month.created||month.completed)}"><div class="trend-heading"><h3>Letzte sechs Monate</h3><div class="trend-legend"><span><i class="created-key" aria-hidden="true"></i>Erfasst</span><span><i class="completed-key" aria-hidden="true"></i>Abgeschlossen</span></div></div>${renderMonthlyChart(data)}</section>
  </div>
 </section>`;
}
