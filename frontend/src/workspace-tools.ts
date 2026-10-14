import {html,t,setText} from './i18n.js';
import {h,icon,openDialog,trackFormSave} from './ui.js';

export type WorkspaceKind='products'|'returns';
export type WorkspaceSearchResult={kind:WorkspaceKind;id:number|string;label:string;subtitle:string};
export type WorkspaceFilter={view:WorkspaceKind;search:string;status:string;scope:string;category:string;activity:string;reason:string;assignee:string};
export type SavedWorkspaceFilter={id:string;label:string;state:WorkspaceFilter};
type FilterStorage=Pick<Storage,'getItem'|'setItem'>;

const scalar=(value:any):string=>typeof value==='string'?value:typeof value==='number'&&Number.isFinite(value)?String(value):'';
const normalize=(value:any)=>scalar(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const validRecordId=(value:any)=>typeof value==='number'?Number.isSafeInteger(value)&&value>0:typeof value==='string'&&value.length>0&&value.length<=128&&!/[\u0000-\u001f\u007f]/.test(value);
const joinData=(values:any[])=>[...new Set(values.map(scalar).map(value=>value.trim()).filter(Boolean))].join(' · ');

/** Search only the already authenticated inventory supplied by the caller. */
export function searchInventory(inventory:{products?:any[];returns?:any[]},query:string,{limit=30}:{limit?:number}={}):WorkspaceSearchResult[]{
    const text=normalize(query),terms=text.split(/\s+/).filter(Boolean);
    const bounded=Number.isFinite(limit)?Math.max(0,Math.min(60,Math.floor(limit))):30;
    if(!terms.length||!bounded)return [];
    const candidates:{result:WorkspaceSearchResult;score:number;order:number}[]=[];
    for(const kind of ['products','returns'] as WorkspaceKind[]){
        const rows=Array.isArray(inventory?.[kind])?inventory[kind]:[];
        for(const row of rows){
            if(!row||typeof row!=='object'||!validRecordId(row.id))continue;
            const fields=(kind==='products'?[row.name,row.sku,row.ean,row.supplier]:[row.productName,row.sku,row.ean,row.returnNumber,row.serialNumber,row.replacementSerialNumber,row.customerReference,row.trackingNumber,row.supplier]).map(normalize).filter(Boolean);
            if(!terms.every(term=>fields.some(field=>field.includes(term))))continue;
            const score=fields.some(field=>field===text)?3:fields.some(field=>field.startsWith(text))?2:1;
            const label=kind==='products'?scalar(row.name)||scalar(row.sku)||scalar(row.id):scalar(row.returnNumber)||scalar(row.productName)||scalar(row.id);
            const subtitle=joinData(kind==='products'?[row.sku,row.ean,row.supplier]:[row.productName,row.serialNumber,row.replacementSerialNumber,row.customerReference,row.trackingNumber,row.supplier]);
            candidates.push({result:{kind,id:row.id,label,subtitle},score,order:candidates.length});
        }
    }
    return candidates.sort((a,b)=>b.score-a.score||a.order-b.order).slice(0,bounded).map(candidate=>candidate.result);
}

function plain(value:any){
    if(!value||typeof value!=='object'||Array.isArray(value))return false;
    const prototype=Object.getPrototypeOf(value);
    return prototype===Object.prototype||prototype===null;
}
function filterText(value:any,limit:number){return typeof value==='string'&&value.length<=limit&&!/[\u0000-\u001f\u007f]/.test(value)?value:'';}
function sanitizedFilter(value:any):WorkspaceFilter|null{
    if(!plain(value)||!['returns','products'].includes(value.view))return null;
    return {
        view:value.view,search:filterText(value.search,500),status:filterText(value.status,250),
        scope:['','open','checking','closed','overdue','active','today'].includes(value.scope)?value.scope:'',
        category:filterText(value.category,250),activity:['active','all','archived'].includes(value.activity)?value.activity:'active',
        reason:filterText(value.reason,250),assignee:filterText(value.assignee,64),
    };
}
function validLabel(value:any){return typeof value==='string'&&value.trim().length>0&&value.trim().length<=60&&!/[\u0000-\u001f\u007f]/.test(value)?value.trim():null;}
function accountId(value:any){return typeof value==='number'&&Number.isSafeInteger(value)&&value>0?String(value):typeof value==='string'&&value.trim()&&value.length<=160&&!/[\u0000-\u001f\u007f]/.test(value)?value.trim():null;}
function savedId(){return globalThis.crypto?.randomUUID?.()??`view-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,12)}`;}

/** Local preferences contain filter strings only, scoped explicitly to one account. */
export function savedFilterStore(storage:FilterStorage|null|undefined,userId:number|string|null|undefined){
    const account=accountId(userId),key=account?`retourenboard.saved-filters.v1.${encodeURIComponent(account)}`:null;
    function list():SavedWorkspaceFilter[]{
        if(!key||!storage)return [];
        try{
            const source=storage.getItem(key);
            if(!source||source.length>100000)return [];
            const parsed=JSON.parse(source);
            if(!Array.isArray(parsed))return [];
            const result:SavedWorkspaceFilter[]=[],seen=new Set<string>();
            for(const candidate of parsed){
                if(result.length===20)break;
                if(!plain(candidate)||typeof candidate.id!=='string'||!candidate.id||candidate.id.length>128||/[\u0000-\u001f\u007f]/.test(candidate.id)||seen.has(candidate.id))continue;
                const label=validLabel(candidate.label),state=sanitizedFilter(candidate.state);
                if(label&&state){result.push({id:candidate.id,label,state});seen.add(candidate.id);}
            }
            return result;
        }catch{return [];}
    }
    function write(items:SavedWorkspaceFilter[]){
        if(!key||!storage)return false;
        try{storage.setItem(key,JSON.stringify(items));return true;}catch{return false;}
    }
    return {
        list,
        save(labelValue:any,stateValue:any):{ok:boolean;item?:SavedWorkspaceFilter;reason?:'invalid'|'full'|'unavailable'}{
            if(!key||!storage)return {ok:false,reason:'unavailable'};
            const label=validLabel(labelValue),state=sanitizedFilter(stateValue);
            if(!label||!state)return {ok:false,reason:'invalid'};
            const items=list(),index=items.findIndex(item=>item.label.toLowerCase()===label.toLowerCase());
            if(index<0&&items.length>=20)return {ok:false,reason:'full'};
            const item={id:index<0?savedId():items[index].id,label,state};
            if(index<0)items.push(item);else items[index]=item;
            return write(items)?{ok:true,item}:{ok:false,reason:'unavailable'};
        },
        remove(id:string){
            const items=list(),remaining=items.filter(item=>item.id!==id);
            return remaining.length!==items.length&&write(remaining);
        },
    };
}

export const WORKSPACE_TRANSLATIONS={
    'Überall suchen':'Search everywhere',
    'Produkte und Retouren an einem Ort finden.':'Find products and returns in one place.',
    'Suchbegriff':'Search term',
    'Produkt, Artikelnummer, EAN, Retoure oder Seriennummer …':'Product, SKU, EAN, return or serial number …',
    'Produkte und Retouren durchsuchen':'Search products and returns',
    'Suchergebnisse':'Search results',
    'Produkte':'Products','Retouren':'Returns',
    'Gib einen Suchbegriff ein.':'Enter a search term.',
    'Suche auch nach Sendungsnummer, Kundenreferenz, Austauschseriennummer oder Lieferant.':'You can also search by tracking number, customer reference, replacement serial number or supplier.',
    'Keine passenden Produkte oder Retouren.':'No matching products or returns.',
    'Prüfe die Schreibweise oder verwende einen kürzeren Suchbegriff.':'Check the spelling or use a shorter search term.',
    'Bestand wird geladen …':'Loading inventory …',
    'Der Bestand konnte nicht geladen werden.':'The inventory could not be loaded.',
    'Schließe die Suche und versuche es erneut.':'Close the search and try again.',
    'Treffer:':'Matches:',
    'Suche verfeinern für weitere Treffer.':'Refine the search to find more matches.',
    'Pfeiltasten zum Auswählen, Enter zum Öffnen, Escape zum Schließen.':'Use arrow keys to select, Enter to open and Escape to close.',
    'Der Treffer konnte nicht geöffnet werden.':'The result could not be opened.',
    'Gespeicherte Ansichten':'Saved views',
    'Schnellfilter':'Quick filters',
    'Offene Retouren':'Open returns','Überfällige Retouren':'Overdue returns','Meine Retouren':'My returns',
    'Noch keine eigenen Ansichten.':'No saved views yet.',
    'Aktuelle Ansicht speichern':'Save current view',
    'Ansicht entfernen':'Remove view',
    'Ansicht speichern':'Save view','Name der Ansicht':'View name',
    'Meine Produktansicht':'My product view','Meine Retourenansicht':'My return view',
    'Deine Ansichten bleiben für dieses Konto in diesem Browser gespeichert.':'Your views stay saved for this account in this browser.',
    'Bis zu 60 Zeichen. Ein vorhandener Name aktualisiert die Ansicht.':'Up to 60 characters. An existing name updates that view.',
    'Speichern':'Save',
    'Bitte einen Namen mit 1 bis 60 Zeichen eingeben.':'Enter a name between 1 and 60 characters.',
    'Du kannst bis zu 20 Ansichten speichern. Entferne zuerst eine vorhandene Ansicht.':'You can save up to 20 views. Remove an existing view first.',
    'Dieser Browser kann die Ansicht gerade nicht speichern.':'This browser cannot save the view right now.',
    'Dieser Browser kann die Ansicht gerade nicht entfernen.':'This browser cannot remove the view right now.',
    'Ansicht gespeichert.':'View saved.',
    'Ansicht entfernt. Du kannst sie erneut speichern.':'View removed. You can save it again.',
};

type WorkspaceToolsContext={
    products?:any[];returns?:any[];ensureInventory?:()=>Promise<any>|any;
    openSearchResult?:(kind:WorkspaceKind,id:number|string)=>Promise<any>|any;
    userId?:number|string;session?:{user?:{id?:number|string}};authGeneration?:any;
    storage?:FilterStorage|null;toast?:(message:any)=>void;canFilterMine?:boolean;
};
const contextUser=(ctx:WorkspaceToolsContext)=>accountId(ctx.userId??ctx.session?.user?.id);
function contextStorage(ctx:WorkspaceToolsContext):FilterStorage|null{
    try{return ctx.storage===undefined?globalThis.localStorage:ctx.storage;}catch{return null;}
}

/** Returns the shared dialog immediately; cache loading remains owned by the caller. */
export function openWorkspaceSearch(ctx:WorkspaceToolsContext,initialQuery=''){
    const dialog=openDialog({
        title:t('Überall suchen'),subtitle:t('Produkte und Retouren an einem Ort finden.'),
        body:html`<div class="dialog-body workspace-search" data-workspace-search><label class="workspace-search-label" for="workspace-search-input">Suchbegriff</label><div class="workspace-search-control">${icon('search')}<input id="workspace-search-input" data-workspace-search-input type="search" role="combobox" aria-autocomplete="list" aria-haspopup="listbox" aria-controls="workspace-search-results" aria-describedby="workspace-search-hint workspace-search-keys" aria-expanded="false" autocomplete="off" placeholder="Produkt, Artikelnummer, EAN, Retoure oder Seriennummer …" aria-label="Produkte und Retouren durchsuchen"></div><p id="workspace-search-hint" class="workspace-search-hint" data-workspace-search-hint role="status" aria-live="polite" aria-atomic="true"></p><div id="workspace-search-results" class="workspace-search-results" data-workspace-search-results role="listbox" aria-label="Suchergebnisse"></div><p id="workspace-search-keys" class="workspace-search-keys">Pfeiltasten zum Auswählen, Enter zum Öffnen, Escape zum Schließen.</p></div>`,
    });
    dialog.classList.add('workspace-search-dialog');
    const root=dialog.querySelector('[data-workspace-search]'),input=root.querySelector('[data-workspace-search-input]'),list=root.querySelector('[data-workspace-search-results]'),hint=root.querySelector('[data-workspace-search-hint]');
    const account=contextUser(ctx),generation=ctx.authGeneration;
    let matches:WorkspaceSearchResult[]=[],active=-1,loading=Boolean(ctx.ensureInventory),failed=false;
    const current=()=>dialog.open&&dialog.querySelector('[data-workspace-search]')===root;
    const sameAccount=()=>account===contextUser(ctx)&&generation===ctx.authGeneration;
    function highlight(index:number){
        active=index;
        if(active<0)input.removeAttribute('aria-activedescendant');
        else input.setAttribute('aria-activedescendant',`workspace-result-${active}`);
        root.querySelectorAll('[data-workspace-result]').forEach((option:any)=>{
            const selected=Number(option.dataset.workspaceResult)===active;
            option.classList.toggle('highlighted',selected);option.setAttribute('aria-selected',String(selected));
            if(selected)option.scrollIntoView?.({block:'nearest'});
        });
    }
    function paint(){
        if(!current())return;
        if(!sameAccount()){dialog.close();return;}
        const found=searchInventory({products:ctx.products,returns:ctx.returns},input.value);
        matches=found.filter(result=>result.kind==='products').concat(found.filter(result=>result.kind==='returns'));active=-1;
        input.removeAttribute('aria-activedescendant');input.setAttribute('aria-expanded',String(matches.length>0));
        if(matches.length){
            list.innerHTML=(['products','returns'] as WorkspaceKind[]).map(kind=>{
                const group=matches.map((result,index)=>({result,index})).filter(item=>item.result.kind===kind);
                if(!group.length)return '';
                return html`<div class="workspace-result-group" role="group" aria-label="${h(t(kind==='products'?'Produkte':'Retouren'))}"><h3>${h(t(kind==='products'?'Produkte':'Retouren'))}</h3>${group.map(({result,index})=>html`<button type="button" role="option" tabindex="-1" id="workspace-result-${index}" class="workspace-search-result" data-workspace-result="${index}" aria-selected="false"><span class="workspace-result-icon">${icon(kind==='products'?'box':'return')}</span><span class="workspace-result-copy"><strong>${h(result.label)}</strong><small>${h(result.subtitle)}</small></span>${icon('arrow')}</button>`).join('')}</div>`;
            }).join('');
            setText(hint,t`Treffer: ${matches.length}`);
            if(matches.length===30)list.innerHTML+=html('<p class="workspace-search-limit">Suche verfeinern für weitere Treffer.</p>');
        }else{
            const hasQuery=Boolean(input.value.trim());
            const title=loading?t('Bestand wird geladen …'):failed?t('Der Bestand konnte nicht geladen werden.'):hasQuery?t('Keine passenden Produkte oder Retouren.'):t('Gib einen Suchbegriff ein.');
            const help=failed?t('Schließe die Suche und versuche es erneut.'):hasQuery?t('Prüfe die Schreibweise oder verwende einen kürzeren Suchbegriff.'):t('Suche auch nach Sendungsnummer, Kundenreferenz, Austauschseriennummer oder Lieferant.');
            setText(hint,title);list.innerHTML=html`<div class="workspace-search-empty" role="presentation">${icon('search')}<p>${h(help)}</p></div>`;
        }
    }
    async function choose(index:number){
        if(!current()||!sameAccount())return;
        const selected=matches[index];
        if(!selected||typeof ctx.openSearchResult!=='function')return;
        dialog.close();
        try{await ctx.openSearchResult(selected.kind,selected.id);}catch{ctx.toast?.(t('Der Treffer konnte nicht geöffnet werden.'));}
    }
    input.addEventListener('input',paint);
    input.addEventListener('keydown',(event:any)=>{
        if(!current())return;
        if(event.key==='Escape'){event.preventDefault();event.stopPropagation();dialog.close();}
        else if((event.key==='ArrowDown'||event.key==='ArrowUp')&&matches.length){
            event.preventDefault();highlight(event.key==='ArrowDown'?(active+1)%matches.length:(active<=0?matches.length-1:active-1));
        }else if(event.key==='Enter'&&matches.length){event.preventDefault();void choose(active<0?0:active);}
    });
    list.addEventListener('click',(event:any)=>{
        const option=event.target.closest?.('[data-workspace-result]');
        if(option&&list.contains(option))void choose(Number(option.dataset.workspaceResult));
    });
    input.value=String(initialQuery).slice(0,500);paint();input.focus();
    if(ctx.ensureInventory){
        try{Promise.resolve(ctx.ensureInventory()).then(()=>{loading=false;paint();},()=>{loading=false;failed=true;paint();});}
        catch{loading=false;failed=true;paint();}
    }
    return dialog;
}

function builtinFilters(ctx:WorkspaceToolsContext){
    const choices=[{id:'open',label:t('Offene Retouren'),state:sanitizedFilter({view:'returns',scope:'open'})},{id:'overdue',label:t('Überfällige Retouren'),state:sanitizedFilter({view:'returns',scope:'overdue'})}];
    if(ctx.canFilterMine&&contextUser(ctx))choices.push({id:'mine',label:t('Meine Retouren'),state:sanitizedFilter({view:'returns',assignee:'mine'})});
    return choices;
}
function savedFilterContents(ctx:WorkspaceToolsContext){
    const items=savedFilterStore(contextStorage(ctx),contextUser(ctx)).list();
    return html`<summary>${icon('filter')}<span>Gespeicherte Ansichten</span>${items.length?html`<span class="workspace-saved-count">${items.length}</span>`:''}${icon('chevron')}</summary><div class="workspace-saved-popover"><p class="workspace-saved-caption">Schnellfilter</p><div class="workspace-builtin-filters">${builtinFilters(ctx).map(item=>html`<button type="button" data-saved-builtin="${item.id}">${h(item.label)}</button>`).join('')}</div><div class="workspace-saved-list">${items.length?items.map(item=>html`<div class="workspace-saved-row"><button type="button" data-saved-view="${h(item.id)}"><strong>${h(item.label)}</strong><small>${h(t(item.state.view==='products'?'Produkte':'Retouren'))}</small></button><button type="button" class="workspace-saved-delete" data-delete-saved="${h(item.id)}" aria-label="${h(t('Ansicht entfernen'))}: ${h(item.label)}" title="Ansicht entfernen">${icon('trash')}</button></div>`).join(''):html('<p class="workspace-saved-empty">Noch keine eigenen Ansichten.</p>')}</div><button type="button" class="workspace-save-current" data-save-view${contextUser(ctx)?'':' disabled'}>${icon('plus')}Aktuelle Ansicht speichern</button></div>`;
}

export function renderSavedFilters(ctx:WorkspaceToolsContext,filter:any){
    return sanitizedFilter(filter)?html`<details class="workspace-saved-filters" data-saved-filters>${savedFilterContents(ctx)}</details>`:'';
}

const savedBindings=new WeakMap<object,()=>void>();
/** Bind once to the parent container, so menu refreshes retain their event handler. */
export function bindSavedFilters(ctx:WorkspaceToolsContext,root:any,filter:any,onApply:(state:WorkspaceFilter)=>void){
    if(!root?.addEventListener)return ()=>{};
    savedBindings.get(root)?.();
    const store=savedFilterStore(contextStorage(ctx),contextUser(ctx)),account=contextUser(ctx),generation=ctx.authGeneration;
    const sameAccount=()=>account===contextUser(ctx)&&generation===ctx.authGeneration;
    function menu(){return root.matches?.('[data-saved-filters]')?root:root.querySelector('[data-saved-filters]');}
    function refresh(){const details=menu();if(details){details.innerHTML=savedFilterContents(ctx);details.open=true;details.querySelector('summary')?.focus();}}
    function apply(state:WorkspaceFilter){const details=menu();if(details)details.open=false;onApply({...state});}
    function saveCurrent(){
        const currentFilter=sanitizedFilter(filter);
        if(!currentFilter)return;
        const dialog=openDialog({title:t('Ansicht speichern'),body:html`<form class="workspace-save-view" data-save-workspace-view><div class="dialog-body"><label class="field"><span>Name der Ansicht</span><input data-saved-label name="label" required maxlength="60" autocomplete="off" value="${h(t(currentFilter.view==='products'?'Meine Produktansicht':'Meine Retourenansicht'))}"><small>Bis zu 60 Zeichen. Ein vorhandener Name aktualisiert die Ansicht.</small></label><p class="workspace-save-help">Deine Ansichten bleiben für dieses Konto in diesem Browser gespeichert.</p><p class="form-error" data-saved-error role="alert" hidden></p></div><div class="dialog-footer"><button type="button" class="btn secondary" data-close>Abbrechen</button><button type="submit" class="btn primary">Speichern</button></div></form>`});
        const form=dialog.querySelector('[data-save-workspace-view]'),input=form.querySelector('[data-saved-label]'),error=form.querySelector('[data-saved-error]'),startSave=trackFormSave(form);
        form.addEventListener('submit',(event:any)=>{
            event.preventDefault();if(!sameAccount()){dialog.close();return;}
            const committed=startSave(),result=store.save(input.value,currentFilter);
            if(result.ok){committed();dialog.close();refresh();ctx.toast?.(t('Ansicht gespeichert.'));}
            else{setText(error,t(result.reason==='full'?'Du kannst bis zu 20 Ansichten speichern. Entferne zuerst eine vorhandene Ansicht.':result.reason==='unavailable'?'Dieser Browser kann die Ansicht gerade nicht speichern.':'Bitte einen Namen mit 1 bis 60 Zeichen eingeben.'));error.hidden=false;input.focus();}
        });
        input.focus();input.select?.();
    }
    const click=(event:any)=>{
        const button=event.target.closest?.('[data-saved-view],[data-saved-builtin],[data-delete-saved],[data-save-view]');
        if(!button||!root.contains(button)||!sameAccount())return;
        if(button.dataset.savedView){const saved=store.list().find(item=>item.id===button.dataset.savedView);if(saved)apply(saved.state);}
        else if(button.dataset.savedBuiltin){const builtin=builtinFilters(ctx).find(item=>item.id===button.dataset.savedBuiltin);if(builtin)apply(builtin.state);}
        else if(button.dataset.deleteSaved){
            if(store.remove(button.dataset.deleteSaved)){refresh();ctx.toast?.(t('Ansicht entfernt. Du kannst sie erneut speichern.'));}
            else ctx.toast?.(t('Dieser Browser kann die Ansicht gerade nicht entfernen.'));
        }else if(button.hasAttribute('data-save-view'))saveCurrent();
    };
    root.addEventListener('click',click);
    const unbind=()=>{root.removeEventListener('click',click);if(savedBindings.get(root)===unbind)savedBindings.delete(root);};
    savedBindings.set(root,unbind);return unbind;
}
