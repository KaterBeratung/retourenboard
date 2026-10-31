import {html,locale,setText,t,apiError,LocalizedText,addTranslations} from './i18n.js';
import {h,icon,openDialog} from './forms.js';
import {captureAuthContext} from './auth-context.js';
import {playIconSequence} from './icon-motion.js';

addTranslations({'Ein Kommentar zu einem Geräteauftrag wartet auf dich.':'A comment on a device order is waiting for you.'});

// Match known server event types and their fixed copy. Identifiers, unknown
// notification bodies and message previews are opaque user content.
export function notificationCopy(item){
  const titles={newReturn:['Neue Retoure','Retouren importiert'],overdue:['Retoure überfällig'],backupError:['Sicherung fehlgeschlagen'],returnMention:['In einem Kommentar erwähnt'],disposalMention:['In einem Kommentar erwähnt'],chatMention:['Im Chat erwähnt'],chatMessage:['Neue Chatnachricht']};
  const title=titles[item.kind]?.includes(item.title)?t(item.title):item.title;
  let message=item.message;
  if(item.kind==='backupError'&&message==='Bitte die Sicherungen im Adminbereich prüfen.')message=t(message);
  if(item.kind==='disposalMention'&&message==='Ein Kommentar zu einem Geräteauftrag wartet auf dich.')message=t(message);
  if(item.kind==='returnMention'&&message==='Ein Kommentar zu einer Retoure wartet auf dich.')message=t(message);
  if(['chatMention','chatMessage'].includes(item.kind)&&message==='Öffne die Unterhaltung, um die Nachricht zu lesen.')message=t(message);
  if(item.kind==='newReturn'){
    const count=String(message).match(/^(\d+) Retouren wurden importiert\.$/),created=String(message).match(/^(.+) wurde angelegt\.$/s);
    if(count)message=new LocalizedText(item.message,`${count[1]} returns were imported.`);
    else if(created)message=new LocalizedText(item.message,`${created[1]} was created.`);
  }
  if(item.kind==='overdue'){const overdue=String(message).match(/^(.+) hat die Bearbeitungsfrist überschritten\.$/s);if(overdue)message=new LocalizedText(item.message,`${overdue[1]} has exceeded its processing deadline.`);}
  return {title,message};
}

const notificationStates=new WeakMap<HTMLButtonElement,{count:number;current:()=>boolean}>();
// New unread items: ring the bell once and let the counter pop; silent without normal motion.
export function announceUnread(button:HTMLElement,count:HTMLElement){
  if(document.documentElement.dataset.motion!=='normal')return;
  playIconSequence(button.querySelector('svg.icon'));
  count.classList.remove('count-pop');void count.offsetWidth;count.classList.add('count-pop');
  const done=()=>{clearTimeout(timer);count.classList.remove('count-pop');};
  const timer=setTimeout(done,500);
  count.addEventListener('animationend',done,{once:true});
}
export async function refreshNotifications(ctx){
  const existing=document.querySelector<HTMLButtonElement>('#inbox-button');
  if(!ctx.unlocked){if(existing){existing.hidden=true;notificationStates.delete(existing);}return;}
  const button=existing??document.createElement('button');
  if(!existing){button.id='inbox-button';button.className='btn secondary small';button.innerHTML=html`${icon('bell')}<span class="inbox-button-label">Nachrichten</span><span class="inbox-count" aria-hidden="true" hidden></span>`;document.querySelector('.topbar-right').prepend(button);}
  const previous=notificationStates.get(button),state={count:previous?.current()?previous.count:0,current:captureAuthContext(ctx)};
  notificationStates.set(button,state);
  const render=(unread:number)=>{
    const increased=unread>state.count;
    state.count=unread;
    const count=button.querySelector<HTMLElement>('.inbox-count'),label=button.querySelector<HTMLElement>('.inbox-button-label'),text=String(unread>99?'99+':unread);
    if(count.textContent!==text)setText(count,text);
    if(count.hidden!==(unread===0))count.hidden=unread===0;
    if(increased)announceUnread(button,count);
    if(label.textContent!==String(t('Nachrichten')))setText(label,t('Nachrichten'));
    const description=String(t`Nachrichten · ${unread} ungelesen`);if(button.getAttribute('aria-label')!==description)button.setAttribute('aria-label',description);
  };
  if(button.hidden)button.hidden=false;
  render(state.count);button.onclick=()=>openNotifications(ctx);
  try{const inbox=await ctx.api('/api/notifications');if(ctx.unlocked&&state.current()&&notificationStates.get(button)===state&&document.querySelector('#inbox-button')===button)render(Number.isSafeInteger(inbox.unread)&&inbox.unread>0?inbox.unread:0);}catch{}
}

