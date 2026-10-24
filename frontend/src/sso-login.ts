import {html,t,apiError,setText} from './i18n.js';
import {h,icon} from './ui.js';
import {canLeaveForms} from './unsaved.js';
import {returnPathAfterLogin} from '../shared/auth-navigation.js';

export async function bindSsoLogin(ctx:any,page:HTMLElement,accept:(result:any)=>Promise<void>,isActive:()=>boolean){
 const area=page.querySelector<HTMLElement>('[data-sso-login]');
 if(typeof area?.querySelector!=='function')return;
 const feedback=area.querySelector<HTMLElement>('[data-sso-feedback]');
 const show=(message:any)=>{area.hidden=false;feedback.hidden=false;setText(feedback,message);};
 const current=new URL(location.href),status=current.searchParams.get('sso');
 if(status){current.searchParams.delete('sso');history.replaceState(null,'',current.pathname+current.search+current.hash);}
 try{
  if(status==='complete'){
   const result=await ctx.api('/api/sso/complete',{method:'POST',body:{}});if(!isActive())return;
   if(result.pending)show(t('Deine SSO-Identität wurde bestätigt. Ein Administrator muss den Zugang noch freigeben. Melde dich danach erneut an.'));
   else{await accept(result);return;}
  }else if(status==='error')show(t('SSO-Anmeldung wurde abgebrochen oder ist abgelaufen. Bitte erneut versuchen.'));
  const available=await ctx.api('/api/sso/providers');if(!isActive()||!area.isConnected)return;
  const list=area.querySelector<HTMLElement>('[data-sso-providers]');
  list.innerHTML=(available.providers??[]).map((p:any)=>html`<button type="button" class="btn secondary" data-sso-provider="${h(p.id)}">${icon('unlock')}<span>${p.type==='microsoft'&&p.label==='Microsoft'?t('Mit Microsoft anmelden'):html`${t('Anmelden mit')} ${h(p.label)}`}</span></button>`).join('');
  if(list.childElementCount)area.hidden=false;
  list.querySelectorAll<HTMLButtonElement>('[data-sso-provider]').forEach(button=>button.onclick=async()=>{
   if(!await canLeaveForms(page)||!isActive())return;
   const buttons=[...list.querySelectorAll<HTMLButtonElement>('button')];buttons.forEach(b=>b.disabled=true);feedback.hidden=true;
   try{const result=await ctx.api('/api/sso/start',{method:'POST',body:{providerId:button.dataset.ssoProvider,returnTo:returnPathAfterLogin(location.href)}});if(isActive())location.assign(result.authorizationUrl);}
   catch(error){if(isActive())show(apiError(error.message));buttons.forEach(b=>b.disabled=false);}
  });
 }catch(error){if(isActive())show(apiError(error.message));}
}
