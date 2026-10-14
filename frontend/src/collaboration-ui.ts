import {html,locale,setText,t,apiError,addTranslations} from './i18n.js';
import {h,icon} from './ui.js';
import {markForm} from './unsaved.js';
import {renderChatAttachments} from './chat-files.js';

addTranslations({'Angeheftet':'Pinned','Nachricht anheften':'Pin message','Anheftung lösen':'Unpin message','Du darfst diese Nachricht nicht anheften.':'You cannot pin this message.','Ungültige Anheftung.':'Invalid pin setting.','Pro Unterhaltung können höchstens 50 Nachrichten angeheftet werden.':'You can pin up to 50 messages per conversation.'});

// New entries use an ascending cursor; refresh loaded entries too so older
// edits and deletion markers remain accurate without replacing the composer.
export async function syncMessageHistory({rows,hasMore,initialized=false,api,before,after}:any){
  const merged=new Map<number,any>(rows.map((row:any)=>[row.id,row]));let total=rows.length;
  const merge=(result:any)=>{for(const row of result.items)merged.set(row.id,row);total=result.total;};
  if(before||!rows.length&&!initialized){const result=await api(before?'?before='+before:'');merge(result);hasMore=result.hasMore;}
  else{
    let cursor=after??rows.at(-1)?.id??0;
    for(;;){const result=await api('?after='+cursor);merge(result);if(!result.hasMore)break;const next=result.items.at(-1)?.id;if(!next||next<=cursor)throw Error(t('Der Nachrichtenverlauf konnte nicht vollständig geladen werden.'));cursor=next;}
    for(let start=0;start<rows.length;start+=200)merge(await api('?ids='+rows.slice(start,start+200).map((row:any)=>row.id).join(',')));
  }
  return {items:[...merged.values()].sort((a,b)=>a.id-b.id),hasMore,total};
}