export function openNotifications(ctx){
  const dialog:HTMLDialogElement=openDialog({title:t('Nachrichten'),subtitle:t('Hinweise, Chatnachrichten und Erwähnungen an einem Ort.'),body:html('<div class="dialog-body" id="inbox-content" aria-live="polite">Nachrichten werden geladen …</div><div class="dialog-footer"><button class="btn secondary" id="inbox-read-all">Alle als gelesen markieren</button><button class="btn secondary" data-close>Schließen</button></div>')});
  dialog.classList.add('inbox-dialog');
  const content=dialog.querySelector<HTMLElement>('#inbox-content'),readAll=dialog.querySelector<HTMLButtonElement>('#inbox-read-all');
  const active=()=>dialog.open&&content.isConnected;
  let page=1;
  const load=async()=>{
    try{
      const inbox=await ctx.api('/api/notifications?page='+page);if(!active())return;
      readAll.disabled=inbox.unread===0;
      content.innerHTML=inbox.items.length?html`<div class="inbox-list">${inbox.items.map(n=>html`<article class="inbox-item ${n.readAt?'':'inbox-item-unread'}" data-notification="${n.id}">
        <div class="inbox-item-heading"><h3>${h(notificationCopy(n).title)}</h3><span class="inbox-state">${n.readAt?t('Gelesen'):t('Ungelesen')}</span></div>
        <p class="inbox-message">${h(notificationCopy(n).message)}</p>
        <time class="inbox-time" datetime="${h(n.createdAt)}">${new Date(n.createdAt).toLocaleString(locale(),{dateStyle:'medium',timeStyle:'short'})}</time>
        <div class="inbox-actions"><a class="btn secondary small" href="${h(n.href)}" aria-label="${h(t('Öffnen'))}" title="${h(t('Öffnen'))}">${icon('arrow')}<span class="inbox-action-label">Öffnen</span></a>${!n.readAt?html`<button type="button" class="btn secondary small" data-notification-read="${n.id}" aria-label="${h(t('Als gelesen markieren'))}" title="${h(t('Als gelesen markieren'))}">${icon('check')}<span class="inbox-action-label">Als gelesen markieren</span></button>`:''}</div>
      </article>`).join('')}</div>${inbox.total>25?html`<div class="inbox-pagination"><button class="btn secondary small" id="inbox-prev" ${page===1?'disabled':''}>Zurück</button><span>Seite ${page} von ${Math.ceil(inbox.total/25)}</span><button class="btn secondary small" id="inbox-next" ${page*25>=inbox.total?'disabled':''}>Weiter</button></div>`:''}`:html`<div class="inbox-empty">${icon('bell')}<h3>Noch keine Nachrichten</h3><p>Neue Retouren und Hinweise erscheinen hier.</p></div>`;
      // Opening an item follows its link, marks it as read and closes the inbox; a click anywhere on the item does the same as its "Öffnen" link.
      content.querySelectorAll<HTMLAnchorElement>('.inbox-actions a').forEach(link=>link.onclick=event=>{
        if(event.defaultPrevented||event.ctrlKey||event.metaKey||event.shiftKey||event.button!==0)return;
        const card=link.closest<HTMLElement>('[data-notification]');
        if(card?.dataset.notification&&card.classList.contains('inbox-item-unread'))void ctx.api('/api/notifications/'+card.dataset.notification+'/read',{method:'POST',body:{}}).then(()=>refreshNotifications(ctx)).catch(()=>{});
        dialog.close();
      });
      content.querySelectorAll<HTMLElement>('.inbox-item').forEach(card=>card.addEventListener('click',event=>{
        if((event.target as Element).closest('a,button')||String(window.getSelection()??'').length)return;
        card.querySelector<HTMLAnchorElement>('.inbox-actions a')?.click();
      }));
      content.querySelectorAll<HTMLButtonElement>('[data-notification-read]').forEach(button=>button.onclick=async()=>{
        button.disabled=true;
        try{const id=button.dataset.notificationRead;await ctx.api('/api/notifications/'+id+'/read',{method:'POST',body:{}});await load();if(active())content.querySelector<HTMLAnchorElement>(`[data-notification="${id}"] a`)?.focus();await refreshNotifications(ctx);}catch(err){ctx.toast(apiError(err.message));if(button.isConnected)button.disabled=false;}
      });
      content.querySelector('#inbox-prev')?.addEventListener('click',()=>{page--;void load();});
      content.querySelector('#inbox-next')?.addEventListener('click',()=>{page++;void load();});
    }catch(err){if(active())setText(content,apiError(err.message));}
  };
  readAll.onclick=async()=>{
    readAll.disabled=true;
    try{await ctx.api('/api/notifications/all/read',{method:'POST',body:{}});await load();await refreshNotifications(ctx);}catch(err){ctx.toast(apiError(err.message));if(active())readAll.disabled=false;}
  };
  void load();
}
