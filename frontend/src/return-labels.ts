import {html,t,addTranslations,setText,getLanguage,formatDate,apiError} from './i18n.js';
import {h,icon} from './ui.js';
import {switchField} from './switches.js';
import {captureAuthContext} from './auth-context.js';
import {masterName} from './inventory-display.js';

addTranslations({
 'Etikettengröße':'Label size','A4 · 210 × 297 mm':'A4 · 210 × 297 mm','Allgemeines Drucklayout':'General print layout','Inhalt auswählen':'Choose content',
 'Gerät & Identifikation':'Device & identification','Eingang & Bearbeitung':'Receipt & processing',
 'Bearbeitungsinformationen anzeigen':'Show processing information','Nächsten Schritt anzeigen':'Show next step',
 'Austauschseriennummer':'Replacement serial number','Produkt auf dem Etikett anzeigen':'Show product on label',
 'Kundenreferenz auf dem Etikett anzeigen':'Show customer reference on label','Retourenetikett':'Return label','Druckvorschau':'Print preview',
 'Etikett drucken':'Print label','Retourennummer':'Return number','Seriennummer':'Serial number','Artikelnummer':'SKU','Produkt':'Product',
 'Sendungsnummer':'Tracking number','Kundenreferenz':'Customer reference','Bestellnummer':'Order number','Erfasst':'Created','Eingang':'Received','Status':'Status','Retourengrund':'Return reason',
 'Zustand':'Condition','Lösung':'Resolution','Lieferant':'Supplier','Nächster Schritt':'Next step',
 'QR-Code mit Retourennummer':'QR code with return number','Retourennummer scannen':'Scan return number',
 'QR-Code enthält ausschließlich die Retourennummer.':'The QR code contains only the return number.',
 'Etikett wird geladen …':'Loading label …','Etikett konnte nicht geladen werden.':'Could not load label.',
 'Für den Druck: tatsächliche Größe / 100 %, keine Browser-Kopf- oder Fußzeilen. Wähle im Druckerdialog das passende Papierformat.':'To print: actual size / 100%, with browser headers and footers disabled. Choose the matching paper size in the print dialog.',
 'Das kompakte Etikett zeigt die Gerätekennungen und den QR-Code. Weitere Angaben sind auf den größeren Formaten verfügbar.':'The compact label shows device identifiers and the QR code. More information is available on the larger formats.',
 'Der Inhalt passt nicht vollständig auf diese Größe. Wähle ein größeres Format oder blende optionale Angaben aus.':'The content does not fit this size in full. Choose a larger format or hide optional information.',
 'Dieses Etikett ist noch nicht druckbereit. Prüfe die Vorschau und wähle bei Bedarf ein größeres Format.':'This label is not ready to print. Check the preview and choose a larger format if needed.',
});

