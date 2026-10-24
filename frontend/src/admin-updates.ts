import {html,locale,setText,t,apiError,addTranslations} from './i18n.js';
import {h, icon} from './forms.js';
import {renderInAppUpdater,bindInAppUpdater} from './admin-updater.js';

const releasesUrl = 'https://github.com/KaterBeratung/retourenboard/releases';
addTranslations({'Automatische Prüfung alle sechs Stunden.':'Automatic check every six hours.','Nächste automatische Prüfung:':'Next automatic check:','Der Versionscheck läuft automatisch im Hintergrund. Updates werden nach deiner Auswahl installiert.':'Version checks run automatically in the background. Updates are installed when you choose.','Der erste automatische Versionscheck läuft im Hintergrund.':'The first automatic version check is running in the background.'});
const labels = { unchecked: t('Noch nicht geprüft'), current: t('Auf dem aktuellen Stand'), updateAvailable: t('Neue Version verfügbar'), ahead: t('Lokale Version ist neuer'), unavailable: t('Prüfung nicht möglich') };
const descriptions = {
    unchecked: t('Starte die Prüfung, um deine installierte Version mit dem neuesten stabilen GitHub-Release zu vergleichen.'),
    current: t('Deine Installation entspricht dem neuesten stabilen Release auf GitHub.'),
    updateAvailable: t('Ein neueres stabiles Release steht auf GitHub zum Download bereit.'),
    ahead: t('Deine Installation ist neuer als das zuletzt veröffentlichte stabile GitHub-Release.')
};

export function renderUpdates() {
    return html`<div class="page-heading"><div><div class="eyebrow">SERVERBETRIEB</div><h1>Version &amp; Updates<span class="heading-dot">.</span></h1><p>Installierte Version prüfen und neue Releases finden.</p></div><button class="btn primary" id="updates-check" disabled>${icon('search')}Jetzt prüfen</button></div>
    <div id="updates-content" data-view-loading="settings" aria-live="polite"><section class="panel settings-card"><p class="muted">Versionsinformationen werden geladen …</p></section></div>${renderInAppUpdater()}<details class="panel settings-card updater-manual"><summary>Alternativ über das Installskript aktualisieren</summary><p>Lade das Installskript des gewünschten GitHub-Releases herunter und führe es auf deinem Linuxserver aus. Das Skript führt dich durch die Aktualisierung.</p><p class="muted">Der Versionscheck läuft automatisch im Hintergrund. Updates werden nach deiner Auswahl installiert.</p></details>`;
}

export async function bindUpdates(ctx, root) {
    const target = root.querySelector('#updates-content'), button = root.querySelector('#updates-check');
    if (!target || !button) return;
    const updater=bindInAppUpdater(ctx,root);
    let busy = false, retryAt = 0, wakeup;
    const connected = () => target.isConnected && root.querySelector('#updates-content') === target && ctx.isAdmin;
    const date = value => value ? new Date(value).toLocaleString(locale()) : '—';
    function updateButton() {
        if (!connected()) return;
        button.disabled = busy || Date.now() < retryAt;
        button.innerHTML = html`${icon('search')}${busy ? t('Wird geprüft …') : t('Jetzt prüfen')}`;
        target.setAttribute('aria-busy', String(busy));
    }
    function render(data) {
        if (!connected()) return;
        updater.setRelease(data);
        retryAt = data.retryAt ? Date.parse(data.retryAt) : 0;
        clearTimeout(wakeup);
        const status = labels[data.status] ? data.status : 'unavailable';
        target.innerHTML = html`<section class="panel settings-card version-check-card">
        <div class="settings-notice${status === 'unavailable' ? ' pending' : ''}">${icon(status === 'current' ? 'check' : 'info')}<div><strong>${h(labels[status])}</strong><p>${h(status === 'unavailable' ? data.message || t('Die Version konnte nicht geprüft werden.') : status==='unchecked'&&data.automatic?t('Der erste automatische Versionscheck läuft im Hintergrund.'):descriptions[status])}</p></div></div>
        <dl class="detail-grid"><div><dt>Installierte Version</dt><dd>${h(data.installedVersion)}</dd></div><div><dt>Neuestes GitHub-Release</dt><dd>${h(data.latestVersion || '—')}</dd></div><div><dt>Letzte Prüfung</dt><dd>${h(date(data.checkedAt))}</dd></div><div><dt>Release veröffentlicht</dt><dd>${h(date(data.publishedAt))}</dd></div></dl>
        <div class="session-actions"><a class="btn secondary" href="${releasesUrl}" target="_blank" rel="noopener noreferrer">${icon('arrow')}GitHub-Releases öffnen</a></div>
        <p class="muted version-check-source">Quelle: KaterBeratung/retourenboard · stabile GitHub-Releases</p>
        ${data.automatic?html`<p class="muted version-check-source">Automatische Prüfung alle sechs Stunden.${data.nextCheckAt?html`<br>Nächste automatische Prüfung: ${h(date(data.nextCheckAt))}`:''}</p>`:''}
        <p class="muted version-check-retry" id="updates-retry">${retryAt > Date.now() ? t`Erneut prüfen ab ${h(new Date(retryAt).toLocaleTimeString(locale()))}.` : ''}</p>
        </section>`;
        updateButton();
        if (retryAt > Date.now()) wakeup = setTimeout(() => {
            updateButton();
            if (connected()) setText(target.querySelector('#updates-retry'),'');
        }, retryAt - Date.now() + 100);
    }
    async function load(manual) {
        if (busy || manual && Date.now() < retryAt) return;
        busy = true; updateButton();
        try {
            const data = await ctx.api('/api/admin/version-check', manual ? { method: 'POST', body: {} } : undefined);
            render(data);
        } catch (error) {
            if (connected()) {
                const previous = target.querySelector('#updates-request-error');
                previous?.remove();
                const message = document.createElement('p');
                message.id = 'updates-request-error'; message.className = 'form-error'; message.setAttribute('role', 'alert'); setText(message,apiError(error.message));
                target.prepend(message);
            }
        } finally { busy = false; updateButton(); }
    }
    button.onclick = () => load(true);
    await load(false);
    function poll(){const timer=setTimeout(async()=>{if(!connected())return;if(document.visibilityState!=='hidden')await load(false);if(connected())poll();},30000);(timer as any).unref?.();}
    if(connected())poll();
}
