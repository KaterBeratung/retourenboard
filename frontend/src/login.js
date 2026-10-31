import {html,locale,setText,t,apiError} from './i18n.js';
import {h,icon,trackFormSave} from './ui.js';
import {enrollmentView,wireForm} from './auth-security.js';
import {captureAuthContext} from './auth-context.js';
import {bindSsoLogin} from './sso-login.js';
const usernameField = (value) => html`<label class="field full"><span>Benutzername <b>*</b></span><input name="username" value="${h(value)}" autocomplete="username" required minlength="3" maxlength="64" pattern="[a-zA-Z0-9._\\-]+" placeholder="z. B. Max"><small>3–64 Zeichen: Buchstaben, Zahlen, Punkt, Bindestrich oder Unterstrich.</small></label>`;
const displayField = (value) => html`<label class="field full"><span>Anzeigename</span><input name="displayName" value="${h(value)}" maxlength="100" autocomplete="name" placeholder="Dein Name"></label>`;
const passwordControl = (name, attributes) => html`<div class="password-input"><input id="auth-${name}" type="password" name="${name}" spellcheck="false" autocapitalize="off" placeholder="${name === 'passwordConfirm' ? t('Passwort bestätigen') : t('Dein Passwort')}" ${attributes}><button type="button" class="password-toggle" aria-controls="auth-${name}" aria-label="Passwort anzeigen" title="Passwort anzeigen" aria-pressed="false">${icon('eye')}</button></div>`;
const passwordField = (label, name, attributes, help = '') => html`<div class="field full password-field"><label for="auth-${name}">${label}</label>${passwordControl(name, attributes)}${help ? html`<small>${help}</small>` : ''}</div>`;
const newPasswordFields = (required = true) => passwordField(html`${required ? t('Passwort') : t('Neues Passwort')}${required ? html(' <b>*</b>') : ''}`, 'password', html`autocomplete="new-password" ${required ? 'required' : ''} minlength="12" maxlength="256"`, required ? t('Mindestens 12 Zeichen.') : t('Leer lassen, um das bisherige Passwort zu behalten. Mindestens 12 Zeichen für ein neues Passwort.')) + passwordField(html`Passwort bestätigen${required ? html(' <b>*</b>') : ''}`, 'passwordConfirm', html`autocomplete="new-password" ${required ? 'required' : ''} maxlength="256"`);
const errorField = html('<p class="form-error" role="alert" hidden></p>');
function confirmPassword(data) { if (data.get('password') !== data.get('passwordConfirm'))
    throw new Error(t('Die Passwörter stimmen nicht überein.')); }
