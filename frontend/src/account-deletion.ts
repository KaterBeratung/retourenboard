import {html,t,addTranslations,LocalizedText} from './i18n.js';
import {h,icon,openDialog} from './ui.js';
import {switchField} from './switches.js';
import {wireForm} from './auth-security.js';
import {captureAuthContext} from './auth-context.js';

addTranslations({
 'Konto löschen':'Delete account','Konto gelöscht.':'Account deleted.',
 'Dieses Konto wird aus der Kontenliste entfernt. Alle Sitzungen werden beendet. Produkte, Retouren, Nachrichten und Kommentare bleiben erhalten; Zuständigkeiten dieses Kontos werden aufgehoben.':'This account will be removed from the account list. All sessions will end. Products, returns, messages and comments are retained; this account’s assignments are cleared.',
 'Ich bestätige die Löschung dieses Kontos.':'I confirm deletion of this account.',
 'Das Löschen kann nicht rückgängig gemacht werden.':'Deletion cannot be undone.',
 'Dein eigenes Konto kann nicht gelöscht werden.':'You cannot delete your own account.',
 'Bitte die Kontolöschung bestätigen.':'Please confirm account deletion.',
 'Der Benutzername passt nicht zum ausgewählten Konto.':'The username does not match the selected account.',
});

export function deleteUserLabel(username:string){return new LocalizedText(`Konto ${username} löschen`,`Delete account ${username}`);}

export function renderDeleteUserForm(user:any):string{
 return html`<form class="action-form" data-form-mode="action"><div class="dialog-body"><p class="settings-message"><strong>${h(user.displayName||user.username)}</strong><br><span class="mono">${h(user.username)}</span></p><p>Dieses Konto wird aus der Kontenliste entfernt. Alle Sitzungen werden beendet. Produkte, Retouren, Nachrichten und Kommentare bleiben erhalten; Zuständigkeiten dieses Kontos werden aufgehoben.</p><label class="field full"><span>Dein aktuelles Adminpasswort</span><input name="password" type="password" required autocomplete="current-password" maxlength="256"></label><label class="field full"><span>Dein eigener 2FA-/Recoverycode (falls aktiv)</span><input name="factor" autocomplete="one-time-code" maxlength="100"></label>${switchField('confirmed',t('Ich bestätige die Löschung dieses Kontos.'),false,{required:true,confirmation:true,full:true})}<p class="muted">Das Löschen kann nicht rückgängig gemacht werden.</p><p class="form-error" role="alert" hidden></p></div><div class="dialog-footer"><button type="button" class="btn secondary" data-close>Abbrechen</button><button type="submit" class="btn danger">${icon('trash')}Konto löschen</button></div></form>`;
}

export function openDeleteUser(ctx:any,user:any):void{
 if(!ctx.isAdmin||!user?.id||user.id===ctx.session?.user?.id)return;
 const isCurrent=captureAuthContext(ctx);
 const dialog=openDialog({title:t('Konto löschen'),subtitle:user.username,body:renderDeleteUserForm(user)});
 wireForm(dialog.querySelector('form'),async(data:any,form:any,committed:any)=>{
  if(!isCurrent()||!ctx.isAdmin)return;
  await ctx.api(`/api/users/${user.id}`,{method:'DELETE',body:{username:user.username,password:data.password,factor:data.factor,confirmed:data.confirmed==='on'}});
  if(!isCurrent()||!committed()||dialog.querySelector('form')!==form)return;
  dialog.close();await ctx.reload();ctx.toast(t('Konto gelöscht.'));
 },{lockInputs:true});
}
