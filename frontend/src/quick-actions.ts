import {html,t} from './i18n.js';
import {h,icon} from './ui.js';
import {confirmCopied} from './presentation.js';
import {recordActionMenu,bindRecordMenus} from './record-action-menu.js';

export function returnQuickActions(ctx,row:any){
    return html`<div class="record-actions" role="group" aria-label="Schnellaktionen">
        ${ctx.can('returnsStatus')&&(!row.isClosed||ctx.can('returnsEdit'))?html`<button type="button" class="icon-btn" data-quick-status="${row.id}" aria-label="${t(row.isClosed?'Wieder öffnen':'Status ändern')}" title="${t(row.isClosed?'Wieder öffnen':'Status ändern')}">${icon('refresh')}</button>`:''}
        <button type="button" class="icon-btn" data-copy-serial="${row.id}" aria-label="Seriennummer kopieren" title="Seriennummer kopieren"${row.serialNumber?'':' disabled'}>${icon('barcode')}</button>
        <button type="button" class="icon-btn" data-copy-return="${row.id}" aria-label="Retourennummer kopieren" title="Retourennummer kopieren">${icon('copy')}</button>
        ${!row.isClosed&&ctx.can('disposalsRead')&&ctx.can('disposalsCreate')?html`<button type="button" class="icon-btn" data-disposal-return="${row.id}" aria-label="Vernichtung / Entsorgung erfassen" title="Vernichtung / Entsorgung erfassen">${icon('trash')}</button>`:''}
        <button type="button" class="icon-btn" data-detail="returns" data-id="${row.id}" aria-label="Details zu ${h(row.returnNumber)}" title="Details ansehen">${icon('chevron')}</button>
    </div>`;
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
        try{await copyText(row.serialNumber);confirmCopied(el);ctx.toast(t('Seriennummer kopiert.'));}catch(error){ctx.toast(error.message);}
    });
    root.querySelectorAll('[data-return-product]').forEach(el=>el.onclick=()=>ctx.ensureUnlocked(()=>{
        const product=ctx.products.find(p=>p.id===Number(el.dataset.returnProduct));
        if(product?.active&&ctx.can('returnsCreate'))return actions.create(ctx,{productId:product.id,supplierId:ctx.masterdata?.suppliers?.find(s=>s.id===product.supplierId&&s.active)?.id});
    }));
}
