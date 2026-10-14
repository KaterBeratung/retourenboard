import {html,t,setText} from './i18n.js';
import {icon} from './ui.js';

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
    return html`${kind?html`<button type="button" class="btn primary mobile-create" data-mobile-create="${kind}">${icon('plus')}${kind==='returns'?t('Neue Retoure'):t('Neues Produkt')}</button>`:''}<nav class="mobile-bottom-nav" aria-label="Mobile Hauptnavigation">${links.map(([key,label,shape])=>html`<a href="/#${key}"${view===key?' aria-current="page"':''}>${icon(shape)}<span>${t(label)}</span></a>`).join('')}<button type="button" id="mobile-more" aria-label="Weitere Bereiche öffnen" aria-controls="main-sidebar" aria-expanded="false"${!links.some(([key])=>key===view)?' class="current"':''}>${icon('menu')}<span>Mehr</span></button></nav>`;
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
