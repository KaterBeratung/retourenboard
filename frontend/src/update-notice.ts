import {html,t,addTranslations} from './i18n.js';
import {h,icon,updateMarkup} from './ui.js';

addTranslations({'Zu den Updates':'Go to updates'});

const REREAD_MS = 30 * 60 * 1000;

// Shown only for the cached result of the version check; nothing is requested from GitHub here.
export function updateNoticeMarkup(check: {status?: string; latestVersion?: string | null} | null | undefined) {
    if (!check || check.status !== 'updateAvailable' || !check.latestVersion) return '';
    return html`<span class="update-notice-icon">${icon('download')}</span><span><strong>${t('Neue Version verfügbar')}</strong><small>${t`Version ${h(check.latestVersion)}`} · ${t('Zu den Updates')}</small></span>`;
}

export function bindUpdateNotice(ctx: any) {
    let key = '', readAt = 0;
    const node = () => document.querySelector<HTMLAnchorElement>('#update-notice');
    function hide() {
        const element = node();
        if (element && (!element.hidden || element.innerHTML)) { element.hidden = true; element.innerHTML = ''; }
    }
    async function read(generation: number) {
        try {
            const check = await ctx.api('/api/admin/version-check');
            if (generation !== ctx.authGeneration || !ctx.unlocked || !ctx.isAdmin) return;
            const element = node(), markup = updateNoticeMarkup(check);
            if (!element) return;
            if (!markup) { hide(); return; }
            updateMarkup(element, markup);
            element.hidden = false;
        } catch {
            // The notice is a convenience; a failed read leaves the sidebar as it was.
        }
    }
    return {
        // Called whenever the session or navigation chrome refreshes; reads again after sign-in changes or 30 minutes.
        refresh() {
            const next = ctx.unlocked && ctx.isAdmin ? String(ctx.authGeneration ?? 0) : '';
            if (!next) { key = ''; hide(); return; }
            if (next === key && Date.now() - readAt < REREAD_MS) return;
            key = next; readAt = Date.now();
            void read(ctx.authGeneration);
        }
    };
}
