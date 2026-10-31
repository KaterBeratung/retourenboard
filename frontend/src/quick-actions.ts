import {html,t} from './i18n.js';
import {h,icon} from './ui.js';
import {confirmCopied} from './presentation.js';
import {recordActionMenu,bindRecordMenus} from './record-action-menu.js';

// One "more" menu per return, in the table and on phone cards (like products).
export function returnQuickActions(ctx,row:any){
    const item=(attributes:string,symbol:string,label:any,extra='')=>html`<button type="button" role="menuitem" tabindex="-1" class="record-menu-item" ${attributes}${extra}>${icon(symbol)}<span>${label}</span></button>`;
    const status=ctx.can('returnsStatus')&&(!row.isClosed||ctx.can('returnsEdit'));
    const disposal=!row.isClosed&&ctx.can('disposalsRead')&&ctx.can('disposalsCreate');
    return html`<div class="record-actions" role="group" aria-label="Schnellaktionen">${recordActionMenu(row.returnNumber,html`${status?item(html`data-quick-status="${row.id}"`,'refresh',t(row.isClosed?'Wieder öffnen':'Status ändern')):''}${item(html`data-copy-serial="${row.id}"`,'barcode',t('Seriennummer kopieren'),row.serialNumber?'':' disabled')}${item(html`data-copy-return="${row.id}"`,'copy',t('Retourennummer kopieren'))}${disposal?item(html`data-disposal-return="${row.id}"`,'trash',t('Vernichtung / Entsorgung erfassen')):''}${item(html`data-detail="returns" data-id="${row.id}" aria-label="Details zu ${h(row.returnNumber)}"`,'chevron',t('Details ansehen'))}`)}</div>`;
}
export function productQuickActions(ctx,row:any){
    return html`<div class="record-actions" role="group" aria-label="Schnellaktionen">${recordActionMenu(row.name,html`${ctx.can('disposalsCreate')?html`<button type="button" role="menuitem" tabindex="-1" class="record-menu-item" data-disposal-product="${row.id}">${icon('trash')}<span>Vernichtung / Entsorgung erfassen</span></button>`:''}${row.active&&ctx.can('returnsCreate')?html`<button type="button" role="menuitem" tabindex="-1" class="record-menu-item" data-return-product="${row.id}">${icon('return')}<span>Retoure für dieses Produkt anlegen</span></button>`:''}<button type="button" role="menuitem" tabindex="-1" class="record-menu-item" data-detail="products" data-id="${row.id}" aria-label="Details zu ${h(row.name)}">${icon('chevron')}<span>Details ansehen</span></button>`)}</div>`;
}
export async function copyText(value:string,root?:HTMLElement){
    try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(value);return;}}catch{}
    const focused=document.activeElement as HTMLElement,area=document.createElement('textarea');
    area.value=value;area.setAttribute('readonly','');area.style.cssText='position:fixed;left:-9999px;top:0;';(root??document.body).append(area);
    try{area.focus();area.select();if(!document.execCommand('copy'))throw new Error(t('Kopieren nicht möglich. Bitte den Wert manuell kopieren.'));}
    finally{area.remove();focused?.focus();}
}
export function bindQuickActions(ctx,root,rows:()=>any[],actions:{status:(ctx:any,row:any)=>any;create:(ctx:any,item:any)=>any}){
    bindRecordMenus(root);
    root.querySelectorAll('[data-disposal-return],[data-disposal-product]').forEach(el=>el.onclick=()=>ctx.ensureUnlocked(()=>{if(ctx.can('disposalsCreate'))location.hash='disposals?'+(el.dataset.disposalReturn?'returnId='+el.dataset.disposalReturn:'productId='+el.dataset.disposalProduct);}));
    root.querySelectorAll('[data-quick-status]').forEach(el=>el.onclick=()=>ctx.ensureUnlocked(()=>{
        const row=rows().find(r=>r.id===Number(el.dataset.quickStatus));if(row&&ctx.can('returnsStatus'))return actions.status(ctx,row);
    }));
    root.querySelectorAll('[data-copy-return]').forEach(el=>el.onclick=async()=>{
        const row=rows().find(r=>r.id===Number(el.dataset.copyReturn));if(!row)return;
        try{await copyText(row.returnNumber);if(el.getAttribute?.('role')!=='menuitem')confirmCopied(el);ctx.toast(t('Retourennummer kopiert.'));}catch(error){ctx.toast(error.message);}
    });
    root.querySelectorAll('[data-copy-serial]').forEach(el=>el.onclick=async()=>{
        const row=rows().find(r=>r.id===Number(el.dataset.copySerial));if(!row?.serialNumber)return;
        try{await copyText(row.serialNumber);if(el.getAttribute?.('role')!=='menuitem')confirmCopied(el);ctx.toast(t('Seriennummer kopiert.'));}catch(error){ctx.toast(error.message);}
    });
    root.querySelectorAll('[data-return-product]').forEach(el=>el.onclick=()=>ctx.ensureUnlocked(()=>{
        const product=ctx.products.find(p=>p.id===Number(el.dataset.returnProduct));
        if(product?.active&&ctx.can('returnsCreate'))return actions.create(ctx,{productId:product.id,supplierId:ctx.masterdata?.suppliers?.find(s=>s.id===product.supplierId&&s.active)?.id});
    }));
}
