import {html,locale,setText,t} from './i18n.js';
export function mayLeaveForm(dirty:boolean,confirm:()=>boolean){return !dirty||confirm();}
type FormState = [string,FormDataEntryValue][];
const baselines=new WeakMap<HTMLFormElement,FormState>();
function editable(form:HTMLFormElement){return form.dataset.formMode!=='action'&&form.dataset.filterForm!=='true'&&!form.closest('#auth-page');}
export function readFormState(form:HTMLFormElement):FormState{return [...new FormData(form)];}
function sameValue(a:FormDataEntryValue,b:FormDataEntryValue){
  // Empty upload controls produce a fresh empty File on every FormData read.
  return a===b||typeof a!=='string'&&typeof b!=='string'&&!a.name&&!b.name&&a.size===0&&b.size===0;
}
function showFormState(form:HTMLFormElement,dirty:boolean){
  form.dataset.dirty=String(dirty);
  if(form.dataset.unsavedNotice==='hidden')return;
  const inline=form.querySelector<HTMLElement>('[data-unsaved]');
  if(inline){setText(inline,dirty?t('Ungespeicherte Änderungen'):t('Alle Änderungen gespeichert.'));return;}
  let status=form.querySelector<HTMLElement>('.unsaved-status');
  if(!status){status=document.createElement('p');status.className='unsaved-status field full';status.setAttribute('role','status');setText(status,t('Ungespeicherte Änderungen'));form.prepend(status);}
  status.hidden=!dirty;
}
export function observeForm(form:HTMLFormElement){if(editable(form)&&!baselines.has(form))baselines.set(form,readFormState(form));}
export function refreshFormState(form:HTMLFormElement){
  if(!editable(form))return;
  const saved=baselines.get(form),current=readFormState(form);
  const dirty=!saved||saved.length!==current.length||saved.some(([name,value],i)=>name!==current[i][0]||!sameValue(value,current[i][1]));
  showFormState(form,dirty);
}
export function acceptFormState(form:HTMLFormElement,state:FormState){if(!editable(form))return;baselines.set(form,state);refreshFormState(form);}
export function markForm(form:HTMLFormElement,dirty:boolean){if(!editable(form))return;if(!dirty)baselines.set(form,readFormState(form));showFormState(form,dirty);}
let pendingDiscard:Promise<boolean>|null=null;
function askDiscard(){
  if(pendingDiscard)return pendingDiscard;
  pendingDiscard=new Promise<boolean>(resolve=>{const previous=document.activeElement as HTMLElement,dialog=document.createElement('dialog');dialog.className='unsaved-dialog';dialog.setAttribute('aria-label',t('Ungespeicherte Änderungen'));dialog.innerHTML=html('<div class="dialog-header"><div><h2>Änderungen verwerfen?</h2><p>Deine Eingaben wurden noch nicht gespeichert.</p></div></div><div class="dialog-body"><p>Du kannst weiter bearbeiten oder die Änderungen verwerfen und zur anderen Ansicht wechseln.</p></div><div class="dialog-footer"><button type="button" class="btn secondary" data-stay>Weiter bearbeiten</button><button type="button" class="btn danger" data-discard>Änderungen verwerfen</button></div>');const finish=(value:boolean)=>{dialog.close();dialog.remove();if(previous?.isConnected)previous.focus();resolve(value);};dialog.querySelector<HTMLButtonElement>('[data-stay]')!.onclick=()=>finish(false);dialog.querySelector<HTMLButtonElement>('[data-discard]')!.onclick=()=>finish(true);dialog.oncancel=event=>{event.preventDefault();finish(false);};document.body.append(dialog);dialog.showModal();dialog.querySelector<HTMLButtonElement>('[data-stay]')!.focus();}).finally(()=>pendingDiscard=null);
  return pendingDiscard;
}
export async function canLeaveForms(root:ParentNode=document){const forms=[...root.querySelectorAll<HTMLFormElement>('form[data-dirty=true]')];if(!forms.length)return true;if(!await askDiscard())return false;for(const form of forms)if(form.isConnected){form.dispatchEvent(new CustomEvent('form-discard'));markForm(form,false);}return true;}
export function bindUnsavedProtection(){
  const observeForms=(root:ParentNode)=>{for(const form of root.querySelectorAll?.<HTMLFormElement>('form')??[])observeForm(form);};
  observeForms(document);
  if(typeof MutationObserver!=='undefined')new MutationObserver(records=>{
    for(const record of records)for(const node of record.addedNodes){
      if(node.nodeType!==1)continue;const element=node as Element;
      if(element.matches('form'))observeForm(element as HTMLFormElement);
      observeForms(element);
    }
  }).observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('focusin',event=>{const form=(event.target as Element).closest<HTMLFormElement>('form');if(form)observeForm(form);});
  const changed=(event:Event)=>{const form=(event.target as Element).closest<HTMLFormElement>('form');if(form)refreshFormState(form);};
  document.addEventListener('input',changed);
  document.addEventListener('change',changed);
  document.addEventListener('reset',event=>{queueMicrotask(()=>{if(!event.defaultPrevented)changed(event);});});
  document.addEventListener('click',event=>{if(event.ctrlKey||event.metaKey||event.shiftKey||event.button!==0)return;const target=(event.target as Element).closest<HTMLElement>('a[href],#admin-mfa-reset');if(!target)return;const link=target as HTMLAnchorElement;if(link.hash==='#content'||link.href===location.href||!document.querySelector('form[data-dirty=true]'))return;event.preventDefault();event.stopImmediatePropagation();void canLeaveForms().then(allow=>{if(allow&&target.isConnected)target.click();});},true);
}
