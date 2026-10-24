import {html,t,setText} from './i18n.js';
import {icon} from './ui.js';

// Keep the existing cells and controls. Only add visual captions for small screens.
export function enhanceResponsiveTables(root:ParentNode){
    const selector='.table-scroll>table,.settings-table>table';
    const tables=[...root.querySelectorAll<HTMLTableElement>(selector)];
    if('matches' in root&&(root as Element).matches(selector))tables.unshift(root as HTMLTableElement);
    const role=(node:Element,value:string)=>{if(!node.getAttribute('role'))node.setAttribute('role',value);};
    for(const table of tables){
        if(table.classList.contains('disposal-table')||table.parentElement?.nextElementSibling?.matches('.mobile-records'))continue;
        const heading=Array.from(table.tHead?.rows??[]).at(-1);
        if(!heading)continue;
        const headers=Array.from(heading.cells);
        table.dataset.responsiveCards='';table.parentElement.dataset.responsiveCards='';
        role(table,'table');role(table.tHead,'rowgroup');role(heading,'row');
        headers.forEach(cell=>role(cell,'columnheader'));
        for(const body of Array.from(table.tBodies)){
            role(body,'rowgroup');
            for(const row of Array.from(body.rows)){
                role(row,'row');let column=0;
                for(const cell of Array.from(row.cells)){
                    role(cell,cell.tagName==='TH'?'rowheader':'cell');
                    const text=headers[column]?.textContent?.replace(/\s+/g,' ').trim()??'';
                    column+=cell.colSpan;
                    let label=Array.from(cell.children).find(child=>child.hasAttribute('data-mobile-cell-label')) as HTMLElement;
                    if(cell.colSpan!==1||!text){cell.dataset.responsiveSpan='';label?.remove();continue;}
                    delete cell.dataset.responsiveSpan;
                    if(!label){label=cell.ownerDocument.createElement('span');label.dataset.mobileCellLabel='';label.className='mobile-cell-label';label.setAttribute('aria-hidden','true');cell.prepend(label);}
                    if(label.textContent!==text)label.textContent=text;
                }
            }
        }
    }
}
const responsiveBindings=new WeakSet<Document>();
export function bindResponsiveTables(doc:Document=document){
    if(responsiveBindings.has(doc))return;
    responsiveBindings.add(doc);enhanceResponsiveTables(doc);
    new MutationObserver(records=>{
        const roots=new Set<ParentNode>();
        for(const record of records){
            const target=record.target.nodeType===1?record.target as Element:record.target.parentElement;
            const table=target?.closest('table');if(table)roots.add(table);
            for(const node of record.addedNodes)if(node.nodeType===1){const element=node as Element;if(element.matches('table')||element.querySelector('table'))roots.add(element);}
        }
        roots.forEach(enhanceResponsiveTables);
    }).observe(doc.body,{childList:true,subtree:true,characterData:true});
}

