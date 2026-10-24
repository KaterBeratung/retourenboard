import {html,locale,setText,t,apiError} from './i18n.js';
import {loadingSkeleton} from './presentation.js';
import {h,openDialog} from './forms.js';
import {canLeaveForms} from './unsaved.js';
import {signOut,captureAuthContext} from './auth-context.js';
import {enrollmentView,recoveryView,wireForm} from './auth-security.js';
export {enrollmentView,recoveryView,wireForm} from './auth-security.js';
const input=(name,label,type='text',extra='')=>html`<label class="field full"><span>${label}</span><input name="${name}" type="${type}" ${extra}></label>`;
const identity=()=>input('password',t('Aktuelles Passwort'),'password','required autocomplete="current-password" maxlength="256"')+input('factor',t('2FA- oder Recoverycode (bei aktivierter 2FA)'),'text','autocomplete="one-time-code" maxlength="100"');
const error=html('<p class="form-error" role="alert" hidden></p>');
const button=label=>html`<button class="btn primary" type="submit">${label}</button>`;
// A saved account invalidates name-bearing inventory caches. Keep drafts and
// access rights intact; authoritative permissions still come from the session.
export function applyAccountProfile(state:any,profile:any){
  if(!Number.isSafeInteger(profile?.id)||profile.id<1||typeof profile.displayName!=='string')return false;
  state.inventoryLoaded=false;
  if(state.session?.user?.id===profile.id)state.session.user={...state.session.user,displayName:profile.displayName};
  return true;
}
export function renderAccount(backHref='/',backLabel=t('Zum Retourenboard')){return html`<div class="page-heading"><div><div class="eyebrow">PERSÖNLICH</div><h1>Mein Konto<span class="heading-dot">.</span></h1><p>Profil, Sicherheit und persönliche Darstellung.</p></div><a class="btn secondary" href="${h(backHref)}">${backLabel}</a></div><div id="account-content" aria-live="polite">${loadingSkeleton('account')}</div>`;}
export async function bindAccount(ctx,root){
  const isActive=captureAuthContext(ctx);
  const target=root.querySelector('#account-content');
  const connected=()=>isActive()&&target?.isConnected&&root.querySelector('#account-content')===target;
  try{const [profile,prefs,mfa,sessions,ssoLinks]=await Promise.all(['/profile','/preferences','/mfa','/sessions','/sso'].map(p=>ctx.api('/api/account'+p)));if(!connected())return;
    target.innerHTML=html`<div class="settings-grid account-settings-grid"><section class="panel settings-card"><h2>Profil</h2><p class="muted">${h(profile.username)} · ${h(profile.role==='admin'?t('Administrator'):profile.role==='viewer'?t('Nur lesen'):t('Mitarbeiter'))}</p><form id="profile-form">${input('displayName',t('Anzeigename'),'text',`required maxlength="100" value="${h(profile.displayName)}"`)}${error}${button(t('Profil speichern'))}</form></section><section class="panel settings-card"><h2>Darstellung</h2><form id="preferences-form"><label class="field"><span>Farbschema</span><select name="theme">${[['system',t('Systemeinstellung')],['light',t('Hell')],['dark',t('Dunkel')]].map(([v,l])=>html`<option value="${v}" ${prefs.theme===v?'selected':''}>${l}</option>`).join('')}</select></label><label class="field"><span>Animationen</span><select name="motionMode" aria-describedby="motion-mode-help">${[['system',t('Systemeinstellung')],['on',t('Ein')],['off',t('Aus')]].map(([v,l])=>html`<option value="${v}" ${(prefs.motionMode??(prefs.reduceMotion?'off':'system'))===v?'selected':''}>${l}</option>`).join('')}</select></label><p id="motion-mode-help" class="muted">System folgt der Geräteeinstellung. Ein erlaubt Animationen ausdrücklich; Aus deaktiviert sie.</p>${error}${button(t('Darstellung speichern'))}</form></section><section class="panel settings-card"><h2>Passwort ändern</h2><form id="account-password">${identity()}${input('newPassword',t('Neues Passwort'),'password','required minlength="12" maxlength="256" autocomplete="new-password"')}${input('confirm',t('Neues Passwort bestätigen'),'password','required autocomplete="new-password"')}${error}${button(t('Passwort ändern'))}</form></section><section class="panel settings-card"><h2>Zwei-Faktor-Authentifizierung</h2><p>${mfa.enabled?t`Aktiv · ${mfa.recoveryCodesRemaining} Recoverycodes übrig`:t('Noch nicht aktiviert')}</p>${mfa.enabled&&!mfa.keyAvailable?html('<p class="form-error">Schlüssel fehlt. Nutze einen Recoverycode und stelle den Schlüssel aus der separaten Sicherung wieder her.</p>'):''}<form id="mfa-action">${identity()}<label class="field"><span>Aktion</span><select name="action"><option value="setup">${mfa.enabled?t('Authenticator neu verbinden'):t('2FA aktivieren')}</option>${mfa.enabled?html('<option value="recovery-codes">Neue Recoverycodes</option><option value="disable">2FA deaktivieren</option>'):''}</select></label>${error}${button(t('Fortfahren'))}</form></section>${ssoLinks?.length?html`<section class="panel settings-card"><h2>OAuth / OpenID</h2><p class="muted">Deine vom Admin freigegebenen Anmeldungen.</p><div class="sso-provider-list">${ssoLinks.map(i=>html`<p><strong>${h(i.providerLabel)}</strong></p>`).join('')}</div></section>`:''}</div><section class="panel settings-card"><h2>Aktive Sitzungen</h2><div class="session-list">${sessions.map(s=>html`<div class="session-row"><div><strong>${s.current?t('Diese Sitzung'):t('Weitere Sitzung')}</strong><p class="muted">${h(s.userAgent||t('Browser'))}<br>Angemeldet ${new Date(s.createdAt).toLocaleString(locale())} · zuletzt ${new Date(s.lastSeen).toLocaleString(locale())}</p></div><button class="btn secondary small" data-revoke="${h(s.id)}">Beenden</button></div>`).join('')}</div><div class="session-actions"><button class="btn secondary" data-revoke-mode="others">Alle anderen Sitzungen beenden</button><button class="btn secondary" data-revoke-mode="all">Alle Sitzungen beenden</button><button class="btn secondary" id="account-signout">Abmelden</button></div></section>`;
    wireForm(target.querySelector('#profile-form'),async(data,form,committed)=>{const saved=await ctx.api('/api/account/profile',{method:'PUT',body:data});ctx.accountSaved?.(saved);if(!committed())return;await ctx.reload();ctx.toast(t('Profil gespeichert.'));});
    wireForm(target.querySelector('#preferences-form'),async(data,form,committed)=>{const saved=await ctx.api('/api/account/preferences',{method:'PUT',body:{theme:data.theme,motionMode:data.motionMode}});if(!committed())return;window.dispatchEvent(new CustomEvent('account-preferences',{detail:saved}));ctx.toast(t('Darstellung gespeichert.'));});
    wireForm(target.querySelector('#account-password'),async(data,form,committed)=>{if(data.newPassword!==data.confirm)throw new Error(t('Die Passwörter stimmen nicht überein.'));const session=await ctx.api('/api/account/password',{method:'POST',body:{currentPassword:data.password,newPassword:data.newPassword,factor:data.factor}});ctx.applySession(session);if(!committed())return;await ctx.reload();});
    let mfaPending=false;
    wireForm(target.querySelector('#mfa-action'),async(data,form,committed)=>{
      if(mfaPending||!isActive())return;
      mfaPending=true;
      const dialog=openDialog({title:t('Sicherheitsänderung wird gespeichert'),body:html('<div class="dialog-body"><p role="status">Bitte warte, bis der Vorgang abgeschlossen ist.</p></div>')});
      const header=dialog.querySelector('.dialog-header'),isCurrent=()=>isActive()&&dialog.open&&dialog.querySelector('.dialog-header')===header;
      const close=dialog.querySelector('.dialog-close');close.hidden=true;close.onclick=null;
      dialog.oncancel=event=>event.preventDefault();dialog.onclick=null;
      try{
        const result=await ctx.api('/api/account/mfa/'+data.action,{method:'POST',body:{password:data.password,factor:data.factor}});
        if(!isCurrent())return;
        committed();
        if(data.action==='disable'){dialog.close();ctx.applySession(result);await ctx.reload();return;}
        if(data.action==='setup')enrollmentView(ctx,result,'/api/account/mfa',{},()=>ctx.reload());
        else if(data.action==='recovery-codes')recoveryView(ctx,result.recoveryCodes,()=>ctx.reload());
        else{dialog.close();await ctx.reload();}
      }finally{mfaPending=false;if(isCurrent()&&dialog.open)dialog.close();}
    },{lockInputs:true});
    target.querySelectorAll('[data-revoke],[data-revoke-mode]').forEach(el=>el.onclick=()=>{if(mfaPending)return;const dialog=openDialog({title:t('Sitzung beenden'),subtitle:t('Bestätige den Widerruf mit deinem aktuellen Passwort.'),body:html`<form class="action-form" data-form-mode="action"><div class="dialog-body">${identity()}${error}</div><div class="dialog-footer">${button(t('Sitzung beenden'))}</div></form>`});wireForm(dialog.querySelector('form'),async(data,form,committed)=>{await ctx.api('/api/account/sessions/revoke',{method:'POST',body:{...data,...(el.dataset.revoke?{id:el.dataset.revoke}:{mode:el.dataset.revokeMode})}});if(!committed()||dialog.querySelector('form')!==form)return;dialog.close();await ctx.reload();});});
    target.querySelector('#account-signout').onclick=async()=>{if(mfaPending)return;try{await signOut(ctx,()=>canLeaveForms(document),target.querySelector('#account-signout'));}catch(err){ctx.toast(apiError(err.message));}};
  }catch(err){if(connected())setText(target,apiError(err.message));}
}
