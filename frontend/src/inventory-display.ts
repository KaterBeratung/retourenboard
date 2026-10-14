import {BUILTIN_MASTERDATA,PRODUCT_REFS,RETURN_REFS} from '../shared/model.js';
import {html,t,formatDate,formatNumber} from './i18n.js';
import {h,icon} from './ui.js';
import {productAvatar} from './product-images.js';

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
export function returnDetailContent(masters:any,item:any){
    const field=(key:string,label:string)=>html`<div><dt>${t(label)}</dt><dd>${key==='receiptDate'&&item.receiptDate?h(formatDate(item.receiptDate+'T12:00:00',{day:'2-digit',month:'2-digit',year:'numeric'},'toLocaleDateString')):h(masterValue(masters,item,key))}</dd></div>`;
    const context=[['sku','Artikelnummer'],['ean','EAN'],['supplier','Lieferant'],['orderNumber','Bestellnummer'],['customerReference','Kundenreferenz'],['trackingNumber','Sendungsnummer'],['receiptDate','Eingangsdatum'],...(item.quantity>1?[['quantity','Menge']]:[])];
    const processing=[['reason','Retourengrund'],['condition','Zustand'],['resolution','Lösung'],['replacementSerialNumber','Austauschseriennummer'],['assignedDisplayName','Verantwortliche Person']];
    return html`<div class="detail-summary return-detail-summary">${productAvatar(item)}<div><span class="detail-kicker">Gerät</span><strong>${h(item.productName)}</strong></div><span class="status ${h(item.statusTone||'neutral')}"><span></span>${h(masterValue(masters,item,'status'))}</span></div><div class="return-serial-focus"><div><span>Seriennummer</span><strong class="mono">${h(item.serialNumber||'—')}</strong></div><button type="button" class="icon-btn" data-copy-serial="${item.id}" aria-label="Seriennummer kopieren" title="Seriennummer kopieren"${item.serialNumber?'':' disabled'}>${icon('barcode')}</button></div><section class="return-metadata" aria-label="Zeitangaben"><div><span>Erfasst</span><strong>${returnTimestamp(item.createdAt)}</strong></div><div><span>Zuletzt bearbeitet</span><strong>${returnTimestamp(item.updatedAt)}</strong></div></section><section class="detail-section"><h3>${icon('box')}Gerät &amp; Zuordnung</h3><dl class="detail-grid">${context.map(([key,label])=>field(key,label)).join('')}</dl></section><section class="detail-section detail-processing"><h3>${icon('edit')}Prüfung &amp; Bearbeitung</h3><dl class="detail-grid">${processing.map(([key,label])=>field(key,label)).join('')}${item.nextStep?html`<div class="full"><dt>Nächster Schritt</dt><dd>${h(item.nextStep)}</dd></div>`:''}</dl>${item.dueDate?html`<p class="deadline-note${item.overdue?' overdue':''}">${icon('clock')}<span>${t('Frist')}: ${h(formatDate(item.dueDate+'T12:00:00',{day:'2-digit',month:'2-digit',year:'numeric'},'toLocaleDateString'))}${item.overdue?html` · ${t('Überfällig')}`:''}</span></p>`:''}</section>${item.notes?html`<section class="detail-section detail-notes"><h3>${icon('file')}Notizen</h3><p>${h(item.notes)}</p></section>`:''}<section id="return-timeline" class="detail-section return-timeline"></section><section class="detail-section detail-files"><div class="attachments" id="return-attachments"></div></section>`;
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
