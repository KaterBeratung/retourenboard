import {escapedText,html} from './i18n.js';
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
    copy:html('<rect class="icon-copy-front icon-solid" x="8" y="8" width="11.5" height="12.5" rx="3"/><path class="icon-copy-back" d="M15 8V6a2.5 2.5 0 0 0-2.5-2.5h-6A2.5 2.5 0 0 0 4 6v7a2.5 2.5 0 0 0 2.5 2.5H8"/>'),
    chat:html('<path class="icon-solid icon-chat-bubble" fill-rule="evenodd" d="M7.5 4.5h9A4.5 4.5 0 0 1 21 9v5a4.5 4.5 0 0 1-4.5 4.5H9L4 21V9a4.5 4.5 0 0 1 3.5-4.5ZM8 9a.75.75 0 0 0 0 1.5h8A.75.75 0 0 0 16 9H8Zm0 4a.75.75 0 0 0 0 1.5h5a.75.75 0 0 0 0-1.5H8Z"/>'),
    user:html('<circle class="icon-solid" cx="12" cy="7.5" r="3.5"/><path class="icon-solid" d="M5 20v-1a7 6 0 0 1 14 0v1a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1Z"/>'),
    users:html('<circle class="icon-solid" cx="8.5" cy="7.5" r="3"/><path class="icon-solid" d="M2.5 20v-1a6 5.5 0 0 1 12 0v1a1 1 0 0 1-1 1h-10a1 1 0 0 1-1-1Zm14-6.5a5.5 5.5 0 0 1 5 5.5v1a1 1 0 0 1-1 1h-3.6a3 3 0 0 0 .6-2v-1a8 8 0 0 0-1-4.5Z"/><path class="icon-user-head icon-solid" d="M16 4.5a3 3 0 0 1 0 6 4.8 4.8 0 0 0 0-6Z"/>'),
    globe:html('<circle class="icon-surface" cx="12" cy="12" r="8.5"/><ellipse cx="12" cy="12" rx="3.8" ry="8.5"/><path d="M3.5 12h17"/>'),
    at:html('<circle cx="12" cy="12" r="4"/><path pathLength="1" d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>'),
    send:html('<path class="icon-solid" fill-rule="evenodd" d="m20.5 3.5-17 6.2a.6.6 0 0 0 0 1.1l6.8 2.3 2.3 7a.6.6 0 0 0 1.1 0L20.5 3.5ZM10.3 12.4l7.2-6.1-6.1 7.2-1.1-1.1Z"/>'),
    settings:html('<path d="M4 6h3m4 0h9M4 12h9m4 0h3M4 18h3m4 0h9"/><circle class="icon-slider-a icon-solid" cx="9" cy="6" r="2"/><circle class="icon-slider-b icon-solid" cx="15" cy="12" r="2"/><circle class="icon-slider-c icon-solid" cx="9" cy="18" r="2"/>'),
    bell:html('<path class="icon-bell-body icon-solid" d="M17.5 8.5a5.5 5.5 0 0 0-11 0c0 4.5-1.2 6-2.5 7.5a.6.6 0 0 0 .5 1h15a.6.6 0 0 0 .5-1c-1.3-1.5-2.5-3-2.5-7.5Z"/><path class="icon-bell-clapper" d="M10 20a2 2 0 0 0 4 0"/>'),
    dashboard:html('<rect class="icon-solid" x="3.5" y="3.5" width="7" height="9.5" rx="2.5"/><rect class="icon-solid" x="13.5" y="3.5" width="7" height="5.5" rx="2.5"/><rect class="icon-solid" x="3.5" y="16" width="7" height="4.5" rx="2"/><rect class="icon-solid" x="13.5" y="12" width="7" height="8.5" rx="2.5"/>'),
    return:html('<path pathLength="1" d="m9 4-5 5 5 5M4 9h10a6 6 0 0 1 0 12h-3"/>'),
    box:html('<path class="icon-solid" d="M3.5 9.5 11 14v7.5l-6.5-3.6a2 2 0 0 1-1-1.7V9.5ZM13 14l7.5-4.5v6.7a2 2 0 0 1-1 1.7L13 21.5V14Z"/><path class="icon-box-left icon-facet" d="m12 3-8.5 5L12 13V3Z"/><path class="icon-box-right icon-facet" d="m12 3 8.5 5-8.5 5V3Z"/><path class="icon-box-seam" pathLength="1" d="m8 5.5 8 4.5"/>'),
    upload:html('<path class="icon-transfer-arrow" d="M12 16V3m-5 5 5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>'),
    download:html('<path class="icon-transfer-arrow" d="M12 3v13m-5-5 5 5 5-5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>'),
    lock:html('<path class="icon-solid" fill-rule="evenodd" d="M8.5 10h7a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3h-7a3 3 0 0 1-3-3v-5a3 3 0 0 1 3-3ZM12 13a1.3 1.3 0 0 0-.7 2.4V17a.7.7 0 0 0 1.4 0v-1.6A1.3 1.3 0 0 0 12 13Z"/><path class="icon-lock-shackle" d="M8 10V7a4 4 0 0 1 8 0v3"/>'),
    unlock:html('<path class="icon-solid" fill-rule="evenodd" d="M8.5 10h7a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3h-7a3 3 0 0 1-3-3v-5a3 3 0 0 1 3-3ZM12 13a1.3 1.3 0 0 0-.7 2.4V17a.7.7 0 0 0 1.4 0v-1.6A1.3 1.3 0 0 0 12 13Z"/><path class="icon-lock-shackle" d="M8 10V7a4 4 0 0 1 7-2"/>'),
    chevron:html('<path d="m9 6 6 6-6 6"/>'),
    chevronDown:html('<path d="m6 9 6 6 6-6"/>'),
    plus:html('<path class="icon-plus-vertical" d="M12 5v14"/><path class="icon-plus-horizontal" d="M5 12h14"/>'),
    search:html('<circle pathLength="1" cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>'),
    check:html('<path pathLength="1" d="m5 12 4 4L19 6"/>'),
    clock:html('<circle class="icon-surface" cx="12" cy="12" r="8.5"/><path class="icon-clock-minute" d="M12 7v5"/><path class="icon-clock-hour" d="M12 12l3.2 2"/>'),
    close:html('<path d="m6 6 12 12M18 6 6 18"/>'),
    filter:html('<path class="icon-surface" d="M4.5 5h15l-6 7v6l-3 1v-7l-6-7Z"/>'),
    edit:html('<path class="icon-surface" d="m15 5 4 4M4.5 20l4-1L20 7.5a2.8 2.8 0 0 0-4-4L4.5 15v5Z"/>'),
    trash:html('<path class="icon-solid" fill-rule="evenodd" d="m6.5 7 .8 12a2 2 0 0 0 2 2h5.4a2 2 0 0 0 2-2l.8-12h-11Zm3.7 3a.7.7 0 0 0-.7.7v6.6a.7.7 0 0 0 1.4 0v-6.6a.7.7 0 0 0-.7-.7Zm3.6 0a.7.7 0 0 0-.7.7v6.6a.7.7 0 0 0 1.4 0v-6.6a.7.7 0 0 0-.7-.7Z"/><path class="icon-trash-lid" d="M4 5.5h16M9 5.5v-1A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5v1"/>'),
    calendar:html('<rect class="icon-surface" x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M7.5 3v4M16.5 3v4M3.5 10.5h17"/><path pathLength="1" d="M8 14.5h1.5"/><path pathLength="1" d="M14.5 14.5H16"/>'),
    arrow:html('<path d="M4 12h16m-6-6 6 6-6 6"/>'),
    arrowLeft:html('<path d="M20 12H4m6-6-6 6 6 6"/>'),
    info:html('<circle class="icon-surface" cx="12" cy="12" r="8.5"/><path pathLength="1" d="M12 11v6M12 7h.01"/>'),
    file:html('<path class="icon-solid icon-file-sheet" fill-rule="evenodd" d="M13 3.5H7.5A2.5 2.5 0 0 0 5 6v12a2.5 2.5 0 0 0 2.5 2.5h9A2.5 2.5 0 0 0 19 18V9h-4a2 2 0 0 1-2-2V3.5Zm-4.5 9a.75.75 0 0 0 0 1.5h7a.75.75 0 0 0 0-1.5h-7Zm0 3.5a.75.75 0 0 0 0 1.5h5a.75.75 0 0 0 0-1.5h-5ZM14.5 3.7 18.8 8H15a.5.5 0 0 1-.5-.5V3.7Z"/>'),
    refresh:html('<path d="M19 8a7.5 7.5 0 0 0-13-2L4.5 8M4.5 4.5V8H8M5 16a7.5 7.5 0 0 0 13 2l1.5-2m0 3.5V16H16"/>'),
    paperclip:html('<path pathLength="1" d="m8 12 6-6a3.5 3.5 0 0 1 5 5l-8 8a5 5 0 0 1-7-7l9-9a2 2 0 0 1 3 3l-8 8a1 1 0 0 0 2 2l7-7"/>'),
    more:html('<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/>')
};
export function icon(name:any){
    const key=typeof name==='string'&&Object.hasOwn(shapes,name)?name:'box';
    return html`<svg class="icon" data-symbol="${key}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${shapes[key]}</svg>`;
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
    if(!dialog.open)dialog.showModal();
    else if(reuse)dialog.querySelector('.dialog-close').focus?.();
    return dialog;
}
// A completed write only covers the input present when submission started.
export function trackFormSave(form) {
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
