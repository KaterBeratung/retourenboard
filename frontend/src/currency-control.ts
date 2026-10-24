import {html,t,setText,formatDate,formatNumber,apiError} from './i18n.js';
import {h,icon,updateMarkup} from './ui.js';
import {usesDollar} from './inventory-display.js';

const empty={base:'EUR',display:'EUR',rate:null,date:null,checkedAt:null,stale:false,status:'disabled'};
export function createCurrencyView(storage?:Pick<Storage,'getItem'|'setItem'|'removeItem'>){
    let user:number|null=null,override:string|null=null,global:any={...empty},quote:any=null,generation=0,busy=false,error='';
    const key=()=>`retourenboard.currency.${user}`;
    const save=()=>{try{if(override)storage?.setItem(key(),override);else storage?.removeItem(key());}catch{}};
    const desired=()=>override??global.display??'EUR';
    function snapshot(){
        const source=quote??global,display=desired(),rate=source.rate??null,stale=source.stale??false;
        return {...source,base:'EUR',display,rate,stale,status:display==='EUR'?'disabled':!rate?'unavailable':stale?'cached':'current'};
    }
    function sync(value){
        global={...empty,...value};
        if(usesDollar({...global,display:'USD'})&&(!quote||global.checkedAt>quote.checkedAt||global.checkedAt===quote.checkedAt&&global.stale&&!quote.stale))quote={...global};
    }
    async function load(api,token=++generation,display='USD'){
        if(user===null)return false;
        busy=true;error='';
        try{
            const result=await api('/api/currency?display='+display);
            if(token!==generation||user===null)return false;
            if(display==='USD'&&!usesDollar(result))throw new Error('Der EUR/USD-Wechselkurs ist zurzeit nicht verfügbar. Bitte später erneut versuchen.');
            quote={...result};return true;
        }catch(err){if(token===generation)error=String(err.message);return false;}
        finally{if(token===generation)busy=false;}
    }
    return {snapshot,load,
        account(id:number|null){
            if(id===user)return;
            user=id;generation++;override=null;global={...empty};quote=null;busy=false;error='';
            try{const saved=storage?.getItem(key());if(id!==null&&['EUR','USD'].includes(saved))override=saved;}catch{}
        },
        sync,
        apply(value){generation++;busy=false;error='';sync(value);},
        async choose(display:string,api){
            if(user===null||!['EUR','USD'].includes(display))return false;
            const token=++generation;
            if(display==='USD'&&!await load(api,token))return false;
            if(token!==generation||user===null)return false;
            override=display;busy=false;error='';save();return true;
        },
        useDefault(){generation++;override=null;busy=false;error='';if(user!==null)save();},
        hasOverride:()=>override!==null,
        busy:()=>busy,error:()=>error,desired
    };
}
export function renderCurrencyMenu(view:ReturnType<typeof createCurrencyView>){
    const currency=view.snapshot(),active=usesDollar(currency)?'USD':'EUR';
    return html`<div class="currency-menu-heading"><div><strong>Anzeigewährung</strong><p>Wähle die Währung für deine Ansicht.</p></div></div>
    <div class="currency-options" role="group" aria-label="Anzeigewährung auswählen">${[['EUR','€',t('Euro')],['USD','$',t('US-Dollar')]].map(([code,symbol,name])=>html`<button class="currency-option" type="button" data-currency-choice="${code}" aria-pressed="${active===code}" ${view.busy()?'disabled':''}><span class="currency-option-symbol">${symbol}</span><span><strong>${name}</strong><small>${code}</small></span><span class="currency-option-check">${active===code?icon('check'):''}</span></button>`).join('')}</div>
    <div class="currency-menu-rate" aria-live="polite"><span class="eyebrow">Wechselkurs</span>${currency.rate?html`<strong>1 EUR = ${formatNumber(currency.rate,{minimumFractionDigits:4,maximumFractionDigits:4})} USD</strong><div class="currency-rate-meta"><span>Kursstand</span><time datetime="${h(currency.date)}">${formatDate(currency.date+'T12:00:00',{day:'2-digit',month:'2-digit',year:'numeric'},'toLocaleDateString')}</time></div><div class="currency-rate-meta"><span>Quelle</span><a href="https://frankfurter.dev/" target="_blank" rel="noopener noreferrer">ECB · Frankfurter</a></div>${currency.stale?html('<p class="currency-menu-warning">Gespeicherter Kurs · Bitte den Kursstand beachten.</p>'):''}`:html`<p class="muted">${view.busy()?t('Kurs wird geladen …'):t('Kursdaten werden beim Wechsel auf USD geladen.')}</p>`}
    ${view.error()?html`<p class="currency-menu-error" role="alert">${h(apiError(view.error()))}</p>`:''}<p class="currency-menu-hint">Originalpreise, Preiseingabe und CSV bleiben in EUR.</p></div>
    <div class="currency-menu-footer"><small>Für dieses Konto in diesem Browser gespeichert.</small>${view.hasOverride()?html('<button class="text-link" type="button" data-currency-default>Board-Standard verwenden</button>'):''}</div>`;
}
export function bindCurrencyControl(ctx,root:HTMLElement,onChange:()=>void){
    const view=createCurrencyView({getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value),removeItem:key=>localStorage.removeItem(key)});
    const details=document.createElement('details');details.className='currency-control';details.id='currency-control';
    details.innerHTML=html`<summary aria-label="Währung auswählen" aria-controls="currency-menu" aria-expanded="false"><span class="currency-current-symbol" aria-hidden="true">€</span><span data-currency-code>EUR</span><svg class="currency-caret" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></summary><div class="currency-menu" id="currency-menu"></div>`;
    const badge=root.querySelector('.preview-badge');
    if(badge)badge.after(details);else root.prepend(details);
    const summary=details.querySelector('summary'),menu=details.querySelector<HTMLElement>('#currency-menu');
    let pendingFocus:string|null=null;
    function update(){
        const focused=menu.contains(document.activeElement)?(document.activeElement as HTMLElement).dataset.currencyChoice:document.activeElement===summary?pendingFocus:null;
        const code=usesDollar(view.snapshot())?'USD':'EUR';
        const label=details.querySelector('[data-currency-code]'),symbol=details.querySelector('.currency-current-symbol'),mark=code==='USD'?'$':'€';
        if(label.textContent!==code)setText(label,code);
        if(symbol.textContent!==mark)setText(symbol,mark);
        const changed=updateMarkup(menu,renderCurrencyMenu(view));
        if(!changed)return;
        if(details.open&&['EUR','USD'].includes(focused)){
            if(view.busy()){pendingFocus=focused;summary.focus();}
            else{pendingFocus=null;menu.querySelector<HTMLButtonElement>(`[data-currency-choice="${focused}"]`)?.focus();}
        }else if(!view.busy())pendingFocus=null;
    }
    function close(){pendingFocus=null;details.open=false;summary.setAttribute('aria-expanded','false');}
    details.addEventListener('toggle',()=>{
        summary.setAttribute('aria-expanded',String(details.open));
        if(details.open&&!view.snapshot().rate&&!view.busy()){
            const current=ctx.authGeneration,pending=view.load(ctx.api);update();
            void pending.then(()=>{if(ctx.unlocked&&current===ctx.authGeneration)update();});
        }
    });
    menu.addEventListener('click',async event=>{
        const button=(event.target as HTMLElement).closest<HTMLButtonElement>('button');if(!button||view.busy())return;
        if(button.hasAttribute('data-currency-default')){view.useDefault();update();close();summary.focus();onChange();return;}
        const code=button.dataset.currencyChoice;if(!code)return;
        const current=ctx.authGeneration,pending=view.choose(code,ctx.api);update();
        const applied=await pending;if(!ctx.unlocked||current!==ctx.authGeneration)return;
        update();if(applied){close();summary.focus();onChange();}
    });
    document.addEventListener('click',event=>{if(details.open&&!event.composedPath().includes(details))close();});
    details.addEventListener('keydown',event=>{if(event.key==='Escape'&&details.open){event.preventDefault();close();summary.focus();}});
    update();
    let accountId,authVersion;
    return {
        snapshot:(fallback)=>{view.sync(fallback);return view.snapshot();},
        apply:(value)=>{view.apply(value);update();},
        account:(id,version)=>{
            if(id===accountId&&version===authVersion)return;
            accountId=id;authVersion=version;view.account(null);view.account(id);details.hidden=id===null;close();update();
        },
        async sync(value){
            view.sync(value);const current=ctx.authGeneration;
            if(view.desired()==='USD')await view.load(ctx.api);
            if(ctx.unlocked&&current===ctx.authGeneration)update();
        },
        async refresh(){
            if(!ctx.unlocked||view.busy())return;
            const display=details.open||view.desired()==='USD'?'USD':document.querySelector?.('#currency-rate')?'EUR':null;
            if(!display)return;
            const current=ctx.authGeneration;await view.load(ctx.api,undefined,display);
            if(ctx.unlocked&&current===ctx.authGeneration)update();
        }
    };
}
