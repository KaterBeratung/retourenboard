import {html,t,locale,apiError} from './i18n.js';
import {switchField} from './switches.js';
import {restoreSection,bindBackupRestore} from './backup-restore.js';
import {h} from './forms.js';
import {wireForm} from './account.js';
export function renderBackups(){return html('<div class="page-heading"><div><h1>Sicherungen<span class="heading-dot">.</span></h1><p>Datenbank und Dateianhänge gemeinsam sichern.</p></div><button class="btn primary" id="backup-create">Jetzt sichern</button></div><div class="settings-grid"><section class="panel settings-card" id="backup-settings" data-view-loading="settings">Einstellungen werden geladen …</section></div><section class="panel settings-card" id="backup-list" aria-live="polite" data-view-loading="settings">Sicherungen werden geladen …</section>')+restoreSection();}
function archives(list){return html('<h2>Sicherungsarchive</h2>')+(list.length?list.map(item=>html`<div class="session-row"><div><strong>${new Date(item.createdAt).toLocaleString(locale())}</strong><p class="muted">${item.mode==='auto'?t('Automatisch'):t('Manuell')} · ${h({complete:t('Fertig'),failed:t('Fehlgeschlagen'),running:t('Läuft'),rotated:t('Rotiert'),unavailable:t('Nicht verfügbar')}[item.state]??item.state)}${item.size?' · '+(item.size/1048576).toFixed(2)+t(' MB'):''}</p>${item.error?html`<p class="form-error">${h(item.error)}</p>`:''}</div>${item.state==='complete'?html`<div class="backup-actions"><a class="btn secondary" href="/api/admin/backups/${item.id}/download">Herunterladen</a><button class="btn secondary" data-backup-restore="${item.id}">Wiederherstellen</button></div>`:''}</div>`).join(''):html('<div class="settings-empty"><h3>Noch keine Sicherungen</h3><p>Erstelle eine Sicherung oder richte einen automatischen Sicherungsplan ein.</p></div>'));}
export async function bindBackups(ctx,root){
 let listRevision=0,creating=false;
 // Refresh archives independently so schedule drafts and restore previews survive.
 const rebindRestore=bindBackupRestore(ctx,root)??(()=>{});
 const refreshArchives=async()=>{const revision=++listRevision,list=await ctx.api('/api/admin/backups/list'),target=root.querySelector('#backup-list');if(revision!==listRevision||!target?.isConnected)return;target.innerHTML=archives(list);rebindRestore();};
 root.querySelector('#backup-create').onclick=async event=>{
  if(creating)return;creating=true;const button=event.currentTarget;button.disabled=true;
  try{await ctx.api('/api/admin/backups/create',{method:'POST',body:{}});ctx.toast(t('Sicherung erstellt.'));await refreshArchives();}
  catch(err){ctx.toast(apiError(err.message));}
  finally{creating=false;button.disabled=false;}
 };
 const loadSettings=async()=>{
  const settings=await ctx.api('/api/admin/backups'),target=root.querySelector('#backup-settings');if(!target?.isConnected)return;
  target.innerHTML=html`<h2>Automatische Sicherungen</h2><form>${switchField("enabled",t("Automatische Sicherungen aktivieren"),settings.enabled)}<label class="field"><span>Rhythmus</span><select name="frequency"><option value="daily">Täglich</option><option value="weekly" ${settings.frequency==='weekly'?'selected':''}>Wöchentlich</option></select></label><label class="field"><span>Uhrzeit</span><input name="time" type="time" required value="${h(settings.time)}"></label><label class="field"><span>Wochentag bei wöchentlicher Sicherung</span><select name="weekday">${[t('Sonntag'),t('Montag'),t('Dienstag'),t('Mittwoch'),t('Donnerstag'),t('Freitag'),t('Samstag')].map((v,i)=>html`<option value="${i}" ${i===settings.weekday?'selected':''}>${v}</option>`).join('')}</select></label><label class="field"><span>Zeitzone</span><input name="timezone" required value="${h(settings.timezone)}"></label><label class="field"><span>Automatische Sicherungen aufbewahren</span><input name="retain" type="number" required min="1" max="90" value="${settings.retain}"><small>Manuelle Sicherungen werden nicht automatisch entfernt.</small></label><p class="form-error" role="alert" hidden></p><button class="btn primary" type="submit">Speichern</button></form>`;wireForm(target.querySelector('form'),async(data,form,committed)=>{await ctx.api('/api/admin/backups',{method:'PUT',body:{...data,enabled:form.elements.enabled.checked,weekday:Number(data.weekday),retain:Number(data.retain)}});if(!committed())return;ctx.toast(t('Sicherungsplan gespeichert.'));});
 };
 await Promise.all([loadSettings().catch(err=>ctx.toast(apiError(err.message))),refreshArchives().catch(err=>ctx.toast(apiError(err.message)))]);
}
