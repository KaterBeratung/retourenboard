import {html,t,setText} from './i18n.js';
import {h,icon} from './ui.js';
import {productAvatar} from './product-images.js';

const normalize=(value:any)=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase().trim();
export function searchProducts(products:any[],query:string,selectedId?:number){
    const terms=normalize(query).split(/\s+/).filter(Boolean);
    return products.filter(p=>(p.active||p.id===selectedId)&&terms.every(term=>normalize([p.name,p.sku,p.ean].join(' ')).includes(term)));
}
const recent=new WeakMap<object,{user:any;generation:any;productId:number}>();
let nextPickerId=0;
export function rememberProduct(ctx,productId:number){
    recent.set(ctx,{user:ctx.session?.user?.id,generation:ctx.authGeneration,productId:Number(productId)});
}
export function recentProduct(ctx,products:any[]){
    const saved=recent.get(ctx);
    return saved&&saved.user===ctx.session?.user?.id&&saved.generation===ctx.authGeneration?products.find(p=>p.id===saved.productId&&p.active)??null:null;
}
export function productPicker(products:any[],selectedId?:number,last?:any,options:{optional?:boolean}={}){
    const optional=options.optional===true,id=`return-product-${++nextPickerId}`;
    return html`<div class="field full product-picker" data-product-picker><span><label for="${id}-search">Produkt ${optional?html`<span class="field-optional">Optional</span>`:html`<b>*</b>`}</label></span><div class="product-search-control">${icon('search')}<input id="${id}-search" data-product-search type="search" role="combobox" aria-autocomplete="list" aria-controls="${id}-options" aria-expanded="false" aria-haspopup="listbox"${optional?'':' required'} autocomplete="off" placeholder="Produktname, Artikelnummer oder EAN suchen …"><button type="button" class="icon-btn product-search-clear" data-product-clear aria-label="Produktauswahl entfernen" hidden>${icon('close')}</button><div class="product-search-popover" data-product-popover hidden><div id="${id}-options" data-product-list role="listbox" aria-label="Produkte"></div><p data-product-hint role="status"></p></div></div><select name="productId" hidden tabindex="-1" aria-hidden="true"><option value="">Produkt auswählen …</option>${products.filter(p=>p.active||p.id===selectedId).map(p=>html`<option value="${p.id}"${p.id===selectedId?' selected':''}>${h(p.name)} · ${h(p.sku)}</option>`).join('')}</select>${last?html`<button type="button" class="text-link recent-product" data-last-product="${last.id}">${icon('clock')}Letztes Produkt übernehmen: ${h(last.name)}</button>`:html('<small>Suche nach Name, Artikelnummer oder EAN und wähle einen Treffer.</small>')}</div>`;
}
// Coordinates use the visible viewport, including a raised mobile keyboard.
export function productPopoverPosition(anchor:any,popup:any,viewport:any){
    const pad=12,gap=6,frameLeft=viewport.left??0,frameTop=viewport.top??0;
    const width=Math.max(0,Math.min(320,viewport.width-pad*2,Math.max(240,anchor.right-anchor.left)));
    const below=Math.max(0,frameTop+viewport.height-pad-anchor.bottom-gap),above=Math.max(0,anchor.top-frameTop-pad-gap);
    const placement=below>=popup.height||below>=above?'below':'above';
    const maxHeight=Math.min(280,Math.max(0,viewport.height-pad*2),placement==='below'?below:above),height=Math.min(popup.height,maxHeight),rawTop=placement==='below'?anchor.bottom+gap:anchor.top-height-gap;
    return {left:Math.max(frameLeft+pad,Math.min(anchor.left,frameLeft+viewport.width-width-pad)),top:Math.max(frameTop+pad,Math.min(rawTop,frameTop+viewport.height-height-pad)),width,maxHeight,placement};
}
export function bindProductPicker(root:any,products:any[],selectedId?:number,onChoose:(product:any)=>void=()=>{},options:{optional?:boolean}={}){
    if(!root?.querySelector)return;
    const input:HTMLInputElement=root.querySelector('[data-product-search]'),select:HTMLSelectElement=root.querySelector('[name=productId]');
    const list:HTMLElement=root.querySelector('[data-product-list]'),popover:HTMLElement=root.querySelector('[data-product-popover]')??list;
    const hint=root.querySelector('[data-product-hint]'),clear=root.querySelector('[data-product-clear]');
    const floating=popover!==list&&typeof popover.showPopover==='function',doc=input.ownerDocument,view=doc?.defaultView,visual=view?.visualViewport,dialog=root.closest?.('dialog');
    let matches:any[]=[],highlight=-1,open=false,listening=false;
    if(floating){popover.setAttribute('popover','manual');popover.setAttribute('data-product-floating','');}
    function close(){
        open=false;
        if(floating&&popover.matches(':popover-open'))popover.hidePopover();
        list.hidden=true;popover.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');
        if(listening){doc.removeEventListener('pointerdown',outside,true);doc.removeEventListener('scroll',scroll,true);view?.removeEventListener('resize',position);visual?.removeEventListener('resize',position);visual?.removeEventListener('scroll',position);dialog?.removeEventListener('close',close);dialog?.removeEventListener('animationend',entered);listening=false;}
    }
    function position(){
        if(!floating||!open)return;
        if(root.isConnected===false){close();return;}
        const viewport={width:visual?.width??doc.documentElement.clientWidth,height:visual?.height??doc.documentElement.clientHeight,left:visual?.offsetLeft??0,top:visual?.offsetTop??0},anchor=input.getBoundingClientRect();
        const clip=root.closest?.('.dialog-body')?.getBoundingClientRect?.(),left=Math.max(viewport.left,clip?.left??viewport.left),right=Math.min(viewport.left+viewport.width,clip?.right??viewport.left+viewport.width),top=Math.max(viewport.top,clip?.top??viewport.top),bottom=Math.min(viewport.top+viewport.height,clip?.bottom??viewport.top+viewport.height);
        if(anchor.bottom<=top||anchor.top>=bottom||anchor.right<=left||anchor.left>=right){close();return;}
        popover.style.width=productPopoverPosition(anchor,{height:0},viewport).width+'px';
        list.style.maxHeight='';popover.style.maxHeight='';
        const natural=popover.getBoundingClientRect(),point=productPopoverPosition(anchor,natural,viewport),height=Math.min(point.maxHeight,natural.height);
        list.style.maxHeight=Math.max(0,height-hint.getBoundingClientRect().height-2)+'px';
        popover.style.maxHeight=height+'px';popover.style.left=point.left+'px';popover.style.top=point.top+'px';
    }
    const outside=(event:Event)=>{if(!root.contains(event.target as Node))close();};
    const scroll=(event:Event)=>{if(!popover.contains(event.target as Node))position();};
    const entered=(event:Event)=>{if(event.target===dialog)position();};
    function float(){
        if(!floating)return;
        if(!popover.matches(':popover-open'))popover.showPopover();
        position();
        if(listening)return;listening=true;
        doc.addEventListener('pointerdown',outside,true);doc.addEventListener('scroll',scroll,true);view?.addEventListener('resize',position);visual?.addEventListener('resize',position);visual?.addEventListener('scroll',position);dialog?.addEventListener('close',close);dialog?.addEventListener('animationend',entered);
    }
    if(floating)popover.addEventListener('toggle',(event:ToggleEvent)=>{if(event.newState==='closed'&&open&&!popover.matches(':popover-open'))close();});
    function selected(p:any,notify=true){
        select.value=p?String(p.id):'';input.value=p?`${p.name} · ${p.sku}`:'';
        clear.hidden=!p;input.setCustomValidity(p||options.optional?'':t('Bitte ein Produkt aus der Trefferliste auswählen.'));close();
        if(notify){onChoose(p);select.dispatchEvent(new Event('change',{bubbles:true}));}
    }
    function choose(id:number){const p=products.find(p=>p.id===Number(id)&&(p.active||p.id===selectedId));if(p){selected(p);input.focus();close();}}
    function paint(){
        list.innerHTML=matches.map((p,i)=>html`<button type="button" tabindex="-1" role="option" id="${list.id}-option-${i}" data-product-option="${p.id}" class="product-search-option${highlight===i?' highlighted':''}" aria-selected="${select.value===String(p.id)}">${productAvatar(p)}<span><strong>${h(p.name)}${p.active?'':t(' (archiviert)')}</strong><small>${h(p.sku)}${p.ean?' · EAN '+h(p.ean):''}</small></span>${select.value===String(p.id)?icon('check'):''}</button>`).join('');
        list.querySelectorAll<HTMLButtonElement>('[data-product-option]').forEach(button=>button.onclick=()=>choose(Number(button.dataset.productOption)));
        if(highlight>=0){input.setAttribute('aria-activedescendant',`${list.id}-option-${highlight}`);list.querySelector?.('.highlighted')?.scrollIntoView({block:'nearest'});}else input.removeAttribute('aria-activedescendant');
    }
    function suggest(){
        const all=searchProducts(products,select.value?'':input.value,selectedId);matches=all.slice(0,40);highlight=-1;
        open=true;popover.hidden=false;list.hidden=false;input.setAttribute('aria-expanded','true');paint();
        setText(hint,all.length===0?t('Keine passenden Produkte gefunden.'):all.length>matches.length?t`Treffer: ${matches.length} / ${all.length} · Suche eingrenzen`:t`Gefundene Produkte: ${all.length}`);
        float();
    }
    selected(products.find(p=>p.id===selectedId),false);
    input.addEventListener('focus',suggest);
    input.addEventListener('input',()=>{select.value='';clear.hidden=!input.value;input.setCustomValidity(options.optional&&!input.value.trim()?'':t('Bitte ein Produkt aus der Trefferliste auswählen.'));onChoose(null);select.dispatchEvent(new Event('change',{bubbles:true}));suggest();});
    input.addEventListener('keydown',event=>{
        if(event.key==='Escape'&&open){event.preventDefault();event.stopPropagation();close();return;}
        if(event.key==='ArrowDown'||event.key==='ArrowUp'){
            event.preventDefault();if(!open)suggest();if(!matches.length)return;
            highlight=event.key==='ArrowDown'?(highlight+1)%matches.length:(highlight<=0?matches.length-1:highlight-1);paint();
        }else if(event.key==='Enter'&&open){event.preventDefault();if(highlight>=0)choose(matches[highlight].id);else if(matches.length===1)choose(matches[0].id);}
        else if(event.key==='Tab')close();
    });
    clear.addEventListener('click',()=>{selected(null);input.focus();suggest();});
    root.addEventListener('focusout',event=>{if(!root.contains(event.relatedTarget))close();});
    root.querySelector('[data-last-product]')?.addEventListener('click',event=>choose(Number(event.currentTarget.dataset.lastProduct)));
    return {choose};
}
