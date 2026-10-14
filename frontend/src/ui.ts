import {escapedText,html,locale,t} from './i18n.js';
import {canLeaveForms,observeForm,refreshFormState,readFormState,acceptFormState} from './unsaved.js';
export const h = (value) => escapedText(value, input => String(input ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])));
const shapes = {
    menu:html('<path d="M4 6h16M4 12h16M4 18h16"/>'),
    barcode: html('<path d="M4 7V4h3m10 0h3v3M4 17v3h3m10 0h3v-3M8 8v8m3-8v8m3-8v8m3-8v8"/>'),
    eye: html('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'),
    eyeOff: html('<path d="m3 3 18 18M10.6 5.1A11 11 0 0 1 12 5c6.5 0 10 7 10 7a19.8 19.8 0 0 1-3.1 4.1M6.2 6.2A20 20 0 0 0 2 12s3.5 7 10 7a12.1 12.1 0 0 0 5.8-1.8M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
    copy:html('<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>'),
    chat:html('<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7A8.4 8.4 0 0 1 4 11.5 8.5 8.5 0 0 1 8.7 3.9a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z"/>'),
    users:html('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/><circle cx="9" cy="7" r="4"/>'),
    globe:html('<circle cx="12" cy="12" r="9"/><path d="M3 12h18m-9-9a17 17 0 0 1 0 18 17 17 0 0 1 0-18"/>'),
    at:html('<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>'),
    send:html('<path d="m22 2-7 20-4-9L2 9 22 2ZM22 2 11 13"/>'),
    settings: html('<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>'),
    bell: html('<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>'),
    dashboard: html('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'),
    return: html('<path d="M9 4L4 9l5 5M4 9h10a6 6 0 010 12h-3"/>'),
    box: html('<path d="M12 3l9 5v9l-9 5-9-5V8l9-5zM3 8l9 5 9-5M12 13v9M7.5 5.5l9 5"/>'),
    upload: html('<path d="M12 16V3m-5 5l5-5 5 5M4 16v4a1 1 0 001 1h14a1 1 0 001-1v-4"/>'),
    download: html('<path d="M12 3v13m-5-5l5 5 5-5M4 17v3a1 1 0 001 1h14a1 1 0 001-1v-3"/>'),
    lock: html('<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 018 0v3M12 14v3"/>'),
    unlock: html('<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 017-2M12 14v3"/>'),
    chevron: html('<path d="M9 5l7 7-7 7"/>'), plus: html('<path d="M12 5v14M5 12h14"/>'),
    search: html('<circle cx="10.5" cy="10.5" r="6.5"/><path d="M16 16l5 5"/>'),
    check: html('<path d="M5 12l4 4L19 6"/>'), clock: html('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    close: html('<path d="M6 6l12 12M18 6L6 18"/>'), filter: html('<path d="M4 7h16M7 12h10M10 17h4"/>'),
    edit: html('<path d="M15 5l4 4M4 20l4-1L20 7a2.8 2.8 0 00-4-4L4 15v5z"/>'),
    trash: html('<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/>'),
    calendar: html('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 11h18"/>'),
    arrow: html('<path d="M4 12h16M14 6l6 6-6 6"/>'), info: html('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>'),
    file: html('<path d="M14 2H5v20h14V7l-5-5zM14 2v5h5M8 12h8M8 16h8"/>'),
    refresh: html('<path d="M20 7A9 9 0 004 8M4 3v5h5M4 17a9 9 0 0016-1M20 21v-5h-5"/>')
};
export const icon = (name) => html`<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[name] ?? shapes.box}</svg>`;
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
