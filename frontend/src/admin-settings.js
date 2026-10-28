import {html,locale,setText,t,apiError} from './i18n.js';
import { h, icon, trackFormSave } from './forms.js';
import {renderServerOperations,bindServerOperations} from './server-operations.js';
import {currencyNotice} from './inventory-display.js';
function currencyRate(currency) {
    return currency?.rate ? currencyNotice({...currency,display:'USD'}) : html`<p class="muted currency-explanation">Beim Wechsel auf USD wird der aktuelle EUR/USD-Referenzkurs abgerufen. Ohne verfügbaren Kurs bleibt die Anzeige in EUR.</p>`;
}
export function refreshCurrencyRate(root,currency){
    const target=root.querySelector('#currency-rate');if(!target||!currency)return;
    const markup=currencyRate(currency);if(target.innerHTML!==markup)target.innerHTML=markup;
}
export function renderSettings() {
    return html`<div class="page-heading"><div><div class="eyebrow">ADMINISTRATION</div><h1>Servereinstellungen<span class="heading-dot">.</span></h1><p>Verbindung, Dateianhänge und Anmeldung verwalten.</p></div><a class="btn secondary" href="/">${icon('arrow')}Zum Arbeitsbereich</a></div><div id="settings-content"><div class="panel loading"><span class="spinner"></span>Einstellungen werden geladen …</div></div>`;
}
function settingsForm(data) {
    const { settings: s, activeNetwork: a, server } = data;
    const https = s.publicOrigin ? s.publicOrigin.startsWith('https://') : a.secureCookies;
    const domain = s.publicOrigin.replace(/^https?:\/\//, '');
    return html`<div class="server-summary">
    <article class="panel"><span>Aktiver interner Port</span><strong>${a.port}</strong><small>Bind-Adresse: ${h(server.host)}</small></article>
    <article class="panel"><span>Aktive öffentliche Adresse</span><strong class="server-origin">${h(a.publicOrigin || t('Automatisch'))}</strong><small>${a.secureCookies ? t('HTTPS · sichere Sitzungscookies') : t('HTTP · ohne Transportverschlüsselung')}</small></article>
    <article class="panel"><span>Server</span><strong>Version ${h(server.version)}</strong><small>Node.js ${h(server.nodeVersion)} · ${server.production ? t('Produktion') : t('Standardbetrieb')}</small></article>
  </div>
  <div class="settings-notice ${data.restartRequired ? 'pending' : ''}" role="status">${icon(data.restartRequired ? 'clock' : 'check')}<div><strong>${data.restartRequired ? t('Netzwerkänderungen warten auf einen Neustart') : t('Netzwerkeinstellungen sind aktiv')}</strong><p>${data.restartRequired ? html`Gespeichert: Port ${s.port} · ${h(s.publicOrigin || t('automatische Adresse'))}. Die aktive Verbindung bleibt bis zum Neustart erhalten.` : t('Änderungen an Domain, HTTPS und Port werden beim nächsten Serverstart übernommen.')}</p></div></div>
  <form id="server-settings-form" data-dirty="false">
    <section class="panel settings-panel currency-settings" data-section-title="Währung & Umrechnung"><div class="panel-heading"><div><h2>Währung & Umrechnung</h2><p>Standardwährung für Personen ohne eigene Auswahl im Kopfbereich.</p></div><span class="settings-tag">Ohne Neustart</span></div>
      <div class="settings-fields form-grid">
        <label class="field"><span>Standard-Anzeigewährung</span><select name="displayCurrency"><option value="EUR"${s.displayCurrency!=='USD'?' selected':''}>Euro (EUR)</option><option value="USD"${s.displayCurrency==='USD'?' selected':''}>US-Dollar (USD)</option></select><small>Die Sprache und die Währung lassen sich unabhängig voneinander wählen.</small></label>
        <div class="field currency-explanation"><span>Gespeicherte Basis: EUR</span><p>Produktpreise bleiben unverändert in EUR gespeichert. Die USD-Anzeige rechnet Beträge automatisch zum Referenzkurs um.</p><small>Preiseingabe und CSV-Import/-Export verwenden immer EUR.</small></div>
      </div><div class="currency-rate-row"><div id="currency-rate">${currencyRate(data.currency)}</div><button class="btn secondary small" type="button" id="currency-refresh">${icon('refresh')}Kurs aktualisieren</button></div><p id="currency-error" class="form-error currency-error" role="alert" hidden></p>
    </section>
    <section class="panel settings-panel" data-section-title="Verbindung & HTTPS"><div class="panel-heading"><div><h2>Verbindung & HTTPS</h2><p>Die Adresse, unter der du retourenboard. im Browser aufrufst.</p></div><span class="settings-tag">Neustart erforderlich</span></div>
      <div class="settings-fields form-grid">
        <label class="field full"><span>Domain / öffentliche Adresse</span><input name="domain" value="${h(domain)}" maxlength="300" placeholder="retouren.example.de"><small>Ohne http:// oder https://, ohne Pfad. Optional mit externem Port, z. B. retouren.example.de:8443. Leer lassen für die aktuelle Browseradresse.</small></label>
        <label class="field"><span>Verbindung</span><select name="protocol"><option value="http"${!https ? ' selected' : ''}>HTTP</option><option value="https"${https ? ' selected' : ''}>HTTPS über Reverse Proxy</option></select><small>HTTPS benötigt eine Domain/IP und ein gültiges Zertifikat am Reverse Proxy.</small></label>
        <label class="field"><span>Interner Serverport</span><input name="port" type="number" min="1024" max="65535" step="1" required value="${s.port}"><small>1024–65535. Bei Portwechsel den Proxy oder die Container-Portfreigabe anpassen.</small></label>
      </div>
      <div class="settings-guide"><strong>HTTPS einrichten</strong><p>DNS, Zertifikat und HTTPS werden auf dem Linuxserver mit Nginx oder einem anderen Reverse Proxy eingerichtet. HTTPS hier aktiviert sichere Cookies und die Prüfung deiner öffentlichen Adresse. Der interne Node.js-Server verwendet weiterhin HTTP.</p><p>Der Proxy muss an den gespeicherten internen Port <b>${s.port}</b> weiterleiten und die ursprüngliche Domain sowie das Protokoll übermitteln. Die öffentliche Adresse muss exakt der Browseradresse entsprechen, einschließlich eines abweichenden externen Ports.</p><p><strong>Zusätzlicher lokaler Zugriff:</strong> Auch bei aktiviertem HTTPS kannst du dich direkt über <code>http://CONTAINER-IP:${s.port}</code> im LAN anmelden. Dafür muss <code>HOST=0.0.0.0</code> in <code>/etc/retourenboard.env</code> stehen und der Port im LAN erreichbar sein. Danach den Dienst neu starten. Der lokale HTTP-Zugang verwendet eine getrennte Sitzung und ist unverschlüsselt; die Domain verwendet weiterhin sichere HTTPS-Cookies.</p><p>Hier gespeicherte Domain- und Porteinstellungen haben Vorrang vor der <code>.env</code>-Datei.</p></div>
    </section>
    <section class="panel settings-panel" data-section-title="Dateianhänge & Anmeldung"><div class="panel-heading"><div><h2>Dateianhänge & Anmeldung</h2><p>Uploadgrenzen gelten sofort. Die Sitzungsdauer gilt für neue Anmeldungen.</p></div><span class="settings-tag">Ohne Neustart</span></div>
      <div class="settings-fields form-grid">
        <label class="field"><span>Maximale Dateigröße (MB)</span><input name="uploadMaxMb" type="number" min="1" max="50" step="1" required value="${s.uploadMaxMb}"><small>1–50 MB je Datei. Bestehende Anhänge bleiben erhalten. Auch die Uploadgrenze des Reverse Proxys anpassen, z. B. Nginx: client_max_body_size 50m. Die kleinere Grenze gilt.</small></label>
        <label class="field"><span>Dateien pro Retoure</span><input name="maxFilesPerReturn" type="number" min="1" max="30" step="1" required value="${s.maxFilesPerReturn}"><small>1–30 Dateien. PDF, PNG, JPG/JPEG und WebP.</small></label>
        <label class="field"><span>Sitzungsdauer (Stunden)</span><input name="sessionHours" type="number" min="1" max="24" step="1" required value="${s.sessionHours}"><small>1–24 Stunden. Bereits angemeldete Personen behalten ihre bisherige Ablaufzeit.</small></label>
      </div>
    </section>
    <div class="settings-save"><p class="form-error" role="alert" hidden></p><span class="muted" data-unsaved>Alle Änderungen gespeichert.</span><button class="btn primary" type="submit">${icon('check')}Einstellungen speichern</button></div>
  </form>
  ${renderServerOperations()}
  <section class="panel settings-panel"><div class="panel-heading"><div><h2>Neustart über die Konsole</h2><p>Falls der Adminbereich nicht erreichbar ist, auf Debian / LXC ausführen:</p></div></div><div class="settings-guide"><pre><code>sudo systemctl restart retourenboard</code></pre><p>Ein Neustart beendet die aktuellen Sitzungen. Danach unter der neuen Adresse bzw. dem neuen Port erneut anmelden. Bei HTTPS zuerst den Reverse Proxy und sein Zertifikat bereitstellen.</p><details><summary>Bei einer falschen Netzwerkkonfiguration</summary><p>Auf die Werte aus <code>/etc/retourenboard.env</code> zurücksetzen. Konten, Produkte, Retouren und Upload-Limits bleiben erhalten.</p><pre><code>sudo systemctl stop retourenboard
sudo /opt/retourenboard/node/bin/node --env-file=/etc/retourenboard.env /opt/retourenboard/current/dist/server/reset-settings.js --service-stopped --confirm
sudo systemctl start retourenboard</code></pre></details></div></section>`;
}
export async function bindSettings(ctx, root) {
    const target = root.querySelector('#settings-content');
    if (!target || !ctx.isAdmin)
        return;
    try {
        const data = await ctx.api('/api/admin/settings');
        if (!target.isConnected || !ctx.isAdmin)
            return;
        target.innerHTML = settingsForm(data);
        bindServerOperations(ctx,target);
        const form = target.querySelector('#server-settings-form');
        const startSave = trackFormSave(form);
        const currencyRefresh=target.querySelector('#currency-refresh');
        currencyRefresh.onclick=async()=>{
            const error=target.querySelector('#currency-error');error.hidden=true;currencyRefresh.disabled=true;
            try{
                const currency=await ctx.api('/api/admin/currency/refresh',{method:'POST',body:{}});
                if(!target.isConnected||!ctx.isAdmin)return;
                ctx.currencyUI?.apply(currency);
                refreshCurrencyRate(target,currency);
                ctx.toast(currency.stale?t('Gespeicherter Kurs wird verwendet.'):t('Wechselkurs aktualisiert.'));
            }catch(err){if(target.isConnected){setText(error,apiError(err.message));error.hidden=false;}}
            finally{currencyRefresh.disabled=false;}
        };
        form.onsubmit = async (event) => {
            event.preventDefault();
            const button = form.querySelector('[type=submit]'), error = form.querySelector('.settings-save .form-error');
            const values = new FormData(form), domain = String(values.get('domain') || '').trim(), protocol = values.get('protocol');
            error.hidden = true;
            if (!domain && protocol === 'https') {
                setText(error,t('Für HTTPS bitte eine öffentliche Domain oder IP-Adresse eingeben.'));
                error.hidden = false;
                return;
            }
            const body = { displayCurrency:values.get('displayCurrency'), publicOrigin: domain ? `${protocol}://${domain}` : '', port: Number(values.get('port')), uploadMaxMb: Number(values.get('uploadMaxMb')), maxFilesPerReturn: Number(values.get('maxFilesPerReturn')), sessionHours: Number(values.get('sessionHours')) };
            const committed = startSave();
            button.disabled = true;
            try {
                const saved = await ctx.api('/api/admin/settings', { method: 'PUT', body });
                if (!form.isConnected || !ctx.isAdmin)
                    return;
                if (!committed()) { ctx.toast(t('Gespeichert. Dein neuer Entwurf bleibt erhalten.')); return; }
                await ctx.reload({quiet:true});
                await bindSettings(ctx, root);
                ctx.toast(saved.restartRequired ? t('Gespeichert. Netzwerkänderungen gelten nach dem Serverneustart.') : t('Einstellungen gespeichert.'));
            }
            catch (err) {
                if (form.isConnected) {
                    setText(error,apiError(err.message));
                    error.hidden = false;
                }
            }
            finally {
                button.disabled = false;
            }
        };
    }
    catch (err) {
        if (target.isConnected && ctx.isAdmin)
            target.innerHTML = html`<p class="form-error" role="alert">${h(err.message)}</p>`;
    }
}