export function renderMentionText(value:string,mentions:any[]=[]){
  let end=0,out='';for(const m of value.matchAll(/(?<![\w@])@([A-Za-z0-9._-]{3,64})/g)){
    const index=m.index!,token=m[1],known=mentions.find(u=>u.username.toLowerCase()===token.toLowerCase())??mentions.find(u=>u.username.toLowerCase()===token.replace(/[.-]+$/,'').toLowerCase());
    out+=h(value.slice(end,index));out+=known?html`<span class="mention">${h('@'+token.slice(0,known.username.length))}</span>${h(token.slice(known.username.length))}`:h(m[0]);end=index+m[0].length;
  }return out+h(value.slice(end));
}
export function createSendFlow({getText,clear,post}:any){let busy=false,revision=0,draftSaved=false;return {get busy(){return busy;},get draftSaved(){return draftSaved;},changed(){revision++;},async send(){if(busy)throw Error(t('Die Nachricht wird bereits gesendet.'));const value=getText(),start=revision;if(!value.trim())throw Error(t('Bitte einen Text eingeben.'));busy=true;draftSaved=false;try{const result=await post(value);draftSaved=start===revision;if(draftSaved)clear();return result;}finally{busy=false;}}};}
export function renderMessage(row:any,userId:number){
  const date=new Date(row.createdAt).toLocaleString(locale(),{dateStyle:'medium',timeStyle:'short'});
  return html`<article class="message-card${row.author.id===userId?' message-own':''}${row.deleted?' message-deleted':''}" data-message="${row.id}" tabindex="-1"><div class="message-meta"><strong>${h(row.author.displayName)}</strong><time datetime="${h(row.createdAt)}">${h(date)}${row.editedAt&&!row.deleted?t(' · bearbeitet'):''}</time></div>${row.pinned&&!row.deleted?html('<span class="message-pin-label">Angeheftet</span>'):''}${row.deleted||row.text?html`<p class="message-text">${row.deleted?t('Nachricht gelöscht'):renderMentionText(row.text,row.mentions)}</p>`:''}${!row.deleted?renderChatAttachments(row.attachments):''}${!row.deleted&&(row.canEdit||row.canDelete||row.canPin)?html`<div class="message-actions">${row.canPin?html`<button type="button" class="text-link" data-pin-message="${row.id}" aria-pressed="${!!row.pinned}">${row.pinned?t('Anheftung lösen'):t('Nachricht anheften')}</button>`:''}${row.canEdit?html`<button type="button" class="text-link" data-edit-message="${row.id}">Bearbeiten</button>`:''}${row.canDelete?html`<button type="button" class="text-link" data-delete-message="${row.id}">Löschen</button>`:''}</div>`:''}</article>`;
}
export function composer(label=t('Nachricht'),submit=t('Senden'),{editing=false}:{editing?:boolean}={}){
  return html`<form class="message-composer"${editing?'':' data-unsaved-notice="hidden"'}><label class="field"><span>${h(label)}</span><textarea name="text" rows="3" maxlength="4000" required placeholder="Schreibe etwas … Mit @ kannst du jemanden erwähnen."></textarea></label><div class="mention-menu" hidden></div><div class="composer-footer"><button class="btn secondary small" type="button" data-mention-picker>${icon('at')}Person erwähnen</button><small class="muted">Bis zu 4.000 Zeichen</small><button class="btn primary small" type="submit">${icon('send')}${h(submit)}</button></div><p class="form-error" role="alert" hidden></p></form>`;
}
export function liveRoot(ctx:any,root:HTMLElement){return root.isConnected&&ctx.unlocked&&(!root.closest('dialog')||root.closest('dialog').open);}
export function bindComposer(ctx:any,form:any,{post,people,after,afterClear}:any){
  const input=form.querySelector('textarea'),button=form.querySelector('[type=submit]'),error=form.querySelector('.form-error:not([data-chat-file-error])'),menu=form.querySelector('.mention-menu');
  let contacts:any[]=[],loaded=false;
  const flow=createSendFlow({getText:()=>input.value,clear:()=>{if(liveRoot(ctx,form)){input.value='';if(afterClear)afterClear();else markForm(form,false);}},post});
  function suggest(force=false){
    const caret=input.selectionStart,left=input.value.slice(0,caret),match=left.match(/(?:^|\s)@([A-Za-z0-9._-]*)$/);
    if(!match&&!force){menu.hidden=true;return;}
    const prefix=match?.[1].toLowerCase()??'',candidates=contacts.filter(u=>u.username.toLowerCase().startsWith(prefix)||u.displayName.toLowerCase().includes(prefix)).slice(0,8);
    menu.innerHTML=candidates.length?html`<span class="mention-caption">Person auswählen</span>${candidates.map(u=>html`<button type="button" data-mention-id="${u.id}"><strong>${h(u.displayName)}</strong><span>@${h(u.username)}</span></button>`).join('')}`:html('<p class="muted">Keine passende Person gefunden.</p>');menu.hidden=false;
    menu.querySelectorAll('[data-mention-id]').forEach((node:any)=>node.onclick=()=>{
      const person=contacts.find(u=>u.id===Number(node.dataset.mentionId)),start=match?caret-match[1].length-1:caret,token=(match?'':start&&!/\s/.test(input.value[start-1])?' ':'')+'@'+person.username+' ',next=input.value.slice(0,start)+token+input.value.slice(caret);
      if(next.length>4000){ctx.toast(t('Die Nachricht darf höchstens 4.000 Zeichen enthalten.'));return;}input.value=next;input.focus();input.setSelectionRange(start+token.length,start+token.length);input.dispatchEvent(new Event('input',{bubbles:true}));menu.hidden=true;
    });
  }
  async function loadContacts(){if(!loaded){contacts=await people();loaded=true;}if(liveRoot(ctx,form))suggest();}
  input.addEventListener('input',()=>{flow.changed();if(loaded)suggest();else void loadContacts().catch(()=>{});});
  input.addEventListener('keydown',(e:any)=>{if(e.key==='Escape')menu.hidden=true;if(e.key==='ArrowDown'&&!menu.hidden){e.preventDefault();menu.querySelector('button')?.focus();}});
  form.querySelector('[data-mention-picker]').onclick=async()=>{try{if(!loaded){contacts=await people();loaded=true;}if(liveRoot(ctx,form)){suggest(true);menu.querySelector('button')?.focus();}}catch(err){ctx.toast(apiError(err.message));}};
  form.onsubmit=async(event:any)=>{event.preventDefault();if(flow.busy)return;error.hidden=true;button.disabled=true;menu.hidden=true;
    try{const value=await flow.send();if(liveRoot(ctx,form))await after(value,flow.draftSaved);}catch(err){if(liveRoot(ctx,form)){setText(error,apiError(err.message));error.hidden=false;}}finally{if(form.isConnected)button.disabled=false;}
  };
  return flow;
}
export function bindMessageActions(ctx:any,log:HTMLElement,rows:any[],{change,people,reload,pin}:any){
  if(pin)log.querySelectorAll('[data-pin-message]').forEach((button:any)=>button.onclick=async()=>{
    if(button.disabled)return;const row=rows.find(r=>r.id===Number(button.dataset.pinMessage));if(!row||row.deleted||!row.canPin)return;button.disabled=true;
    try{const saved=await pin(row.id,!row.pinned);if(log.isConnected)await reload(saved);}catch(err){ctx.toast(apiError(err.message));}finally{if(button.isConnected)button.disabled=false;}
  });
  log.querySelectorAll('[data-edit-message]').forEach((button:any)=>button.onclick=()=>{
    const row=rows.find(r=>r.id===Number(button.dataset.editMessage)),card=button.closest('[data-message]');
    card.innerHTML=html`${composer(t('Nachricht bearbeiten'),t('Speichern'),{editing:true})}<button type="button" class="text-link" data-cancel-edit>Abbrechen</button>`;card.classList.add('message-edit');const form=card.querySelector('form');form.querySelector('textarea').value=row.text;
    card.querySelector('[data-cancel-edit]').onclick=()=>{markForm(form,false);card.classList.remove('message-edit');void reload();};
    bindComposer(ctx,form,{post:(value:string)=>change(row.id,{text:value},false),people,after:async(value:any,saved:boolean)=>{if(!saved){ctx.toast(t('Gespeichert. Dein neuer Entwurf bleibt erhalten.'));return;}card.classList.remove('message-edit');await reload(value);}});form.querySelector('textarea').focus();
  });
  log.querySelectorAll('[data-delete-message]').forEach((button:any)=>button.onclick=async()=>{
    if(!confirm(t('Diese Nachricht löschen? Im Verlauf bleibt ein Hinweis auf die gelöschte Nachricht.')))return;button.disabled=true;try{const value=await change(Number(button.dataset.deleteMessage),{},true);if(log.isConnected)await reload(value);}catch(err){ctx.toast(apiError(err.message));if(button.isConnected)button.disabled=false;}
  });
}
