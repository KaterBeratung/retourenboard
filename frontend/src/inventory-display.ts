import {BUILTIN_MASTERDATA,PRODUCT_REFS,RETURN_REFS} from '../shared/model.js';
import {html,t,formatDate,formatNumber,addTranslations} from './i18n.js';
import {h,icon,detailSections} from './ui.js';
import {productAvatar} from './product-images.js';
addTranslations({'Gespeicherter Gerätepreis':'Saved device price','Preis bei Erfassung':'Price at creation','Aus dem Erstellverlauf übernommen':'Recovered from creation history','Preis bei Datenübernahme; historischer Preis unbekannt':'Price observed at migration; historical price unknown','Übertragener Preisstand':'Transferred price snapshot'});

// Only server-marked, unchanged seed entries are UI translations. Customer data
// remains opaque, including entries named like a built-in value.
export function masterLabel(item, fallback = '') {
    const builtin = BUILTIN_MASTERDATA.find(entry => entry.key === item?.builtinKey && entry.kind === item.kind && entry.name === item.name);
    return builtin ? t(builtin.name) : item?.name ?? fallback;
}
export function masterName(masters,kind,name) {
    return masterLabel(masters?.[kind]?.find(entry => entry.name === name),name);
}
export function masterValue(masters,item,field) {
    const kind = RETURN_REFS[field] ?? PRODUCT_REFS[field];
    const entries = masters?.[kind];
    const id = item[field+'Id'];
    const entry = id == null ? entries?.find(value => value.name === item[field]) : entries?.find(value => value.id === id);
    return masterLabel(entry,item[field] || '—');
}
export function returnTimestamp(value:string,stacked=false) {
    const date=value?new Date(value):null;
    if(!date||!Number.isFinite(date.getTime()))return '—';
    const day=formatDate(date,{day:'2-digit',month:'2-digit',year:'numeric'},'toLocaleDateString');
    const time=formatDate(date,{hour:'2-digit',minute:'2-digit'},'toLocaleTimeString');
    return stacked?html`<time class="return-time" datetime="${h(value)}"><span>${h(day)}</span><small>${h(time)}</small></time>`:html`<time datetime="${h(value)}">${h(day)} · ${h(time)}</time>`;
}
export function returnTiming(item:{createdAt?:string;receiptDate?:string},compact=false) {
    const receipt=item.receiptDate?new Date(item.receiptDate+'T12:00:00'):null;
    return html`<div class="return-timing">${returnTimestamp(item.createdAt,true)}${!compact&&receipt&&Number.isFinite(receipt.getTime())?html`<small class="receipt-date">${t('Eingang')}: ${h(formatDate(receipt,{day:'2-digit',month:'2-digit',year:'numeric'},'toLocaleDateString'))}</small>`:''}</div>`;
}
addTranslations({
 'Bearbeitung fortsetzen':'Continue processing','Nächsten Schritt festlegen':'Set the next step','Eingang prüfen':'Check receipt','Prüfung dokumentieren':'Document the inspection','Ergebnis festhalten':'Record the outcome','Retoure abgeschlossen':'Return completed','Bearbeitungsstand':'Processing state','Noch nicht zugewiesen':'Not assigned yet','Verlauf ansehen':'View timeline','Gerät und Angaben prüfen, dann den nächsten Arbeitsschritt festlegen.':'Check the device and details, then decide the next step.','Prüfergebnis dokumentieren und die weitere Bearbeitung festlegen.':'Document the inspection result and decide how to proceed.','Lösung und Ergebnis dokumentieren, bevor die Retoure abgeschlossen wird.':'Document the outcome before completing the return.','Zuständigkeit und nächsten Schritt für die weitere Bearbeitung festlegen.':'Set the assignee and next step for further processing.','Der Vorgang ist abgeschlossen. Weitere Änderungen folgen den bestehenden Wiederöffnungsregeln.':'This return is complete. Further changes follow the existing reopening rules.'
});
function returnGuidance(item:any){
 const closed=Boolean(item.isClosed),next=typeof item.nextStep==='string'?item.nextStep.trim():'',tone=['received','checking','working'].includes(item.statusTone)?item.statusTone:'neutral';
 const title=closed?'Retoure abgeschlossen':next||({received:'Eingang prüfen',checking:'Prüfung dokumentieren',working:'Ergebnis festhalten',neutral:'Nächsten Schritt festlegen'})[tone];
 const detail=closed?'Der Vorgang ist abgeschlossen. Weitere Änderungen folgen den bestehenden Wiederöffnungsregeln.':next?'':({received:'Gerät und Angaben prüfen, dann den nächsten Arbeitsschritt festlegen.',checking:'Prüfergebnis dokumentieren und die weitere Bearbeitung festlegen.',working:'Lösung und Ergebnis dokumentieren, bevor die Retoure abgeschlossen wird.',neutral:'Zuständigkeit und nächsten Schritt für die weitere Bearbeitung festlegen.'})[tone];
 return html`<section class="return-guidance${closed?' is-closed':''}" aria-label="Bearbeitungsstand"><div class="return-guidance-copy"><span class="eyebrow">${t(closed?'Bearbeitungsstand':'Nächster Schritt')}</span><h3>${closed||!next?h(t(title)):h(next)}</h3>${detail?html`<p>${h(t(detail))}</p>`:''}<span class="return-guidance-owner">${icon('users')}${h(item.assignedDisplayName||t('Noch nicht zugewiesen'))}</span></div><div class="return-guidance-actions"><button type="button" class="btn primary small" data-return-continue hidden>Bearbeitung fortsetzen</button><button type="button" class="text-link" data-return-activity>${icon('clock')}Verlauf ansehen</button></div></section>`;
}
export function returnDetailContent(masters:any,item:any,currency?:any){
    const field=(key:string,label:string)=>html`<div><dt>${t(label)}</dt><dd>${key==='receiptDate'&&item.receiptDate?h(formatDate(item.receiptDate+'T12:00:00',{day:'2-digit',month:'2-digit',year:'numeric'},'toLocaleDateString')):h(masterValue(masters,item,key))}</dd></div>`;
    const context=[['sku','Artikelnummer'],['ean','EAN'],['supplier','Lieferant'],['orderNumber','Bestellnummer'],['customerReference','Kundenreferenz'],['trackingNumber','Sendungsnummer'],['receiptDate','Eingangsdatum'],...(item.quantity>1?[['quantity','Menge']]:[])];
    const processing=[['reason','Retourengrund'],['condition','Zustand'],['resolution','Lösung'],['replacementSerialNumber','Austauschseriennummer'],['assignedDisplayName','Verantwortliche Person']];
    const price=Number.isSafeInteger(item.priceCents)&&item.priceSnapshotSource?html`<div><dt>Gespeicherter Gerätepreis</dt><dd>${money(item.priceCents,currency)}<small>${t({'creation':'Preis bei Erfassung','audit-create':'Aus dem Erstellverlauf übernommen','migration-observed':'Preis bei Datenübernahme; historischer Preis unbekannt','imported':'Übertragener Preisstand'}[item.priceSnapshotSource]??'Übertragener Preisstand')} · ${returnTimestamp(item.priceCapturedAt)}</small></dd></div>`:'';
    const overview=html`<div class="detail-summary return-detail-summary">${productAvatar(item)}<div><span class="detail-kicker">Gerät</span><strong>${h(item.productName)}</strong></div><span class="status ${h(item.statusTone||'neutral')}"><span></span>${h(masterValue(masters,item,'status'))}</span></div><div class="return-serial-focus"><div><span>Seriennummer</span><strong class="mono">${h(item.serialNumber||'—')}</strong></div><button type="button" class="icon-btn" data-copy-serial="${item.id}" aria-label="Seriennummer kopieren" title="Seriennummer kopieren"${item.serialNumber?'':' disabled'}>${icon('barcode')}</button></div><section class="return-metadata" aria-label="Zeitangaben"><div><span>Erfasst</span><strong>${returnTimestamp(item.createdAt)}</strong></div><div><span>Zuletzt bearbeitet</span><strong>${returnTimestamp(item.updatedAt)}</strong></div></section>${returnGuidance(item)}<section class="detail-section"><h3>${icon('box')}Gerät &amp; Zuordnung</h3><dl class="detail-grid">${context.map(([key,label])=>field(key,label)).join('')}${price}</dl></section><section class="detail-section detail-processing"><h3>${icon('edit')}Prüfung &amp; Bearbeitung</h3><dl class="detail-grid">${processing.map(([key,label])=>field(key,label)).join('')}${item.nextStep&&item.isClosed?html`<div class="full"><dt>Nächster Schritt</dt><dd>${h(item.nextStep)}</dd></div>`:''}</dl>${item.dueDate?html`<p class="deadline-note${item.overdue?' overdue':''}">${icon('clock')}<span>${t('Frist')}: ${h(formatDate(item.dueDate+'T12:00:00',{day:'2-digit',month:'2-digit',year:'numeric'},'toLocaleDateString'))}${item.overdue?html` · ${t('Überfällig')}`:''}</span></p>`:''}</section>${item.notes?html`<section class="detail-section detail-notes"><h3>${icon('file')}Notizen</h3><p>${h(item.notes)}</p></section>`:''}`;
    return detailSections([
        {key:'overview',label:'Übersicht',content:overview},
        {key:'history',label:'Verlauf',content:html`<section id="return-timeline" class="detail-section return-timeline"></section>`},
        {key:'communication',label:'Kommentare & Kundenstatus',content:html`<section id="return-communication"></section>`},
        {key:'files',label:'Dateianhänge',content:html`<section class="detail-section detail-files"><div class="attachments" id="return-attachments"></div></section>`}
    ]);
}
const stageOrder={received:0,checking:1,working:2,neutral:3};
export function workflowStatuses(entries:any[]=[],rows?:any[]) {
    return entries.filter(s=>!rows||s.active||rows.some(r=>r.statusId!=null?r.statusId===s.id:r.status===s.name))
        .sort((a,b)=>Number(Boolean(a.isClosed))-Number(Boolean(b.isClosed))||
            (a.isClosed?0:(stageOrder[a.tone]??3)-(stageOrder[b.tone]??3))||a.id-b.id);
}
export function renderReturnWorkflow(entries:any[],rows:any[]) {
    const statuses=workflowStatuses(entries,rows);
    return [false,true].map(closed=>{
        const group=statuses.filter(s=>Boolean(s.isClosed)===closed);
        if(!group.length)return '';
        return html`<div class="workflow-group"><h3>${closed?t('Abgeschlossen'):t('Offene Vorgänge')}</h3><div class="workflow-rows">${group.map(s=>{
            const count=rows.filter(r=>r.statusId!=null?r.statusId===s.id:r.status===s.name).length;
            const tone=closed?'done':Object.hasOwn(stageOrder,s.tone)?s.tone:'neutral';
            return html`<button type="button" class="workflow-row${count?' has-returns':''}" data-workflow-status="${h(s.name)}"><span class="workflow-symbol ${tone}">${icon(closed?'check':({received:'return',checking:'search',working:'edit'}[tone]??'clock'))}</span><span class="workflow-name">${h(masterLabel(s))}${!s.active?html`<small>Archiviert</small>`:''}</span><span class="workflow-count">${count}</span>${icon('chevron')}</button>`;
        }).join('')}</div></div>`;
    }).join('');
}
export function usesDollar(currency) {
    return currency?.display === 'USD' && typeof currency.rate === 'number' && Number.isFinite(currency.rate) && currency.rate > 0;
}
// priceCents always contains original EUR cents. Round only the final rendered
// amount, so switching views never writes back rounded converted prices.
export function money(cents,currency?) {
    const dollar = usesDollar(currency);
    return formatNumber(cents / 100 * (dollar ? currency.rate : 1),{style:'currency',currency:dollar?'USD':'EUR'});
}
export function currencyNotice(currency) {
    if(currency?.display !== 'USD')return '';
    if(!usesDollar(currency))return html`<aside class="currency-notice warning" role="status"><span class="currency-tag">EUR</span><p>Kein USD-Kurs verfügbar. Beträge werden als Originalpreise in EUR angezeigt.</p></aside>`;
    return html`<aside class="currency-notice${currency.stale?' warning':''}" role="status"><span class="currency-tag">USD</span><div><p>Anzeige in USD · 1 EUR = ${formatNumber(currency.rate,{minimumFractionDigits:4,maximumFractionDigits:4})} USD · Kurs vom ${formatDate(currency.date+'T12:00:00',{day:'2-digit',month:'2-digit',year:'numeric'},'toLocaleDateString')}</p><small>${currency.stale?t('Gespeicherter Kurs · Bitte den Kursstand beachten.'):t('Automatische Umrechnung · Originalpreise bleiben in EUR.')} <a href="https://frankfurter.dev/" target="_blank" rel="noopener noreferrer">ECB · Frankfurter</a></small></div></aside>`;
}