export function tooltipPosition(anchor:any,tip:any,viewport:any){
    const left=Math.max(12,Math.min((anchor.left+anchor.right-tip.width)/2,viewport.width-tip.width-12));
    const above=anchor.top-tip.height-8;
    return {left,top:Math.max(8,Math.min(above>=8?above:anchor.bottom+8,viewport.height-tip.height-8))};
}
const copied=new WeakMap<object,any>();
export function confirmCopied(button:any,{schedule=setTimeout,cancel=clearTimeout}:any={}){
    const previous=copied.get(button),entry={original:previous?.original??button.innerHTML,timer:null};
    if(previous)cancel(previous.timer);
    copied.set(button,entry);button.innerHTML=icon('check');button.dataset.copyState='copied';
    entry.timer=schedule(()=>{if(copied.get(button)!==entry)return;button.innerHTML=entry.original;delete button.dataset.copyState;copied.delete(button);},1500);
}
export function bindActionTooltips(doc:Document=document){
    const tip=doc.createElement('div');tip.id='action-tooltip';tip.className='action-tooltip';tip.setAttribute('role','tooltip');tip.hidden=true;
    tip.setAttribute('popover','manual');doc.body.append(tip);
    let active:HTMLElement|null=null,timer:any,savedTitle:string|null=null,described:string|null=null;
    function hide(){
        clearTimeout(timer);
        if(active){if(savedTitle!==null)active.setAttribute('title',savedTitle);if(described===null)active.removeAttribute('aria-describedby');else active.setAttribute('aria-describedby',described);}
        if(typeof tip.hidePopover==='function'&&tip.matches(':popover-open'))tip.hidePopover();tip.hidden=true;active=null;
    }
    function show(button:HTMLElement,immediate=false){
        if(button===active&&!tip.hidden)return;
        hide();active=button;savedTitle=button.getAttribute('title');described=button.getAttribute('aria-describedby');button.removeAttribute('title');
        timer=setTimeout(()=>{
            if(active!==button||!button.isConnected)return;
            setText(tip,button.dataset.copyState==='copied'?t('Kopiert'):button.getAttribute('aria-label')||savedTitle||'');
            if(!tip.textContent)return;
            tip.hidden=false;
            if(typeof tip.showPopover==='function')tip.showPopover();else (button.closest('dialog[open]')||doc.body).append(tip);
            const position=tooltipPosition(button.getBoundingClientRect(),tip.getBoundingClientRect(),{width:doc.documentElement.clientWidth,height:doc.documentElement.clientHeight});
            tip.style.left=position.left+'px';tip.style.top=position.top+'px';button.setAttribute('aria-describedby',[described,tip.id].filter(Boolean).join(' '));
        },immediate?0:220);
    }
    const target=(event:any)=>event.target?.closest?.('.icon-btn[aria-label],button[data-tooltip]') as HTMLElement;
    doc.addEventListener('pointerover',event=>{if(event.pointerType==='touch')return;const button=target(event);if(button)show(button);});
    doc.addEventListener('pointerout',event=>{if(active&&!active.contains(event.relatedTarget as Node))hide();});
    doc.addEventListener('focusin',event=>{const button=target(event);if(button)show(button,true);});
    doc.addEventListener('focusout',hide);doc.addEventListener('click',hide);doc.addEventListener('scroll',hide,true);
    doc.addEventListener('keydown',event=>{if(event.key==='Escape')hide();});
    doc.defaultView?.addEventListener('resize',hide);doc.defaultView?.addEventListener('language-change',hide);
    return {hide};
}
export function mobileActions(ctx:any,view:string){
    const links=[['overview','Übersicht','dashboard'],['returns','Retouren','return'],['products','Produkte','box']];
    const kind=['overview','returns'].includes(view)&&ctx.can('returnsCreate')?'returns':view==='products'&&ctx.can('productsCreate')?'products':'';
    return html`${kind?html`<button type="button" class="btn primary mobile-create" data-mobile-create="${kind}" aria-label="${kind==='returns'?t('Neue Retoure'):t('Neues Produkt')}" title="${kind==='returns'?t('Neue Retoure'):t('Neues Produkt')}">${icon('plus')}${kind==='returns'?t('Neue Retoure'):t('Neues Produkt')}</button>`:''}<nav class="mobile-bottom-nav" aria-label="Mobile Hauptnavigation">${links.map(([key,label,shape])=>html`<a href="/#${key}"${view===key?' aria-current="page"':''}>${icon(shape)}<span>${t(label)}</span></a>`).join('')}<button type="button" id="mobile-more" aria-label="Weitere Bereiche öffnen" aria-controls="main-sidebar" aria-expanded="false"${!links.some(([key])=>key===view)?' class="current"':''}>${icon('menu')}<span>Mehr</span></button></nav>`;
}
export function loadingSkeleton(layout='settings'){
    const line=(wide=false)=>`<span class="skeleton-line${wide?' wide':''}"></span>`;
    const card=`<div class="skeleton-card">${line()}${line(true)}${line(true)}${line()}</div>`;
    return html`<div class="view-skeleton skeleton-${layout}" role="status" aria-label="Inhalte werden geladen"><span class="sr-only">Inhalte werden geladen …</span><div aria-hidden="true">${layout==='conversation'?`<div class="skeleton-messages">${card}${card}</div>`:layout==='channels'?`<div class="skeleton-channels">${card}${card}${card}</div>`:layout==='settings'||layout==='account'?`<div class="skeleton-settings">${card}${card}</div>`:`<div class="skeleton-heading">${line()}${line(true)}</div>${layout==='overview'?`<div class="skeleton-metrics">${card.repeat(4)}</div>`:''}<div class="skeleton-table">${card.repeat(3)}</div>`}</div></div>`;
}
// Called only on freshly rendered section templates, before their async binder.
export function prepareLoading(root:HTMLElement){
    for(const element of root.querySelectorAll<HTMLElement>('.loading,[data-view-loading]'))element.innerHTML=loadingSkeleton(element.dataset.viewLoading||'settings');
}
