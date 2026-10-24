import {html,t,addTranslations,apiError} from './i18n.js';
import {h} from './ui.js';
import {captureAuthContext} from './auth-context.js';
addTranslations({'Seriennummer wird geprüft …':'Checking serial number …','Bestehende Vorgänge zu dieser Seriennummer':'Existing returns for this serial number','Ursprüngliche und Austauschseriennummer werden geprüft. Erneute Retouren sind weiterhin möglich.':'Original and replacement serial numbers are checked. Repeat returns are still allowed.','Keine bestehenden Vorgänge gefunden.':'No existing returns found.','Seriennummernsuche nicht verfügbar.':'Serial lookup is unavailable.'});
export function bindSerialRecognition(ctx:any,dialog:HTMLDialogElement,item:any,openReturn:(row:any)=>void){
 const form=dialog.querySelector('form'),auth=captureAuthContext(ctx),serial=form.querySelector<HTMLInputElement>('[name=serialNumber]'),root=document.createElement('div');if(!serial)return;
 root.className='field-advisory serial-recognition';root.setAttribute('role','status');serial.closest('.field').append(root);let timer:any,epoch=0;
 const current=(token:number,value:string)=>auth()&&dialog.open&&dialog.querySelector('form')===form&&token===epoch&&serial.value.trim()===value;
 const update=()=>{clearTimeout(timer);const token=++epoch,value=serial.value.trim();root.innerHTML='';root.hidden=!value;if(!value)return;
  root.innerHTML=html('<p>Seriennummer wird geprüft …</p>');timer=setTimeout(async()=>{try{const query=new URLSearchParams({serialNumber:value});if(item.id)query.set('excludeId',String(item.id));const result=await ctx.api('/api/returns/serial-lookup?'+query);if(!current(token,value))return;
   root.innerHTML=result.total?html`<p><strong>Bestehende Vorgänge zu dieser Seriennummer</strong></p><p>Ursprüngliche und Austauschseriennummer werden geprüft. Erneute Retouren sind weiterhin möglich.</p><ul class="field-advisory-links">${result.items.map(row=>html`<li><button type="button" class="text-link" data-serial-return="${row.id}">${h(row.returnNumber)}</button><span> · ${h(row.productName)} · ${h(row.status)}</span></li>`).join('')}</ul>`:html('<p>Keine bestehenden Vorgänge gefunden.</p>');
   root.querySelectorAll<HTMLButtonElement>('[data-serial-return]').forEach(button=>button.onclick=()=>{if(current(token,value))openReturn(result.items.find(row=>row.id===Number(button.dataset.serialReturn)));});
  }catch(error){if(current(token,value))root.innerHTML=html`<p>${t('Seriennummernsuche nicht verfügbar.')} ${h(apiError(error.message))}</p>`;}},250);
 };
 serial.addEventListener('input',update);serial.addEventListener('change',update);form.addEventListener('input',event=>{if(event.target===form)update();});dialog.addEventListener('close',()=>{++epoch;clearTimeout(timer);},{once:true});update();
}
