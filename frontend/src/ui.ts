import {escapedText,html,t,addTranslations,setText} from './i18n.js';
import {canLeaveForms,observeForm,refreshFormState,readFormState,acceptFormState} from './unsaved.js';
export const h = (value) => escapedText(value, input => String(input ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])));
// Keep status rows balanced when a workspace has extra or archived statuses.
export function statusTabLayout(count:number){
    const total=Math.max(1,count),columns=(limit:number)=>Math.ceil(total/Math.ceil(total/limit));
    const leading=(limit:number)=>1+(columns(limit)-total%columns(limit))%columns(limit);
    return `status-cols-${columns(5)} status-medium-cols-${columns(3)} status-leading-${leading(5)} status-medium-leading-${leading(3)}`;
}
const renderedMarkup=new WeakMap<HTMLElement,string>();
// Stable shell controls keep focus, icon timelines and menu state during polling.
export function updateMarkup(element:HTMLElement,value:unknown){
    if(!element)return false;
    const markup=String(value??'');
    if(renderedMarkup.get(element)===markup)return false;
    renderedMarkup.set(element,markup);element.innerHTML=markup;return true;
}
const shapes = {
    logout:html('<path class="icon-surface" d="M9 4H6a2.5 2.5 0 0 0-2.5 2.5v11A2.5 2.5 0 0 0 6 20h3"/><path class="icon-logout-arrow" d="M10 12h10.5m-4-4 4 4-4 4"/>'),
    menu:html('<path d="M5 6.5h14"/><path d="M5 12h14"/><path d="M5 17.5h14"/>'),
    barcode:html('<path d="M8 3.5H6A2.5 2.5 0 0 0 3.5 6v2m12.5-4.5h2A2.5 2.5 0 0 1 20.5 6v2m-17 8v2A2.5 2.5 0 0 0 6 20.5h2m8 0h2a2.5 2.5 0 0 0 2.5-2.5v-2"/><path class="icon-scan-bars" d="M7.5 8v8m3-8v8m3-8v8m3-8v8"/><path class="icon-scan-line" d="M6.5 7h11" opacity="0"/>'),
    eye:html('<path class="icon-surface" d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z"/><circle class="icon-eye-pupil" cx="12" cy="12" r="3"/>'),
    eyeOff:html('<path d="M10.6 5.1A11 11 0 0 1 12 5c6.5 0 10 7 10 7a20 20 0 0 1-3.1 4.1M6.2 6.2A20 20 0 0 0 2 12s3.5 7 10 7a12 12 0 0 0 5.8-1.8M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path pathLength="1" d="m3 3 18 18"/>'),
    copy:html('<path class="icon-copy-back" d="M15.5 7.5v-1a3 3 0 0 0-3-3h-6a3 3 0 0 0-3 3v7a3 3 0 0 0 3 3H8"/><rect class="icon-copy-front icon-surface" x="8" y="7.5" width="12.5" height="13" rx="3"/>'),
    chat:html('<path class="icon-surface icon-chat-bubble" d="M7.5 4.5h9A4.5 4.5 0 0 1 21 9v4.5a4.5 4.5 0 0 1-4.5 4.5H9l-5 3V9a4.5 4.5 0 0 1 3.5-4.5Z"/><path class="icon-chat-lines" d="M8 9h9M8 13h6"/>'),
    user:html('<circle class="icon-surface" cx="12" cy="7.5" r="3.25"/><path class="icon-surface" d="M5 20v-1a7 6 0 0 1 14 0v1a.5.5 0 0 1-.5.5h-13a.5.5 0 0 1-.5-.5Z"/>'),
    users:html('<circle class="icon-surface" cx="8.5" cy="7.5" r="3"/><circle class="icon-user-head icon-surface" cx="17" cy="8" r="2.5"/><path class="icon-surface" d="M2.75 20v-1a5.75 5.5 0 0 1 11.5 0v1a.5.5 0 0 1-.5.5H3.25a.5.5 0 0 1-.5-.5Z"/><path d="M16.5 13a5 5 0 0 1 4.75 5v2"/>'),
    globe:html('<circle class="icon-surface" cx="12" cy="12" r="8.5"/><ellipse cx="12" cy="12" rx="3.8" ry="8.5"/><path d="M3.5 12h17"/>'),
    at:html('<circle cx="12" cy="12" r="4"/><path pathLength="1" d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>'),
    send:html('<path class="icon-surface" d="m20.5 3.5-6.25 17-3.5-7.25-7.25-3.5 17-6.25Z"/><path d="m10.75 13.25 9.75-9.75"/>'),
    settings:html('<path d="M4 6h3m4 0h9M4 12h9m4 0h3M4 18h3m4 0h9"/><circle class="icon-slider-a icon-surface" cx="9" cy="6" r="2"/><circle class="icon-slider-b icon-surface" cx="15" cy="12" r="2"/><circle class="icon-slider-c icon-surface" cx="9" cy="18" r="2"/>'),
    bell:html('<path class="icon-bell-body icon-surface" d="M17.5 9a5.5 5.5 0 0 0-11 0c0 4-1 5.5-2 7a.75.75 0 0 0 .6 1.25h13.8a.75.75 0 0 0 .6-1.25c-1-1.5-2-3-2-7Z"/><path class="icon-bell-clapper" d="M10 20a2.25 2.25 0 0 0 4 0"/>'),
    dashboard:html('<rect class="icon-surface" x="3.5" y="3.5" width="7" height="9.5" rx="2.25"/><rect class="icon-surface" x="13.5" y="3.5" width="7" height="5.5" rx="2.25"/><rect class="icon-surface" x="3.5" y="16" width="7" height="4.5" rx="2"/><rect class="icon-surface" x="13.5" y="12" width="7" height="8.5" rx="2.25"/>'),
    return:html('<path pathLength="1" d="m9 4-5 5 5 5M4 9h10a6 6 0 0 1 0 12h-3"/>'),
    box:html('<path class="icon-surface" d="m12 3.5 8.5 4.75v8.25a2 2 0 0 1-1 1.75l-6.5 3.5a2 2 0 0 1-2 0l-6.5-3.5a2 2 0 0 1-1-1.75V8.25L12 3.5Z"/><path class="icon-box-left icon-facet" d="m12 3.5-8.5 4.75L12 13V3.5Z"/><path class="icon-box-right icon-facet" d="m12 3.5 8.5 4.75L12 13V3.5Z"/><path class="icon-box-seam" pathLength="1" d="m3.5 8.25 8.5 4.75 8.5-4.75M12 13v8.75"/>'),
    upload:html('<path class="icon-transfer-arrow" d="M12 16V3m-5 5 5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>'),
    download:html('<path class="icon-transfer-arrow" d="M12 3v13m-5-5 5 5 5-5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>'),
    lock:html('<rect class="icon-surface" x="5.5" y="10" width="13" height="10.5" rx="3"/><path class="icon-lock-shackle" d="M8.25 10V7.25a3.75 3.75 0 0 1 7.5 0V10"/><circle cx="12" cy="14.25" r="1"/><path d="M12 15.25v2"/>'),
    unlock:html('<rect class="icon-surface" x="5.5" y="10" width="13" height="10.5" rx="3"/><path class="icon-lock-shackle" d="M8.25 10V7.25a3.75 3.75 0 0 1 6.5-2.55"/><circle cx="12" cy="14.25" r="1"/><path d="M12 15.25v2"/>'),
    chevron:html('<path d="m9 6 6 6-6 6"/>'),
    chevronDown:html('<path d="m6 9 6 6 6-6"/>'),
    plus:html('<path class="icon-plus-vertical" d="M12 5v14"/><path class="icon-plus-horizontal" d="M5 12h14"/>'),
    search:html('<circle class="icon-surface" pathLength="1" cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>'),
    check:html('<path pathLength="1" d="m5.5 12 4.25 4.25L18.5 7"/>'),
    clock:html('<circle class="icon-surface" cx="12" cy="12" r="8.5"/><path class="icon-clock-minute" d="M12 7v5"/><path class="icon-clock-hour" d="M12 12l3.2 2"/>'),
    close:html('<path d="m5.5 5.5 13 13m0-13-13 13"/>'),
    filter:html('<path class="icon-surface" d="M5 5.5h14a.75.75 0 0 1 .58 1.23L14 13.4v5l-4 2v-7.6L4.42 6.73A.75.75 0 0 1 5 5.5Z"/>'),
    edit:html('<path class="icon-surface" d="m14.75 5.25 4 4M4.25 19.75l4.25-1 11.25-11.5a2.65 2.65 0 0 0-3.75-3.75L4.25 15.25v4.5Z"/>'),
    trash:html('<path class="icon-surface" d="m6.75 7.5.75 11a2 2 0 0 0 2 2h5a2 2 0 0 0 2-2l.75-11"/><path d="M10 10.5v6.75m4-6.75V17.25"/><path class="icon-trash-lid" d="M4.5 5.75h15M9 5.75V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5v1.25"/>'),
    calendar:html('<rect class="icon-surface" x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M7.5 3v4M16.5 3v4M3.5 10.5h17"/><path class="icon-calendar-days" d="M8 14h.01M12 14h.01M16 14h.01"/><path class="icon-calendar-days" d="M8 17.5h.01M12 17.5h.01"/>'),
    arrow:html('<path d="M4 12h16m-6-6 6 6-6 6"/>'),
    arrowLeft:html('<path d="M20 12H4m6-6-6 6 6 6"/>'),
    info:html('<circle class="icon-surface" cx="12" cy="12" r="8.5"/><path pathLength="1" d="M12 11v6M12 7h.01"/>'),
    file:html('<path class="icon-surface icon-file-sheet" d="M13.5 3.5H7.25A2.75 2.75 0 0 0 4.5 6.25v11.5a2.75 2.75 0 0 0 2.75 2.75h9.5a2.75 2.75 0 0 0 2.75-2.75V9.5l-6-6Z"/><path d="M13.5 3.5V8A1.5 1.5 0 0 0 15 9.5h4.5M8.5 13h7m-7 3.5H14"/>'),
    refresh:html('<path d="M19.25 8a7.5 7.5 0 0 0-13-2L4.5 8M4.5 4.5V8H8"/><path d="M4.75 16a7.5 7.5 0 0 0 13 2l1.75-2m0 3.5V16H16"/>'),
    paperclip:html('<path pathLength="1" d="m8.5 12.5 6-6a2.8 2.8 0 0 1 4 4l-8 8a4.5 4.5 0 0 1-6.4-6.4l8-8a1.5 1.5 0 0 1 2.15 2.15l-7.5 7.5a1.5 1.5 0 0 0 2.1 2.1l7.5-7.5"/>'),
    more:html('<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/>')
};
export function icon(name:any){
    const key=typeof name==='string'&&Object.hasOwn(shapes,name)?name:'box';
    return html`<svg class="icon" data-symbol="${key}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${shapes[key]}</svg>`;
}
addTranslations({'Vorgangsbereiche':'Record sections','Kommentare & Kundenstatus':'Comments & customer status','Formularbereiche':'Form sections','Produktdaten':'Product details','Zuordnung & Preis':'References & price','Zugang':'Account','Sicherheit':'Security','Zugriffsrechte':'Access rights','Anbieter':'Provider','Authentifizierung & Prüfung':'Authentication & checks','Profil':'Profile','Spaltenzuordnung':'Column mapping','Gerät & Maßnahme':'Device & action','Weitere Angaben':'Additional details'});
/** Render all panels once so switching views never discards forms or their drafts. */
export function detailSections(sections:{key:string;label:string;content:unknown}[]){
    return html`<div class="detail-tabs" role="tablist" aria-label="Vorgangsbereiche">${sections.map((section,index)=>html`<button type="button" role="tab" aria-selected="${index===0}" aria-controls="detail-panel-${h(section.key)}" id="detail-tab-${h(section.key)}" tabindex="${index===0?0:-1}" data-detail-tab="${h(section.key)}">${h(t(section.label))}</button>`).join('')}</div>${sections.map((section,index)=>html`<div class="detail-tab-panel" role="tabpanel" aria-labelledby="detail-tab-${h(section.key)}" id="detail-panel-${h(section.key)}" data-detail-panel="${h(section.key)}" tabindex="0"${index?' hidden':''}>${section.content}</div>`).join('')}`;
}
export function bindDetailSections(root:HTMLElement){
    const tabs=Array.from(root.querySelectorAll<HTMLButtonElement>('[data-detail-tab]')),panels=Array.from(root.querySelectorAll<HTMLElement>('[data-detail-panel]'));
    const show=(key:string,focus=false)=>{
        const selected=tabs.find(tab=>tab.dataset.detailTab===key);if(!selected||!panels.some(panel=>panel.dataset.detailPanel===key))return false;
        for(const tab of tabs){const active=tab===selected;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;}
        for(const panel of panels)panel.hidden=panel.dataset.detailPanel!==key;
        const body=root.querySelector<HTMLElement>('.dialog-body');if(body)body.scrollTop=0;
        if(focus)selected.focus();return true;
    };
    tabs.forEach((tab,index)=>{
        tab.onclick=()=>{show(tab.dataset.detailTab);};
        tab.onkeydown=event=>{const next=event.key==='ArrowRight'?(index+1)%tabs.length:event.key==='ArrowLeft'?(index+tabs.length-1)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:-1;if(next<0)return;event.preventDefault();show(tabs[next].dataset.detailTab,true);};
    });
    if(tabs.length)show(tabs[0].dataset.detailTab);return show;
}
const formSections=new WeakMap<HTMLElement,ReturnType<typeof bindDetailSections>>();
let formSectionId=0;
/** Enhance existing groups without replacing any input or excluding hidden values. */
export function bindFormSections(form:HTMLElement,selector='.form-section'){
    if(!form?.querySelectorAll)return;
    if(formSections.has(form))return formSections.get(form);
    const sections=Array.from(form.querySelectorAll<HTMLElement>(selector));if(sections.length<2)return;
    const prefix='form-'+(++formSectionId),nav=document.createElement('div');
    nav.className='detail-tabs form-section-tabs';nav.dataset.formNavigation='true';nav.setAttribute('role','tablist');nav.setAttribute('aria-label',String(t('Formularbereiche')));nav.setAttribute('data-rb-i18n-aria-label',encodeURIComponent(JSON.stringify([t('Formularbereiche').de,t('Formularbereiche').en])));
    sections.forEach((section,index)=>{
        const key=prefix+'-'+index,heading=section.querySelector('legend,h2,h3'),label=(heading?.textContent??String(index+1)).trim().replace(/^\d+\s+(?=\S)/,'');
        section.dataset.detailPanel=key;section.id='detail-panel-'+key;section.classList.add('detail-tab-panel','form-section-panel');section.setAttribute('role','tabpanel');section.setAttribute('aria-labelledby','detail-tab-'+key);
        const tab=document.createElement('button');tab.type='button';tab.id='detail-tab-'+key;tab.dataset.detailTab=key;setText(tab,t(section.dataset.sectionTitle??label));tab.setAttribute('role','tab');tab.setAttribute('aria-controls',section.id);tab.setAttribute('aria-selected',String(index===0));tab.tabIndex=index===0?0:-1;nav.append(tab);
    });
    sections[0].before(nav);form.dataset.sectioned='true';
    const show=bindDetailSections(form);formSections.set(form,show);
    form.addEventListener('invalid',event=>{
        // Native validation reports every invalid field; keep the FIRST one visible.
        const field=form.querySelector<HTMLElement>('input:invalid,select:invalid,textarea:invalid')??event.target as HTMLElement;
        const panel=field?.closest<HTMLElement>('[data-detail-panel]');if(panel&&sections.includes(panel))show(panel.dataset.detailPanel);
    },true);
    return show;
}
export function focusFormControl(form:HTMLElement,control:HTMLElement,options:ScrollIntoViewOptions={block:'center',behavior:'auto'}){
    const panel=control?.closest?.<HTMLElement>('[data-detail-panel]');
    if(panel)bindFormSections(form)?.(panel.dataset.detailPanel);
    control?.scrollIntoView?.(options);control?.focus?.({preventScroll:true});
}
export function openDialog({ title, subtitle = '', body, wide = false, drawer = false }: { title: string; subtitle?: string; body: string; wide?: boolean; drawer?: boolean }) {
    const dialog = document.querySelector('#dialog');
    const reuse=dialog.open&&drawer&&String(dialog.className).split(/\s+/).includes('detail-drawer');
    if (dialog.open&&!reuse)
        dialog.close();
    dialog.className = drawer ? 'detail-drawer' : wide ? 'wide' : '';
    dialog.innerHTML = html`<div class="dialog-header"><div><h2 id="dialog-title">${h(title)}</h2>${subtitle ? html`<p>${h(subtitle)}</p>` : ''}</div><button type="button" class="icon-btn dialog-close" aria-label="Schließen">${icon('close')}</button></div>${body}`;
    const close=async()=>{if(await canLeaveForms(dialog))dialog.close();};
    dialog.oncancel=event=>{event.preventDefault();void close();};
    dialog.querySelector('.dialog-close').onclick = close;
    dialog.querySelectorAll('[data-close]').forEach(btn => btn.onclick = close);
    dialog.onclick = (event: any) => { if (event.target === dialog) {
        const rect = dialog.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)
            close();
    } };
    bindFormSections(dialog.querySelector('form'));
    if(!dialog.open)dialog.showModal();
    else if(reuse)dialog.querySelector('.dialog-close').focus?.();
    return dialog;
}
// A completed write only covers the input present when submission started.
export function trackFormSave(form) {
    bindFormSections(form,'.form-section,.settings-section,section.settings-panel');
    observeForm(form);
    let revision = 0;
    const changed = () => { revision++; refreshFormState(form); };
    form.addEventListener('input', changed);
    form.addEventListener('change', changed);
    return () => {
        const submitted = revision;
        const state = readFormState(form);
        return () => {
            acceptFormState(form, state);
            if (submitted !== revision) return false;
            return true;
        };
    };
}
