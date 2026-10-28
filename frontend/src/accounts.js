import {html,t,locale,setText,apiError} from './i18n.js';
import {switchField} from './switches.js';
import { h, icon, openDialog, trackFormSave } from './forms.js';
import {enrollmentView,wireForm} from './account.js';
import {renderPermissionEditor,bindPermissionEditor,permissionSummary} from './permission-editor.js';
import {openDeleteUser,deleteUserLabel} from './account-deletion.js';
const roleName = (role) => role === 'admin' ? t('Administrator') : role==='viewer'?t('Nur lesen'):t('Mitarbeiter');
const usernameField = (value) => html`<label class="field full"><span>Benutzername <b>*</b></span><input name="username" value="${h(value)}" autocomplete="username" required minlength="3" maxlength="64" pattern="[a-zA-Z0-9._-]+" placeholder="z. B. Max"><small>3–64 Zeichen: Buchstaben, Zahlen, Punkt, Bindestrich oder Unterstrich.</small></label>`;
const displayField = (value) => html`<label class="field full"><span>Anzeigename</span><input name="displayName" value="${h(value)}" maxlength="100" autocomplete="name" placeholder="Dein Name"></label>`;
const newPasswordFields = (required = true) => html`<label class="field full"><span>${required ? t('Passwort') : t('Neues Passwort')}${required ? html(' <b>*</b>') : ''}</span><input type="password" name="password" autocomplete="new-password" ${required ? 'required' : ''} minlength="12" maxlength="256"><small>${required ? t('Mindestens 12 Zeichen.') : t('Leer lassen, um das bisherige Passwort zu behalten. Mindestens 12 Zeichen für ein neues Passwort.')}</small></label><label class="field full"><span>Passwort bestätigen${required ? html(' <b>*</b>') : ''}</span><input type="password" name="passwordConfirm" autocomplete="new-password" ${required ? 'required' : ''} maxlength="256"></label>`;
const footer = (label) => html`<div class="dialog-footer"><button type="button" class="btn secondary" data-close>Abbrechen</button><button type="submit" class="btn primary">${icon('check')}${label}</button></div>`;
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
export {openLogin} from './login.js';
export function openAccount(ctx) { if(ctx.openAccountPage)return ctx.openAccountPage();location.href="/account"; }
export function renderUsers() { return html`<section class="panel"><div class="panel-heading"><div><h2>Benutzerkonten</h2><p>Persönliche Zugänge und einzeln einstellbare Berechtigungen.</p></div><button class="btn primary" id="user-create">${icon('plus')}Konto anlegen</button></div><div id="user-list" aria-live="polite"><p class="muted user-loading">Konten werden geladen …</p></div></section><p class="muted admin-help">Lege die Rechte beim Anlegen oder Bearbeiten eines Kontos fest. Verwaltungsaufgaben sind gezielt freigebbar; Konten und sicherheitsrelevante Serveraufgaben bleiben Administratoren vorbehalten. Der letzte aktive Administrator bleibt erhalten.</p>`; }
export async function bindUsers(ctx, root) {
    if (!ctx.isAdmin)
        return;
    root.querySelector('#user-create').onclick = () => userForm(ctx);
    const list = root.querySelector('#user-list');
    try {
        const users = await ctx.api('/api/users');
        if (!list.isConnected || !ctx.isAdmin)
            return;
        const admins=users.filter(user=>user.active&&user.role==='admin').length;
        list.innerHTML = html`<div class="table-scroll"><table><thead><tr><th>Name / Benutzername</th><th>Rolle</th><th>Berechtigungen</th><th>Status</th><th>2FA</th><th>Aktionen</th></tr></thead><tbody>${users.map(user => {const own=user.id===ctx.session.user.id,last=user.active&&user.role==='admin'&&admins<=1,label=deleteUserLabel(user.username);return html`<tr><td><strong>${h(user.displayName)}</strong><div class="user-name">${h(user.username)}${own ? t(' · Dein Konto') : ''}</div></td><td>${roleName(user.role)}</td><td><span class="permission-summary">${h(permissionSummary(user))}</span></td><td><span class="status ${user.active ? 'done' : 'archived'}"><span></span>${user.active ? t('Aktiv') : t('Deaktiviert')}</span></td><td><span class="status ${user.mfaEnabled ? 'done' : user.mfaRequired ? 'checking' : 'archived'}">${user.mfaEnabled ? t('Aktiv') : user.mfaRequired ? t('Einrichtung erforderlich') : t('Aus')}</span></td><td><div class="record-actions"><button class="icon-btn" data-user-edit="${user.id}" aria-label="Konto ${h(user.username)} bearbeiten">${icon('edit')}</button><button type="button" class="icon-btn" data-user-delete="${user.id}" aria-label="${h(label)}" title="${h(own?t('Dein eigenes Konto kann nicht gelöscht werden.'):last?t('Mindestens ein aktiver Administrator muss erhalten bleiben.'):label)}"${own||last?' disabled':''}>${icon('trash')}</button></div></td></tr>`;}).join('')}</tbody></table></div>`;
        list.querySelectorAll('[data-user-edit]').forEach(el => el.onclick = () => userForm(ctx, users.find(user => user.id === Number(el.dataset.userEdit))));
        list.querySelectorAll('[data-user-delete]').forEach(el=>el.onclick=()=>{if(!el.disabled)openDeleteUser(ctx,users.find(user=>user.id===Number(el.dataset.userDelete)));});
    }
    catch (err) {
        if (list.isConnected) {
            setText(list,apiError(err.message));
            list.classList.add('user-loading');
        }
    }
}
function userForm(ctx, user = {}) {
    const edit = !!user.id;
    let savedId = user.id;
    const dialog = openDialog({ title: edit ? t('Konto bearbeiten') : t('Konto anlegen'), subtitle: edit ? t('Einzelrechte ändern, Zugang deaktivieren oder ein neues Passwort setzen.') : t('Persönlichen Zugang anlegen und die passenden Rechte auswählen.'),wide:true, body: html`<form id="user-form"><div class="dialog-body"><fieldset class="form-section" data-section-title="Zugang"><legend>Zugang</legend><div class="form-grid">${usernameField(user.username)}${displayField(user.displayName)}<label class="field full"><span>Rolle</span><select name="role"><option value="member"${!user.role||user.role==='member' ? ' selected' : ''}>Mitarbeiter</option><option value="viewer"${user.role==='viewer' ? ' selected' : ''}>Nur lesen</option><option value="admin"${user.role === 'admin' ? ' selected' : ''}>Administrator</option></select></label>${edit ? `${switchField("active",t("Konto aktiv"),user.active,{full:true})}` : ''}</div></fieldset><fieldset class="form-section" data-section-title="Sicherheit"><legend>Sicherheit</legend><div class="form-grid">${newPasswordFields(!edit)}</div><div data-account-security-actions></div></fieldset><fieldset class="form-section" data-section-title="Zugriffsrechte"><legend>Zugriffsrechte</legend>${renderPermissionEditor(user)}</fieldset>${errorField}</div>${footer(edit ? t('Speichern') : t('Konto anlegen'))}</form>` });
    const form = dialog.querySelector('form');
    const permissionEditor=bindPermissionEditor(form);
    if(edit&&ctx.session.user.id!==user.id){form.querySelector('[data-account-security-actions]').insertAdjacentHTML('beforeend',html('<div class="account-security-action"><button type="button" class="btn secondary" id="admin-mfa-reset">2FA dieses Kontos zurücksetzen</button><p class="muted">Das Konto muss nach der nächsten Passwortanmeldung einen neuen Authenticator einrichten.</p></div>'));form.querySelector('#admin-mfa-reset').onclick=()=>{const reset=openDialog({title:t('2FA zurücksetzen'),subtitle:t`Konto ${user.username} muss anschließend 2FA neu einrichten.`,body:html('<form class="action-form" data-form-mode="action"><div class="dialog-body"><label class="field"><span>Dein aktuelles Adminpasswort</span><input name="password" type="password" required autocomplete="current-password"></label><label class="field"><span>Dein eigener 2FA-/Recoverycode (falls aktiv)</span><input name="factor" autocomplete="one-time-code" maxlength="100"></label><label class="checkbox-field confirmation-field"><input name="confirmed" type="checkbox" required><span>Reset für dieses Konto bestätigen</span></label><p class="form-error" role="alert" hidden></p></div><div class="dialog-footer"><button class="btn secondary" type="button" data-close>Abbrechen</button><button class="btn primary" type="submit">2FA zurücksetzen</button></div></form>')});wireForm(reset.querySelector('form'),async(data,savedForm,committed)=>{await ctx.api(`/api/users/${user.id}/mfa/reset`,{method:'POST',body:{password:data.password,factor:data.factor,confirmed:true}});if(!committed()||reset.querySelector('form')!==savedForm)return;reset.close();ctx.toast(t('2FA zurückgesetzt. Neue Einrichtung erforderlich.'));});};}
    submit(form, async (data,committed) => {
        confirmPassword(data);
        const body = { username: data.get('username'), displayName: data.get('displayName'), role: data.get('role'), active: edit ? form.elements.namedItem('active').checked : true, ...(data.get('password') ? { password: data.get('password') } : {}) };
        body.permissions=permissionEditor.values();
        const saved = await ctx.api(`/api/users${savedId ? '/' + savedId : ''}`, { method: savedId ? 'PUT' : 'POST', body });
        ctx.accountSaved?.(saved);
        savedId = saved?.id ?? savedId;
        if (!committed() || dialog.querySelector('form') !== form) return;
        dialog.close();
        await ctx.reload();
        ctx.toast(edit ? t('Konto gespeichert.') : t('Konto angelegt.'));
    });
}

