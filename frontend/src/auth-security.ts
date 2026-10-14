import {html,locale,setText,t,apiError} from './i18n.js';
import {h,openDialog,trackFormSave} from './ui.js';
import {markForm} from './unsaved.js';
import {captureAuthContext} from './auth-context.js';
const input=(name,label,type='text',extra='')=>html`<label class="field full"><span>${label}</span><input name="${name}" type="${type}" ${extra}></label>`;
export function wireForm(form,action,{lockInputs=false}={}){
  const startSave=trackFormSave(form);
  form.onsubmit=async event=>{
    event.preventDefault();
    const button=form.querySelector('[type=submit]'),error=form.querySelector('[role=alert]');
    const wasInert=Boolean(form.inert),committed=lockInputs?()=>{markForm(form,false);return true;}:startSave();
    button.disabled=true;error.hidden=true;form.dataset.submitting='true';
    if(lockInputs)form.inert=true;
    try{await action(Object.fromEntries(new FormData(form)),form,committed);committed();}
    catch(err){setText(error,apiError(err.message));error.hidden=false;}
    finally{button.disabled=false;form.dataset.submitting='false';if(lockInputs)form.inert=wasInert;}
  };
}
const error=html('<p class="form-error" role="alert" hidden></p>');
const button=label=>html`<button class="btn primary" type="submit">${label}</button>`;
export function recoveryView(ctx,codes,confirm){
  const isActive=captureAuthContext(ctx);
  const dialog=openDialog({title:t('Recoverycodes sichern'),subtitle:t('Jeder Code gilt einmal. Bewahre die Codes getrennt von deinem Gerät auf.'),body:html`<form class="action-form" data-form-mode="action"><div class="dialog-body"><div class="recovery-codes">${codes.map(c=>html`<code>${h(c)}</code>`).join('')}</div><button type="button" class="btn secondary" id="save-recovery">Als Textdatei speichern</button><label class="checkbox-field confirmation-field"><input name="saved" type="checkbox" required><span>Ich habe meine Recoverycodes sicher gespeichert.</span></label>${error}</div><div class="dialog-footer">${button(t('Bestätigen'))}</div></form>`});
  const currentForm=dialog.querySelector('form');
  dialog.querySelector('#save-recovery').onclick=()=>{if(!isActive()||!dialog.open||dialog.querySelector('form')!==currentForm)return;const url=URL.createObjectURL(new Blob(['retourenboard. – Recoverycodes\n\n'+codes.join('\n')],{type:'text/plain'})),a=document.createElement('a');a.href=url;a.download='retourenboard-recoverycodes.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  wireForm(currentForm,async(data,form,committed)=>{if(!isActive()||!dialog.open||dialog.querySelector('form')!==form)return;await confirm(committed,form);if(isActive()&&committed()&&dialog.querySelector('form')===form)dialog.close();},{lockInputs:true});
}
export function enrollmentView(ctx,pending,base,extra,finish){
  const isActive=captureAuthContext(ctx);
  const dialog=openDialog({title:t('Authenticator verbinden'),subtitle:t('Scanne den QR-Code mit deiner Authenticator-App und gib den aktuellen sechsstelligen Code ein.'),body:html`<form class="action-form" data-form-mode="action"><div class="dialog-body"><img class="mfa-qr" src="${h(pending.qrDataUrl)}" alt="QR-Code für die Authenticator-App"><label class="field"><span>Manueller Einrichtungsschlüssel</span><code class="mfa-secret">${h(pending.secret)}</code></label>${input('code',t('App-Code'),'text','required inputmode="numeric" pattern="[0-9]{6}" autocomplete="one-time-code"')}${error}</div><div class="dialog-footer">${button(t('Code prüfen'))}</div></form>`});
  wireForm(dialog.querySelector('form'),async(data,form,committed)=>{if(!isActive())return;const verified=await ctx.api(base+'/verify',{method:'POST',body:{...extra,enrollmentId:pending.enrollmentId,code:data.code}});if(!isActive()||!dialog.open||dialog.querySelector('form')!==form)return;committed();dialog.close();recoveryView(ctx,verified.recoveryCodes,async(committed,form)=>{const session=await ctx.api(base+'/confirm',{method:'POST',body:{...extra,confirmationId:verified.confirmationId,saved:true}});if(!isActive()||!dialog.open||dialog.querySelector('form')!==form)return;committed();dialog.close();ctx.applySession(session);await finish();});},{lockInputs:true});
}