export type LabelSize='a4'|'103x164'|'62x29'|'auto';
export type ReturnLabel={id:number;returnNumber:string;serialNumber:string;replacementSerialNumber?:string;productName?:string;sku?:string;customerReference?:string;trackingNumber?:string;orderNumber?:string;createdAt?:string;receiptDate?:string;status?:any;reason?:any;condition?:any;resolution?:any;supplier?:any;nextStep?:string;qrDataUrl:string};
type LabelOptions={product:boolean;reference:boolean;details:boolean;next:boolean};
export function normalizeLabelSize(value:unknown):LabelSize{return value==='103x164'||value==='62x29'||value==='auto'?value:'a4';}
export function defaultLabelOptions(size:LabelSize):LabelOptions{return {product:true,reference:size!=='62x29',details:size!=='62x29',next:size!=='62x29'};}
export function labelPreferenceStore(storage:Pick<Storage,'getItem'|'setItem'>|null,userId:unknown){
 const account=/^[1-9]\d*$/.test(String(userId))?String(userId):null,key=`retourenboard.label.v1.${account}`;
 return {read():LabelSize{try{return account?normalizeLabelSize(storage?.getItem(key)):'a4';}catch{return 'a4';}},save(size:unknown){try{if(!account||!storage)return false;storage.setItem(key,normalizeLabelSize(size));return true;}catch{return false;}}};
}
function safeQrImage(value:unknown){if(typeof value!=='string'||value.length>100000||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value))throw new Error('QR-Code ungültig.');return value;}
function labelDate(value:string,dateOnly=false,timezone='Europe/Berlin'){
 if(!value)return '';const date=new Date(dateOnly?value+'T12:00:00':value);if(!Number.isFinite(date.getTime()))return '';
 const options:any={day:'2-digit',month:'2-digit',year:'numeric'};if(!dateOnly){options.hour='2-digit';options.minute='2-digit';options.timeZone=timezone;}
 try{return formatDate(date,options,dateOnly?'toLocaleDateString':'toLocaleString');}catch{return formatDate(date,{day:'2-digit',month:'2-digit',year:'numeric'},'toLocaleDateString');}
}
function field(key:string,label:string,value:any,classes=''){
 return value?html`<div class="label-field ${classes}" data-label-field="${key}"><dt>${t(label)}</dt><dd>${h(value)}</dd></div>`:'';
}
export function renderReturnLabelPreview(row:ReturnLabel,{size:requested='a4',options:requestedOptions,timezone='Europe/Berlin'}:{size?:unknown;options?:Partial<LabelOptions>;timezone?:string}={}){
 const size=normalizeLabelSize(requested),options={...defaultLabelOptions(size),...requestedOptions},image=safeQrImage(row.qrDataUrl);
 const toggle=(key:string,label:string,checked:boolean)=>switchField('',t(label),checked).replace('<input ',`<input data-label-option="${key}" `);
 const metadata=field('order','Bestellnummer',row.orderNumber)+field('tracking','Sendungsnummer',row.trackingNumber)+field('created','Erfasst',labelDate(row.createdAt,false,timezone))+field('received','Eingang',labelDate(row.receiptDate,true,timezone))+field('status','Status',row.status)+field('reason','Retourengrund',row.reason)+field('condition','Zustand',row.condition)+field('resolution','Lösung',row.resolution)+field('supplier','Lieferant',row.supplier);
 return html`<header class="label-print-controls"><div class="label-preview-heading"><h2 id="return-label-preview-title">Druckvorschau</h2><button type="button" class="icon-btn" data-label-close aria-label="Schließen">${icon('close')}</button></div><div class="label-preview-toolbar"><label class="field label-size-control"><span>Etikettengröße</span><select data-label-size-select aria-label="Etikettengröße"><option value="a4"${size==='a4'?' selected':''}>A4 · 210 × 297 mm</option><option value="103x164"${size==='103x164'?' selected':''}>103 × 164 mm</option><option value="62x29"${size==='62x29'?' selected':''}>62 × 29 mm</option><option value="auto"${size==='auto'?' selected':''}>Allgemeines Drucklayout</option></select></label><button type="button" class="btn primary" data-label-print disabled>${icon('file')}Etikett drucken</button></div><details class="label-content-options"><summary>Inhalt auswählen</summary><div class="label-print-options">${row.productName||row.sku?toggle('product','Produkt auf dem Etikett anzeigen',options.product):''}${row.customerReference?toggle('reference','Kundenreferenz auf dem Etikett anzeigen',options.reference):''}${metadata?toggle('details','Bearbeitungsinformationen anzeigen',options.details):''}${row.nextStep?toggle('next','Nächsten Schritt anzeigen',options.next):''}</div></details><p class="label-print-guidance">Für den Druck: tatsächliche Größe / 100 %, keine Browser-Kopf- oder Fußzeilen. Wähle im Druckerdialog das passende Papierformat.</p><p class="label-compact-note" data-label-compact-note${size!=='62x29'?' hidden':''}>Das kompakte Etikett zeigt die Gerätekennungen und den QR-Code. Weitere Angaben sind auf den größeren Formaten verfügbar.</p><p class="label-print-status" data-label-status role="status" aria-live="polite"></p></header>
 <p class="label-blocked-print">Dieses Etikett ist noch nicht druckbereit. Prüfe die Vorschau und wähle bei Bedarf ein größeres Format.</p><div class="return-label-paper"><article class="return-print-label" data-label-size="${size}" aria-label="Retourenetikett"><header class="label-brand-header"><div class="label-brand"><img class="return-label-brand" src="/favicon.svg" width="34" height="34" alt=""><strong>retourenboard.</strong></div><span>Retourenetikett</span></header><div class="label-main"><div class="label-device"><dl class="label-return-id">${field('number','Retourennummer',row.returnNumber)}</dl>${row.productName||row.sku?html`<div class="label-product" data-label-section="product"${!options.product?' hidden':''}><dl>${field('product','Produkt',row.productName)}${field('sku','Artikelnummer',row.sku)}</dl></div>`:''}<dl class="label-serials">${field('serial','Seriennummer',row.serialNumber||'—')}${field('replacement','Austauschseriennummer',row.replacementSerialNumber)}</dl></div><figure class="label-code"><img class="return-label-qr" src="${h(image)}" width="256" height="256" alt="QR-Code mit Retourennummer"><figcaption>Retourennummer scannen</figcaption></figure></div>${row.customerReference?html`<dl class="label-reference" data-label-section="reference"${!options.reference?' hidden':''}>${field('reference','Kundenreferenz',row.customerReference)}</dl>`:''}${metadata?html`<section class="label-processing" data-label-section="details"${!options.details?' hidden':''}><h3>${h(t('Eingang & Bearbeitung'))}</h3><dl class="label-processing-grid">${metadata}</dl></section>`:''}${row.nextStep?html`<section class="label-next" data-label-section="next"${!options.next?' hidden':''}><h3>Nächster Schritt</h3><p>${h(row.nextStep)}</p></section>`:''}<footer class="label-paper-footer">QR-Code enthält ausschließlich die Retourennummer.</footer></article></div>`;
}
export function renderReturnLabelDocument(row:ReturnLabel,options:{size?:unknown;options?:Partial<LabelOptions>;timezone?:string}={}){
 return html`<!doctype html><html lang="${getLanguage()}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${h(t('Retourenetikett'))} · ${h(row.returnNumber)}</title><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/return-labels.css"></head><body class="return-label-preview" data-ui="board">${renderReturnLabelPreview(row,options)}</body></html>`;
}
export function labelContentFits(element:{clientWidth:number;clientHeight:number;scrollWidth:number;scrollHeight:number}):boolean{
 return element.clientWidth>0&&element.clientHeight>0&&element.scrollWidth<=element.clientWidth+2&&element.scrollHeight<=element.clientHeight+2;
}
let activeReturnLabel:(()=>void)|null=null;
export function stopReturnLabel(){activeReturnLabel?.();}
export async function printReturnLabel(ctx:any,id:number){
 if(!Number.isSafeInteger(id)||id<=0){ctx.toast?.(t('Bitte zuerst eine gespeicherte Retoure auswählen.'));return null;}
 if(ctx.can&&!ctx.can('returnsExport')){ctx.toast?.(t('Du hast keine Berechtigung für diese Aktion.'));return null;}
 stopReturnLabel();const authCurrent=captureAuthContext(ctx),preview=document.createElement('dialog');let closed=false,imagesReady=false;
 let storage=null;try{storage=ctx.storage??globalThis.localStorage;}catch{}
 const preferences=labelPreferenceStore(storage,ctx.session?.user?.id);let size=preferences.read();
  preview.className='return-label-preview return-label-dialog';preview.dataset.labelSize=size;preview.dataset.labelPrintState='blocked';preview.setAttribute('aria-labelledby','return-label-preview-title');
 const current=()=>!closed&&preview.open&&authCurrent();
 function checkFit(){
  if(!current())return;const print=preview.querySelector<HTMLButtonElement>('[data-label-print]'),label=preview.querySelector<HTMLElement>('.return-print-label');if(!print)return;
  const fits=!label||labelContentFits(label);print.disabled=!imagesReady||!fits;preview.dataset.labelPrintState=print.disabled?'blocked':'ready';
  setText(preview.querySelector('[data-label-status]'),fits?'':t('Der Inhalt passt nicht vollständig auf diese Größe. Wähle ein größeres Format oder blende optionale Angaben aus.'));
 }
 const resize=()=>checkFit(),beforePrint=()=>{if(current())checkFit();else cleanup();};let observer:ResizeObserver;
 function cleanup(){
  if(closed)return;closed=true;observer?.disconnect();
  for(const event of ['pagehide','popstate','hashchange'])window.removeEventListener(event,cleanup);
  window.removeEventListener('resize',resize);window.removeEventListener('languagechange',resize);window.removeEventListener('beforeprint',beforePrint);
  if(activeReturnLabel===cleanup)activeReturnLabel=null;
  document.body.classList.remove('return-label-printing');if(preview.open)preview.close();preview.remove();
 }
 function closeButton(){preview.querySelector<HTMLButtonElement>('[data-label-close]')!.onclick=cleanup;}
 preview.innerHTML=String(html`<header class="label-print-controls"><div class="label-preview-heading"><h2 id="return-label-preview-title">Druckvorschau</h2><button type="button" class="btn secondary" data-label-close>Schließen</button></div><p data-label-status role="status" aria-live="polite">Etikett wird geladen …</p></header>`);
 document.body.append(preview);preview.showModal();activeReturnLabel=cleanup;closeButton();document.body.classList.add('return-label-printing');
 for(const event of ['pagehide','popstate','hashchange'])window.addEventListener(event,cleanup);
  window.addEventListener('resize',resize);window.addEventListener('languagechange',resize);window.addEventListener('beforeprint',beforePrint);
 preview.addEventListener('close',cleanup,{once:true});preview.addEventListener('cancel',event=>{event.preventDefault();cleanup();});
 try{
  const row=await ctx.api(`/api/returns/${id}/label`);if(!current()){cleanup();return null;}
  const display={...row};for(const [field,kind] of [['status','statuses'],['reason','reasons'],['condition','conditions'],['resolution','resolutions'],['supplier','suppliers']])display[field]=masterName(ctx.masterdata,kind,row[field]);
  preview.innerHTML=String(renderReturnLabelPreview(display,{size,timezone:ctx.config?.timezone??'Europe/Berlin'}));closeButton();
  const print=preview.querySelector<HTMLButtonElement>('[data-label-print]'),select=preview.querySelector<HTMLSelectElement>('[data-label-size-select]');
  const showOptions=()=>{
   preview.querySelectorAll<HTMLInputElement>('[data-label-option]').forEach(option=>{
    const key=option.dataset.labelOption,section=preview.querySelector<HTMLElement>(`[data-label-section="${key}"]`)??preview.querySelector<HTMLElement>(`[data-label-field="${key}"]`);
    if(section)section.hidden=!option.checked;
    option.disabled=size==='62x29'&&['details','next'].includes(key);
   });
   const compact=preview.querySelector<HTMLElement>('[data-label-compact-note]');if(compact)compact.hidden=size!=='62x29';checkFit();
  };
  preview.querySelectorAll<HTMLInputElement>('[data-label-option]').forEach(option=>option.onchange=showOptions);
  if(select)select.onchange=()=>{
   if(!current()){cleanup();return;}size=normalizeLabelSize(select.value);preferences.save(size);preview.dataset.labelSize=size;
   preview.querySelector<HTMLElement>('.return-print-label').dataset.labelSize=size;
   const defaults=defaultLabelOptions(size);preview.querySelectorAll<HTMLInputElement>('[data-label-option]').forEach(option=>option.checked=defaults[option.dataset.labelOption]);showOptions();
  };
  print.onclick=()=>{if(!current()){cleanup();return;}checkFit();if(!print.disabled)window.print();};
  await Promise.all(Array.from(preview.querySelectorAll('img')).map(image=>image.decode()));
  if(!current()){cleanup();return null;}imagesReady=true;showOptions();
  if(typeof ResizeObserver!=='undefined'){observer=new ResizeObserver(checkFit);const label=preview.querySelector('.return-print-label');if(label)observer.observe(label);}
  print.focus({preventScroll:true});return preview;
 }catch(error){const message=apiError(error?.message||'Etikett konnte nicht geladen werden.');ctx.toast?.(message);if(current())setText(preview.querySelector('[data-label-status]'),message);else cleanup();return null;}
}
