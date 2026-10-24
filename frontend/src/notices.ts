import {t,addTranslations} from './i18n.js';
import {icon} from './ui.js';
addTranslations({'Statusmeldungen':'Status messages','Meldung schließen':'Dismiss message'});
const selector='.form-error,.currency-menu-error,.timeline-error,.unsaved-status,[data-unsaved],#toast-region';
type Notice={kind:'error'|'unsaved'|'success';message:string;actions:HTMLButtonElement[]};
export function readNotice(source:HTMLElement):Notice|null{
 if(!source.isConnected||source.hidden||source.closest('[hidden]')||source.closest('dialog:not([open])'))return null;
 const unsaved=source.matches('.unsaved-status,[data-unsaved]'),form=source.closest('form'),toast=source.id==='toast-region';
 if(unsaved&&(form?.dataset.dirty!=='true'||form.dataset.unsavedNotice==='hidden'))return null;
 if(toast&&!source.classList.contains('visible'))return null;
 const actions=Array.from(source.querySelectorAll<HTMLButtonElement>('button'));
 if(!toast&&source.querySelectorAll('button,a,input,select,textarea').length)return null;
 let message=source.textContent?.trim()??'';
 if(toast&&actions.length){const copy=source.cloneNode(true) as HTMLElement;copy.querySelectorAll('button').forEach(button=>button.remove());message=copy.textContent?.trim()??'';}
 return message?{kind:unsaved?'unsaved':toast?'success':'error',message,actions}:null;
}
const bound=new WeakMap<Document,object>();
export function bindNotices(doc:Document=document){
 if(bound.has(doc)||!doc.body||typeof MutationObserver==='undefined')return bound.get(doc);
 const stack=doc.createElement('div');stack.id='notice-stack';stack.className='notice-stack';stack.setAttribute('popover','manual');stack.setAttribute('role','region');stack.setAttribute('aria-label',String(t('Statusmeldungen')));doc.body.append(stack);
 const sources=new Set<HTMLElement>(),cards=new Map<HTMLElement|string,any>(),dismissed=new WeakSet<HTMLElement>();let queued=false;
 function place(){
  const dialogs=Array.from(doc.querySelectorAll<HTMLDialogElement>('dialog[open]')),host=dialogs.at(-1)??doc.body;
  if(stack.parentElement!==host){if(typeof stack.hidePopover==='function'&&stack.matches(':popover-open'))stack.hidePopover();host.append(stack);}
  if(typeof stack.showPopover==='function'){try{if(stack.childElementCount&&!stack.matches(':popover-open'))stack.showPopover();else if(!stack.childElementCount&&stack.matches(':popover-open'))stack.hidePopover();}catch{/* Fixed positioning also works without the Popover API. */}}
 }
 function remove(entry:any){entry.card.classList.add('notice-leaving');setTimeout(()=>{entry.card.remove();place();},180);}
 function render(key:HTMLElement|string,notice:Notice,source:HTMLElement){
  let entry=cards.get(key);const signature=JSON.stringify([notice.kind,notice.message,notice.actions.map(button=>[button.textContent,button.disabled])]);
  if(entry){entry.source=source;if(entry.signature===signature&&notice.actions.length===entry.actions.length&&notice.actions.every((button,index)=>button===entry.actions[index]))return;}
  else{const card=doc.createElement('div');card.className='notice-card';entry={card};cards.set(key,entry);stack.append(card);}
  entry.signature=signature;entry.source=source;entry.actions=[...notice.actions];const card:HTMLElement=entry.card;card.dataset.noticeKind=notice.kind;card.setAttribute('role',notice.kind==='error'?'alert':'status');
  card.replaceChildren();const symbol=doc.createElement('span');symbol.className='notice-symbol';symbol.innerHTML=String(icon(notice.kind==='error'?'info':notice.kind==='unsaved'?'edit':'check'));card.append(symbol);
  const body=doc.createElement('div');body.className='notice-body';const message=doc.createElement('p');message.dataset.noticeMessage='';message.textContent=notice.message;body.append(message);card.append(body);
  for(const original of notice.actions){const action=doc.createElement('button');action.type='button';action.className='btn secondary small notice-action';action.textContent=original.textContent;action.disabled=original.disabled;action.onclick=()=>{if(original.isConnected&&!original.disabled)original.click();};body.append(action);}
  if(notice.kind!=='unsaved'){
   const close=doc.createElement('button');close.type='button';close.className='icon-btn notice-close';close.setAttribute('aria-label',String(t('Meldung schließen')));close.innerHTML=String(icon('close'));close.disabled=notice.actions.some(button=>button.disabled);
   close.onclick=()=>{const origin=entry.source;if(origin.id==='toast-region')origin.classList.remove('visible');else{dismissed.add(origin);enqueue();}};card.append(close);
  }
 }
 function refresh(){
  queued=false;const wanted=new Set<HTMLElement|string>();
  for(const source of sources){if(!source.isConnected){sources.delete(source);continue;}const notice=readNotice(source);if(!notice||dismissed.has(source))continue;
   if(!source.classList.contains('notice-source')){source.classList.add('notice-source');source.setAttribute('aria-hidden','true');}const key=notice.kind==='unsaved'?'unsaved':source;if(wanted.has(key))continue;wanted.add(key);render(key,notice,source);
  }
  for(const [key,entry]of cards)if(!wanted.has(key)){cards.delete(key);remove(entry);}place();
 }
 const enqueue=()=>{if(!queued){queued=true;queueMicrotask(refresh);}};
 function discover(element:Element){if(element.closest('#notice-stack'))return;let found=false;
  if(element.matches(selector)){sources.add(element as HTMLElement);found=true;}element.querySelectorAll<HTMLElement>(selector).forEach(source=>{sources.add(source);found=true;});return found;
 }
 discover(doc.body);
 new MutationObserver(records=>{
  let relevant=false;
  for(const record of records){const target=record.target.nodeType===1?record.target as Element:record.target.parentElement;if(!target||target.closest('#notice-stack'))continue;
   const source=target.closest<HTMLElement>(selector);if(source){sources.add(source);if(record.type!=='attributes'||record.attributeName==='hidden')dismissed.delete(source);relevant=true;}
   if(record.type==='attributes'&&(record.attributeName==='open'||record.attributeName==='data-dirty'||record.attributeName==='data-unsaved-notice'||record.attributeName==='hidden'))relevant=true;
   for(const node of record.addedNodes)if(node.nodeType===1)relevant=discover(node as Element)||relevant;
   if(record.removedNodes.length)relevant=true;
  }
  if(relevant)enqueue();
 }).observe(doc.documentElement,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['hidden','class','open','disabled','data-dirty','data-unsaved-notice']});
 doc.defaultView?.addEventListener('languagechange',()=>{stack.setAttribute('aria-label',String(t('Statusmeldungen')));for(const entry of cards.values())entry.signature='';enqueue();});
 const controller={refresh:enqueue};bound.set(doc,controller);enqueue();return controller;
}