function submit(form, action) { const startSave=trackFormSave(form); form.onsubmit = async (event) => { event.preventDefault(); const button = form.querySelector('[type=submit]'), error = form.querySelector('.form-error'); button.disabled = true; error.hidden = true; const committed=startSave(); try {
    await action(new FormData(form),committed);
}
catch (err) {
    setText(error,apiError(err.message));
    error.hidden = false;
}
finally {
    button.disabled = false;
} }; }
export function openLogin(ctx, after = () => { }) {
    ctx.invalidateAuthFlow?.();
    const isActive=captureAuthContext(ctx);
    const setup = ctx.session.setupRequired;
    const page = document.querySelector('#auth-page');
    page.dataset.stage = setup ? 'setup' : 'login';
    const dialog = document.querySelector('#dialog');
    if (dialog.open)
        dialog.close();
    page.innerHTML = html`<div class="auth-hero"><div class="brand auth-brand"><span class="brand-mark" aria-hidden="true"><img src="/favicon.svg" alt="" width="48" height="48"></span><span>retourenboard<span class="brand-dot">.</span></span></div><p class="auth-tagline">Dein gemeinsamer Retouren-Arbeitsplatz.</p><ul class="auth-points"><li><span class="auth-point-icon">${icon('return')}</span><span>Retouren mit Seriennummer erfassen</span></li><li><span class="auth-point-icon">${icon('barcode')}</span><span>Scannen und Etiketten drucken</span></li><li><span class="auth-point-icon">${icon('send')}</span><span>Bearbeitungsstand mit Kundschaft teilen</span></li></ul></div><section class="auth-card"><header class="auth-header"><h1 id="auth-title">${setup ? t('Ersten Administrator anlegen') : t('Willkommen zurück')}</h1><p>${setup ? t('Richte deinen persönlichen Zugang ein. Dieser erste Account verwaltet weitere Konten.') : t('Melde dich mit deinem persönlichen Konto an.')}</p></header>${setup ? '' : html('<section class="auth-sso" data-sso-login hidden><div data-sso-providers></div><p class="form-error" data-sso-feedback role="status" hidden></p><div class="auth-separator"><span>oder mit Passwort</span></div></section>')}<form id="login-form"><div class="dialog-body">${setup ? html`<div class="permission-note">${icon('lock')}<p>Dein erster Account erhält Administratorrechte. Weitere Personen werden später im Adminbereich hinzugefügt.</p></div>` : ''}<div class="form-grid">${usernameField('')}${setup ? displayField('') + newPasswordFields() : passwordField(html('Passwort <b>*</b>'), 'password', html`autocomplete="current-password" required maxlength="256"`)}</div>${errorField}</div><div class="dialog-footer"><button type="submit" class="btn primary">${icon(setup ? 'check' : 'unlock')}${setup ? t('Administrator anlegen') : t('Anmelden')}</button></div></form></section>${ctx.session.version ? html`<p class="auth-caption"><span class="auth-version">Version ${h(ctx.session.version)}</span></p>` : ''}`;
    page.querySelectorAll('.password-toggle').forEach(button => {
        const input = button.parentElement.querySelector('input');
        button.onclick = () => {
            const visible = input.type === 'password';
            input.type = visible ? 'text' : 'password';
            button.setAttribute('aria-pressed', String(visible));
            const label = t(visible ? 'Passwort verbergen' : 'Passwort anzeigen');
            for (const name of ['aria-label', 'title']) {
                button.setAttribute(name, String(label));
                button.setAttribute('data-rb-i18n-' + name, encodeURIComponent(JSON.stringify([label.de, label.en])));
            }
            button.innerHTML = icon(visible ? 'eyeOff' : 'eye');
        };
    });
    submit(page.querySelector('form'), async (data,committed) => {
        if (setup)
            confirmPassword(data);
        const body = { username: data.get('username'), password: data.get('password'), ...(setup ? { displayName: data.get('displayName') } : {}) };
        const result=await ctx.api(setup ? '/api/setup' : '/api/login', { method: 'POST', body });
        if(!isActive())return;
        committed();
        await completeLoginResult(ctx,result,page,after,isActive);
    });
    void bindSsoLogin(ctx,page,result=>completeLoginResult(ctx,result,page,after,isActive),isActive);
}

async function completeLoginResult(ctx,result,page,after,isActive){
    if(!isActive())return;
        if(result.mfaRequired||result.enrollmentRequired){
            const finish=async session=>{if(session){if(!isActive())return;ctx.applySession(session);}page.replaceChildren();await ctx.reload();await after();};
            if(result.enrollmentRequired){page.dataset.stage='mfa';const pending=await ctx.api('/api/login/mfa/setup',{method:'POST',body:{challengeId:result.challengeId}});if(!isActive())return;enrollmentView(ctx,pending,'/api/login/mfa',{challengeId:result.challengeId},()=>finish());return;}
            page.dataset.stage='mfa';page.querySelector('.auth-header').innerHTML=html('<h1 id="auth-title">Zweiter Anmeldeschritt</h1><p>Gib deinen App-Code oder einen einmaligen Recoverycode ein.</p>');
            page.querySelector('form').innerHTML=html`<div class="dialog-body"><label class="field"><span>2FA- oder Recoverycode</span><input name="code" required autocomplete="one-time-code" maxlength="100" autofocus></label>${errorField}</div><div class="dialog-footer"><button class="btn secondary" type="button" id="login-back">Zurück</button><button type="submit" class="btn primary">Anmelden</button></div>`;
            page.querySelector('#login-back').onclick=()=>openLogin(ctx,after);
            wireForm(page.querySelector('form'),async(values,form,committed)=>{const session=await ctx.api('/api/login/mfa',{method:'POST',body:{challengeId:result.challengeId,code:values.code}});committed();await finish(session);});
            page.querySelector('[name=code]').focus();return;
        }
        ctx.applySession(result);
        page.replaceChildren();
        await ctx.reload();
        ctx.toast(t`Angemeldet als ${ctx.session.user.displayName}.`);
        await after();
}
