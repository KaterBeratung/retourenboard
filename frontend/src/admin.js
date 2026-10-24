import {html,locale,setText,t,apiError} from './i18n.js';
import {renderSso,bindSso} from './admin-sso.js';
import {masterLabel} from './inventory-display.js';
import {switchField} from './switches.js';
import { MASTER_KINDS } from '../shared/model.js';
import { h, icon, openDialog, trackFormSave } from './forms.js';
import { renderUsers, bindUsers } from './accounts.js';
import { renderSettings, bindSettings } from './admin-settings.js';
import {renderRules,bindRules} from './admin-rules.js';
import {renderCsvProfiles,bindCsvProfiles} from './admin-csv-profiles.js';
import {renderAudit,bindAudit} from './admin-audit.js';
import {renderBackups,bindBackups} from './admin-backups.js';
import {renderDiagnostics,bindDiagnostics} from './admin-diagnostics.js';
import {renderUpdates,bindUpdates} from './admin-updates.js';
import {renderNotificationsSettings,bindNotificationsSettings} from './admin-notifications.js';
import {renderDataTools,bindDataTools} from './navigation-tools.js';
import {openImport,openExport} from './import.js';
let kind = 'suppliers';
const requiredLists = ['reasons', 'conditions', 'statuses', 'resolutions'];
const masterIcons = { suppliers: 'box', manufacturers: 'settings', categories: 'dashboard', reasons: 'info', conditions: 'eye', statuses: 'refresh', resolutions: 'check' };
export function adminSection(ctx){const [page,query='']=location.hash.slice(1).split('?');const requested=page==='admin'?new URLSearchParams(query).get('section'):page;return requested||['masterdata','rules','csv-profiles','audit','diagnostics','data-tools'].find(section=>ctx.canAdminSection(section))||'masterdata';}
export function renderAdmin(ctx) {
    const section=adminSection(ctx);
    if(!ctx.canAdminSection(section))return html('<div class="admin-locked"><h1>Keine Berechtigung für diesen Bereich</h1><p>Dein Administrator kann einzelne Verwaltungsaufgaben für dein Konto freigeben.</p><a class="btn secondary" href="/">Zum Arbeitsbereich</a></div>');
    if(section==='data-tools')return renderDataTools(ctx);
    if(section==='sso')return renderSso();
    if(section==='notifications')return renderNotificationsSettings();
    if(section==='backups')return renderBackups();
    if(section==='diagnostics')return renderDiagnostics();
    if(section==='updates')return renderUpdates();
    if(section==='audit')return renderAudit();
    if(section==='rules')return renderRules();
    if(section==='csv-profiles')return renderCsvProfiles();
    if (section === 'settings')
        return renderSettings();
    if (section === 'users')
        kind = 'users';
    else if (kind === 'users')
        kind = 'suppliers';
    const entries = kind === 'users' ? [] : ctx.masterdata[kind] ?? [];
    const header = html`<div class="page-heading"><div><div class="eyebrow">VERWALTUNG</div><h1>Stammdaten<span class="heading-dot">.</span></h1><p>Feste Werte für Produkte und Retouren verwalten.</p></div><div class="heading-actions"><a class="btn secondary" href="/#products">${icon('box')}Produkte</a><a class="btn secondary" href="/#returns">${icon('return')}Retouren</a></div></div>
    <label class="field master-kind-picker"><span>Bereich</span><select data-master-picker aria-label="Verwaltungsbereich auswählen">${Object.entries(MASTER_KINDS).map(([key,label])=>html`<option value="${key}"${kind===key?' selected':''}>${h(t(label))} · ${(ctx.masterdata[key]??[]).filter(item=>item.active).length}</option>`).join('')}</select></label>
    <div class="admin-tabs" role="group" aria-label="Verwaltungsbereich auswählen">${Object.entries(MASTER_KINDS).map(([key, label]) => html`<button type="button" data-master-kind="${key}" class="${kind === key ? 'selected' : ''}" aria-pressed="${kind === key}"><span class="master-kind-icon" aria-hidden="true">${icon(masterIcons[key])}</span><span class="master-kind-label">${t(label)}</span><span class="master-kind-count">${(ctx.masterdata[key] ?? []).filter(x => x.active).length}</span></button>`).join('')}</div>`;
    if (kind === 'users')
        return html`<div class="page-heading"><div><div class="eyebrow">ADMINISTRATION</div><h1>Benutzerkonten<span class="heading-dot">.</span></h1><p>Persönliche Zugänge und Berechtigungen verwalten.</p></div><a class="btn secondary" href="/">Zum Arbeitsbereich</a></div>` + renderUsers();
    return html`${header}
    <section class="panel"><div class="panel-heading"><div><h2>${t(MASTER_KINDS[kind])}</h2><p>Verwendete Werte bleiben beim Entfernen als archivierte Einträge erhalten.</p></div><button class="btn primary" id="master-create">${icon('plus')}Eintrag anlegen</button></div>
    ${entries.length ? html`<div class="table-scroll"><table class="masterdata-table"><thead><tr><th>Name</th>${kind === 'suppliers' ? html('<th>Lieferantencode</th>') : ''}<th>Status</th>${requiredLists.includes(kind) ? html('<th>Standard</th>') : ''}${kind === 'statuses' ? html('<th>Abschluss</th>') : ''}<th>Notizen</th><th>Aktionen</th></tr></thead><tbody>${entries.map(item => html`<tr><td><strong>${h(masterLabel(item))}</strong></td>${kind === 'suppliers' ? html`<td${item.code?.trim()?'':' data-mobile-empty'}>${h(item.code || '—')}</td>` : ''}<td><span class="status ${item.active ? 'done' : 'archived'}"><span></span>${item.active ? t('Aktiv') : t('Archiviert')}</span></td>${requiredLists.includes(kind) ? html`<td${item.isDefault?'':' data-mobile-empty'}>${item.isDefault ? t('Ja') : '—'}</td>` : ''}${kind === 'statuses' ? html`<td>${item.isClosed ? t('Ja') : t('Nein')}</td>` : ''}<td class="master-notes"${item.notes?.trim()?'':' data-mobile-empty'}>${h(item.notes || '—')}</td><td><div class="row-actions"><button class="icon-btn" data-master-edit="${item.id}" aria-label="${h(masterLabel(item))} bearbeiten">${icon('edit')}</button><button class="icon-btn" data-master-delete="${item.id}" aria-label="${h(masterLabel(item))} entfernen">${icon('trash')}</button></div></td></tr>`).join('')}</tbody></table></div>` : html`<div class="empty-state"><span class="empty-icon">${icon('box')}</span><h3>Noch keine ${t(MASTER_KINDS[kind])} angelegt</h3><p>Lege hier die Werte an, die später zur Auswahl stehen.</p></div>`}</section>
    <p class="muted admin-help">Ein aktiver Standard füllt neue Retouren vor. Archivierte Werte bleiben in bestehenden Vorgängen sichtbar.</p>`;
}
export function bindAdmin(ctx, root) {
    const section=adminSection(ctx);if(!ctx.canAdminSection(section))return;
    if(section==='data-tools')return bindDataTools(ctx,root,{import:()=>openImport(ctx),export:()=>openExport(ctx)});
    if(section==='sso')return bindSso(ctx,root);
    if(section==='notifications')return bindNotificationsSettings(ctx,root);
    if(section==='backups')return bindBackups(ctx,root);
    if(section==='diagnostics')return bindDiagnostics(ctx,root);
    if(section==='updates')return bindUpdates(ctx,root);
    if(section==='audit')return bindAudit(ctx,root);
    if(section==='rules')return bindRules(ctx,root);
    if(section==='csv-profiles')return bindCsvProfiles(ctx,root);
    if (section === 'settings') {
        return bindSettings(ctx, root);
    }
    root.querySelector('#admin-unlock')?.addEventListener('click', () => ctx.ensureUnlocked(() => ctx.reload()));
    const chooseKind=(value,mobile=false)=>{if(!Object.hasOwn(MASTER_KINDS,value))return;kind=value;root.innerHTML=renderAdmin(ctx);bindAdmin(ctx,root);root.querySelector(mobile?'[data-master-picker]':`[data-master-kind="${kind}"]`)?.focus({preventScroll:true});};
    root.querySelectorAll('[data-master-kind]').forEach(el => el.onclick = () => chooseKind(el.dataset.masterKind));
    const picker=root.querySelector('[data-master-picker]');if(picker)picker.onchange=()=>chooseKind(picker.value,true);
    if (kind === 'users' && ctx.isAdmin) {
        return bindUsers(ctx, root);
    }
    root.querySelector('#master-create')?.addEventListener('click', () => ctx.ensureUnlocked(() => masterForm(ctx)));
    root.querySelectorAll('[data-master-edit]').forEach(el => el.onclick = () => ctx.ensureUnlocked(() => masterForm(ctx, ctx.masterdata[kind].find(x => x.id === Number(el.dataset.masterEdit)))));
    root.querySelectorAll('[data-master-delete]').forEach(el => el.onclick = () => ctx.ensureUnlocked(() => removeMaster(ctx, ctx.masterdata[kind].find(x => x.id === Number(el.dataset.masterDelete)))));
}
function masterForm(ctx, item = {}) {
    const list = kind;
    let savedId = item.id;
    const dialog = openDialog({ title: item.id ? t('Eintrag bearbeiten') : t('Eintrag anlegen'), subtitle: t(MASTER_KINDS[list]), body: html`<form><div class="dialog-body"><div class="form-grid"><label class="field full"><span>Name <b>*</b></span><input name="name" value="${h(item.name)}" required maxlength="250" placeholder="Name des Eintrags">${item.builtinKey?html`<small>Der Standardname wird automatisch übersetzt. Eine Umbenennung wird als eigene Bezeichnung gespeichert.</small>`:''}</label>${list === 'suppliers' ? html`<label class="field full"><span>Lieferantencode</span><input name="code" value="${h(item.code)}" maxlength="100" placeholder="Optionaler interner Code"></label>` : ''}<label class="field full"><span>Notizen</span><textarea name="notes" rows="3" maxlength="2000">${h(item.notes)}</textarea><small>Nur mit Berechtigung zur Stammdatenverwaltung sichtbar.</small></label>${switchField("active",t("Aktiv und auswählbar"),item.active!==false,{full:true})}${requiredLists.includes(list) ? `${switchField("isDefault",t("Standard für neue Retouren"),item.isDefault,{full:true})}` : ''}${list === 'statuses' ? html`${switchField("isClosed",t("Retouren mit diesem Status sind abgeschlossen"),item.isClosed,{full:true})}<label class="field full"><span>Darstellung</span><select name="tone">${[['received', t('Orange · Eingang')], ['checking', t('Blau · Prüfung')], ['working', t('Orange · Bearbeitung')], ['done', t('Grün · Abschluss')], ['neutral', t('Grau · Neutral')]].map(([value, label]) => html`<option value="${value}"${(item.tone ?? 'received') === value ? ' selected' : ''}>${label}</option>`).join('')}</select></label>` : ''}</div><p class="form-error" role="alert" hidden></p></div><div class="dialog-footer"><button class="btn secondary" type="button" data-close>Abbrechen</button><button class="btn primary" type="submit">${icon('check')}Speichern</button></div></form>` });
    const form = dialog.querySelector('form');
    const startSave = trackFormSave(form);
    form.onsubmit = async (event) => {
        event.preventDefault();
        const button = form.querySelector('[type=submit]'), error = form.querySelector('.form-error');
        button.disabled = true;
        error.hidden = true;
        const committed = startSave();
        try {
            const body = Object.fromEntries(new FormData(form));
            for (const key of ['active', 'isDefault', 'isClosed'])
                body[key] = form.elements.namedItem(key)?.checked ?? false;
            const saved = await ctx.api(`/api/masterdata/${savedId ?? list}`, { method: savedId ? 'PUT' : 'POST', body });
            savedId = saved?.id ?? savedId;
            if (!committed() || dialog.querySelector('form') !== form) return;
            dialog.close();
            await ctx.reload();
            ctx.toast(t('Stammdaten gespeichert.'));
        }
        catch (err) {
            setText(error,apiError(err.message));
            error.hidden = false;
        }
        finally {
            button.disabled = false;
        }
    };
}
function removeMaster(ctx, item) {
    if (!item)
        return;
    const dialog = openDialog({ title: t('Eintrag entfernen?'), subtitle: t('Verwendete Einträge werden archiviert. Unbenutzte Einträge werden gelöscht.'), body: html`<div class="dialog-body"><p><strong>${h(masterLabel(item))}</strong></p><p class="muted">Bestehende Produkt- und Retourenzuordnungen bleiben erhalten.</p><p class="form-error" role="alert" hidden></p></div><div class="dialog-footer"><button class="btn secondary" data-close>Abbrechen</button><button class="btn danger" id="master-confirm">${icon('trash')}Entfernen</button></div>` });
    dialog.querySelector('#master-confirm').onclick = async (event) => { const button = event.currentTarget; button.disabled = true; try {
        const result = await ctx.api(`/api/masterdata/${item.id}`, { method: 'DELETE' });
        dialog.close();
        await ctx.reload();
        ctx.toast(result.archived ? t('Eintrag archiviert.') : t('Eintrag gelöscht.'));
    }
    catch (err) {
        const error = dialog.querySelector('.form-error');
        setText(error,apiError(err.message));
        error.hidden = false;
        button.disabled = false;
    } };
}
