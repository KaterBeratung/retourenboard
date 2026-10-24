import {html,setText,t,apiError,addTranslations} from './i18n.js';
import {loadingSkeleton} from './presentation.js';
import {h,icon,openDialog} from './ui.js';
import {markForm,canLeaveForms} from './unsaved.js';
import {composer,bindComposer,renderMessage,channelDisplayName,bindMessageActions,liveRoot,syncMessageHistory} from './collaboration-ui.js';
import {chatFileControls,bindChatFiles} from './chat-files.js';
type PanelOptions={narrow?:()=>boolean;isCurrentLink?:(link:HTMLAnchorElement)=>boolean;shown?:()=>void};

/** Changes presentation only: the conversation, draft and file inputs stay mounted. */
export function bindChatPanels(workspace:HTMLElement,{narrow=()=>typeof matchMedia==='function'&&matchMedia('(max-width:1000px)').matches,isCurrentLink=()=>false,shown=()=>{}}:PanelOptions={}){
 let pane:'list'|'conversation'='conversation';
 function showDirectory(){if(!workspace.isConnected)return;pane='list';workspace.setAttribute('data-chat-pane',pane);if(narrow())workspace.querySelector<HTMLElement>('.chat-search>span')?.focus?.({preventScroll:true});}
 function showConversation(focus=false){if(!workspace.isConnected)return;const resumed=pane==='list';pane='conversation';workspace.setAttribute('data-chat-pane',pane);if(resumed)shown();if(focus&&narrow())workspace.querySelector<HTMLElement>('.chat-conversation-heading h2')?.focus?.({preventScroll:true});}
 showConversation();
 workspace.addEventListener('click',event=>{
  if(!workspace.isConnected||event.defaultPrevented||event.button>0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;const target=event.target as Element;
  if(target.closest('[data-chat-back]'))showDirectory();
  else if(target.closest('[data-chat-resume]'))showConversation(true);
  else{const link=target.closest<HTMLAnchorElement>('a.chat-channel');if(link&&isCurrentLink(link)){event.preventDefault();showConversation(true);}}
 });
 return{showDirectory,showConversation,isConversationVisible:()=>!narrow()||pane==='conversation'};
}


addTranslations({'Nachricht schreiben …':'Write a message …','Zurück zu den Unterhaltungen':'Back to conversations','Unterhaltung fortsetzen':'Resume conversation','Nachrichten durchsuchen':'Search messages','In dieser Unterhaltung suchen …':'Search this conversation …','Suchen':'Search','Suche schließen':'Close search','Suchergebnisse':'Search results','Suche läuft …':'Searching …','Keine passenden Nachrichten.':'No matching messages.','Weitere Treffer laden':'Load more results','Nachricht im Verlauf anzeigen':'Show message in conversation','Angeheftete Nachrichten':'Pinned messages','Suchbegriff:':'Search term:','· Geladene Treffer:':'· Loaded results:','Bitte einen Suchbegriff mit höchstens 200 Zeichen eingeben.':'Enter a search term with up to 200 characters.','Bitte einen Text mit 1–200 Zeichen eingeben.':'Enter text with 1–200 characters.'});

export function renderChat(ctx:any){
  if(!ctx.can('chatRead'))return html('<div class="empty-state"><h1>Chat nicht freigegeben</h1><p>Ein Administrator kann dir unter Benutzerkonten Zugriff geben.</p></div>');
  return html`<div class="page-heading chat-page-heading"><div><div class="eyebrow">IM TEAM VERBUNDEN</div><h1>Im Austausch<span class="heading-dot">.</span></h1><p>Gemeinsam klären. Persönlich besprechen.</p></div><div class="heading-actions">${ctx.can('chatSend')?html`<button class="btn secondary" id="chat-direct" aria-label="Privatnachricht" title="Privatnachricht">${icon('chat')}Privatnachricht</button>`:''}${ctx.can('chatGroupsCreate')?html`<button class="btn primary" id="chat-group" aria-label="Neue Gruppe" title="Neue Gruppe">${icon('users')}Neue Gruppe</button>`:''}</div></div><section class="panel chat-layout" id="chat-workspace"><button class="icon-btn chat-back" type="button" data-chat-back aria-label="Zurück zu den Unterhaltungen" title="Zurück zu den Unterhaltungen">${icon('arrowLeft')}</button><button class="btn secondary chat-resume" type="button" data-chat-resume>${icon('chat')}Unterhaltung fortsetzen</button><aside class="chat-list-pane"><label class="field chat-search"><span tabindex="-1" role="heading" aria-level="2">Unterhaltungen</span><input type="search" id="chat-search" placeholder="Unterhaltung suchen …"></label><nav class="chat-channel-list" aria-label="Unterhaltungen">${loadingSkeleton('channels')}</nav></aside><div class="chat-conversation"><div class="message-empty">${icon('chat')}<h2>Ein Gespräch beginnt hier.</h2><p>Wähle den Teamchat, eine Gruppe oder eine private Unterhaltung.</p></div></div></section>`;
}
export function bindChat(ctx:any,root:HTMLElement){
  const workspace=root.querySelector<HTMLElement>('#chat-workspace');if(!workspace)return;
  const list=workspace.querySelector<HTMLElement>('.chat-channel-list'),pane=workspace.querySelector<HTMLElement>('.chat-conversation'),search=root.querySelector<HTMLInputElement>('#chat-search');
  let channels:any[]=[],selected=0,current:any=null,rows:any[]=[],generation=0,revision=0,syncedThrough=0,refreshing:number|null=null,opening=0,timer:any,hasMore=false,loaded=false,paintedLog:HTMLElement|null=null,paintedMarkup:string|null=null;
  let paintedListMarkup:string|null=null,paintedHeaderMarkup:string|null=null;
  const panels=bindChatPanels(workspace,{shown:()=>paintMessages(),isCurrentLink:link=>!!current&&Number(link.getAttribute('href')?.match(/#channel-(\d+)$/)?.[1])===selected});
  // The application creates this controller only after its navigation guard
  // accepts the hash. A pending browser Back decision must not change chats.
  const initial=location.hash.match(/^#channel-(\d+)$/);let requestedChannel=initial?Number(initial[1]):0;
  const authGeneration=ctx.authGeneration,userId=ctx.session.user.id;
  const active=()=>liveRoot(ctx,workspace)&&ctx.can('chatRead')&&authGeneration===ctx.authGeneration&&userId===ctx.session.user?.id;
  let searchTerm='',searchRows:any[]=[],searchSequence=0,searchCursor:number|null=null,searchHasMore=false,searchMarkup:string|null=null,pinsRows:any[]=[],pinsEnabled=false,pinsSequence=0;const localChanges=new Map<number,any>();
  let directory:any[]=[];const people=async()=>{directory=await ctx.api('/api/collaboration/users');return current?.visibility==='private'?directory.filter(u=>current.members.some(m=>m.id===u.id)):directory;};
  function renderList(){if(!active()||document.querySelector('.unsaved-dialog[open]'))return;const filtered=channels.filter(c=>String(channelDisplayName(c)).toLowerCase().includes(search.value.toLowerCase())),listMarkup=filtered.length?filtered.map(c=>html`<a class="chat-channel${c.id===selected?' selected':''}" href="/chat#channel-${c.id}" ${c.id===selected?'aria-current="page"':''}><span class="chat-channel-symbol">${icon(c.kind==='direct'?'chat':c.kind==='public'?'globe':'users')}</span><span class="chat-channel-copy"><strong>${h(channelDisplayName(c))}</strong><small>${c.kind==='direct'?t('Privatnachricht'):c.visibility==='private'?t('Geschlossene Gruppe'):c.kind==='public'?t('Für alle'):t('Öffentliche Gruppe')}</small>${c.lastMessage?html`<span>${h(c.lastMessage.text)}</span>`:''}</span>${c.unread?html`<span class="count-pill">${c.unread>99?'99+':c.unread}</span>`:''}</a>`).join(''):html('<p class="muted">Keine passende Unterhaltung.</p>');
    // Compare generated markup with itself: browsers normalize SVG and spacing
    // when reading innerHTML, which would otherwise replace unchanged links.
    if(paintedListMarkup===listMarkup)return;
    const focused=document.activeElement as HTMLElement,focusedHref=focused&&list.contains(focused)?focused.closest<HTMLAnchorElement>('a.chat-channel')?.getAttribute('href'):null;
    list.innerHTML=listMarkup;paintedListMarkup=listMarkup;
    if(focusedHref)Array.from(list.querySelectorAll<HTMLAnchorElement>('a.chat-channel')).find(link=>link.getAttribute('href')===focusedHref)?.focus({preventScroll:true});
  }
  function paintMessages(force=false){if(!active()||!current||!panels.isConversationVisible())return;const log=pane.querySelector<HTMLElement>('.chat-message-log');if(!log||log.querySelector('.message-edit'))return;
    pane.querySelector<HTMLButtonElement>('#chat-older').hidden=!hasMore;
    const markup=rows.length?rows.map(r=>renderMessage(r,ctx.session.user.id)).join(''):html('<div class="message-empty"><h3>Noch keine Nachrichten.</h3><p>Beginne die Unterhaltung.</p></div>');
    if(!force&&paintedLog===log&&paintedMarkup===markup)return;
    const bottom=log.scrollHeight-log.scrollTop-log.clientHeight<100,previous=log.scrollHeight;
    log.innerHTML=markup;paintedLog=log;paintedMarkup=markup;
    bindActions(log,rows);
    log.scrollTop=bottom||!loaded?log.scrollHeight:log.scrollTop+log.scrollHeight-previous;loaded=true;
  }
  function savedMessage(saved:any){
    if(!saved)return;revision++;localChanges.set(saved.id,saved);rows=rows.map(row=>row.id===saved.id?saved:row);searchRows=searchRows.map(row=>row.id===saved.id?saved:row).filter(row=>!row.deleted);pinsRows=pinsRows.filter(row=>row.id!==saved.id);
    if(saved.pinned&&!saved.deleted)pinsRows.unshift(saved);searchMarkup=null;paintMessages(true);paintSearch();paintPins();
  }
  function bindActions(log:HTMLElement,items:any[]){const epoch=generation;
    bindMessageActions(ctx,log,items,{people,change:(n:number,body:any,remove:boolean)=>ctx.api('/api/chat/messages/'+n,{method:remove?'DELETE':'PUT',body}),pin:(n:number,pinned:boolean)=>ctx.api('/api/chat/messages/'+n+'/pin',{method:'PUT',body:{pinned}}),reload:(saved:any)=>{if(!active()||epoch!==generation)return;if(saved)savedMessage(saved);else{paintedMarkup=null;searchMarkup='';paintMessages();paintSearch();}return refresh();}});
  }
  function lookupMarkup(){return html`<section class="chat-message-search" id="chat-message-search-panel" aria-label="Nachrichten durchsuchen" hidden><form id="chat-message-search-form" data-filter-form="true" role="search"><label class="field"><span class="sr-only">Nachrichten durchsuchen</span><input id="chat-message-search-input" name="q" type="search" maxlength="200" placeholder="In dieser Unterhaltung suchen …" autocomplete="off"></label><button class="icon-btn" type="submit" data-chat-search-submit aria-label="Suchen" title="Suchen">${icon('search')}</button><button class="icon-btn" type="button" data-chat-search-clear aria-label="Suche schließen" title="Suche schließen">${icon('close')}</button></form><p class="chat-search-status" data-chat-search-status role="status" hidden></p><div class="chat-search-results" data-chat-search-results aria-label="Suchergebnisse" hidden></div><button class="btn secondary small" type="button" data-chat-search-more hidden>Weitere Treffer laden</button></section><details class="chat-pins" data-chat-pins hidden><summary data-chat-pins-summary>Angeheftet</summary><div class="chat-pins-list" data-chat-pins-list aria-label="Angeheftete Nachrichten"></div></details>`;}
  function paintSearch(){const results=pane.querySelector<HTMLElement>('[data-chat-search-results]');if(!results||!searchTerm||results.querySelector('.message-edit'))return;
    const markup=searchRows.map(row=>renderMessage(row,userId).replace('</article>',html`<button type="button" class="text-link chat-show-message" data-message-jump="${row.id}">Nachricht im Verlauf anzeigen</button></article>`)).join('');
    if(markup!==searchMarkup){results.innerHTML=markup;searchMarkup=markup;bindActions(results,searchRows);bindJumps(results);}
    results.hidden=false;const more=pane.querySelector<HTMLButtonElement>('[data-chat-search-more]');if(more)more.hidden=!searchHasMore;
  }
  function paintPins(){const area=pane.querySelector<HTMLElement>('[data-chat-pins]'),list=pane.querySelector<HTMLElement>('[data-chat-pins-list]'),summary=pane.querySelector<HTMLElement>('[data-chat-pins-summary]');if(!area||!list)return;
    pinsRows=pinsRows.filter(row=>!row.deleted);area.hidden=!pinsRows.length;
    if(summary)summary.innerHTML=html`<span>Angeheftet</span><span class="count-pill">${pinsRows.length}</span>`;
    const markup=pinsRows.map(row=>html`<div class="chat-pin-item"><button type="button" class="chat-pin-preview" data-message-jump="${row.id}" title="Nachricht im Verlauf anzeigen"><strong>${h(row.author.displayName)}</strong><span>${h((row.text||row.attachments?.[0]?.originalName||'').slice(0,180))}${row.text?.length>180?'…':''}</span></button>${row.canPin?html`<button type="button" class="text-link" data-pin-message="${row.id}" aria-pressed="true">Anheftung lösen</button>`:''}</div>`).join('');
    if(list.innerHTML!==markup){list.innerHTML=markup;bindActions(list,pinsRows);bindJumps(list);}
  }
  function bindJumps(area:HTMLElement){area.querySelectorAll<HTMLButtonElement>('[data-message-jump]').forEach(button=>button.onclick=()=>void showMessage(Number(button.dataset.messageJump)));}
  async function showMessage(messageId:number){const epoch=generation,n=selected,startRevision=revision;
    try{if(!rows.some(row=>row.id===messageId)){const page=await ctx.api(`/api/chat/channels/${n}/messages?before=${messageId+1}`);if(!active()||epoch!==generation||startRevision!==revision)return;const oldest=rows[0]?.id??Infinity;rows=[...new Map([...rows,...page.items].map(row=>[row.id,row])).values()].sort((a:any,b:any)=>a.id-b.id);if(page.items[0]?.id<oldest)hasMore=page.hasMore;paintMessages();}
      if(!active()||epoch!==generation)return;closeSearch();const card=pane.querySelector<HTMLElement>(`.chat-message-log [data-message="${messageId}"]`);card?.scrollIntoView({block:'center',behavior:'auto'});card?.focus({preventScroll:true});
    }catch(err){if(active()&&epoch===generation)ctx.toast(apiError(err.message));}
  }
  function setSearchOpen(open:boolean,restoreFocus=false){
    const panel=pane.querySelector<HTMLElement>('#chat-message-search-panel'),toggle=pane.querySelector<HTMLButtonElement>('[data-chat-search-toggle]');
    if(panel)panel.hidden=!open;toggle?.setAttribute('aria-expanded',String(open));
    if(open)pane.querySelector<HTMLInputElement>('#chat-message-search-input')?.focus();
    else if(restoreFocus)toggle?.focus();
  }
  function closeSearch(){clearSearch(false);setSearchOpen(false,true);}
  function clearSearch(focus=true){searchSequence++;searchTerm='';searchRows=[];searchCursor=null;searchHasMore=false;searchMarkup='';const input=pane.querySelector<HTMLInputElement>('#chat-message-search-input');if(input)input.value='';const results=pane.querySelector<HTMLElement>('[data-chat-search-results]');if(results)results.innerHTML='';for(const selector of ['[data-chat-search-results]','[data-chat-search-status]','[data-chat-search-more]']){const node=pane.querySelector<HTMLElement>(selector);if(node)node.hidden=true;}if(focus)input?.focus();}
  async function searchMessages(append=false){const input=pane.querySelector<HTMLInputElement>('#chat-message-search-input'),status=pane.querySelector<HTMLElement>('[data-chat-search-status]'),more=pane.querySelector<HTMLButtonElement>('[data-chat-search-more]');if(!input||!status||!active())return;
    const query=append?searchTerm:input.value.trim();if(!query){clearSearch();return;}if(query.length>200){setText(status,t('Bitte einen Suchbegriff mit höchstens 200 Zeichen eingeben.'));status.hidden=false;return;}if(append&&(!searchHasMore||more?.disabled))return;
    const epoch=generation,n=selected,sequence=++searchSequence,startRevision=revision;searchTerm=query;status.hidden=false;setText(status,t('Suche läuft …'));if(more)more.disabled=true;
    try{const result=await ctx.api(`/api/chat/channels/${n}/search?q=${encodeURIComponent(query)}${append?'&before='+searchCursor:''}`);if(!active()||epoch!==generation||sequence!==searchSequence)return;
      // A local mutation has newer content than this request; merge it before
      // painting so a delayed search cannot resurrect a deletion or old pin.
      const local=new Map([...rows.map(row=>[row.id,row] as [number,any]),...localChanges]);const items=result.items.map(row=>startRevision!==revision&&local.has(row.id)?local.get(row.id):row).filter(row=>!row.deleted);
      searchRows=append?[...new Map([...searchRows,...items].map(row=>[row.id,row])).values()]:items;searchHasMore=result.hasMore;searchCursor=result.nextBefore;paintSearch();setText(status,searchRows.length?t`Suchbegriff: ${query} · Geladene Treffer: ${searchRows.length}`:t('Keine passenden Nachrichten.'));
    }catch(err){if(active()&&epoch===generation&&sequence===searchSequence){setText(status,apiError(err.message));status.hidden=false;}}
    finally{if(active()&&epoch===generation&&sequence===searchSequence&&more)more.disabled=false;}
  }
  function bindLookup(){const form=pane.querySelector<HTMLFormElement>('#chat-message-search-form'),input=pane.querySelector<HTMLInputElement>('#chat-message-search-input');if(form)form.onsubmit=event=>{event.preventDefault();return searchMessages();};const close=pane.querySelector<HTMLButtonElement>('[data-chat-search-clear]');if(close)close.onclick=closeSearch;const more=pane.querySelector<HTMLButtonElement>('[data-chat-search-more]');if(more)more.onclick=()=>searchMessages(true);input?.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();closeSearch();}});paintPins();}
  async function refreshLookup(epoch:number,startRevision:number,n:number){
    const sequence=++pinsSequence,searchToken=searchSequence,ids=searchRows.filter(row=>!rows.some(current=>current.id===row.id)).map(row=>row.id);
    const snapshots=[];for(let start=0;start<ids.length;start+=200)snapshots.push(ctx.api(`/api/chat/channels/${n}/messages?ids=${ids.slice(start,start+200).join(',')}`));
    const [pins,...pages]=await Promise.all([pinsEnabled?ctx.api(`/api/chat/channels/${n}/pins`):null,...snapshots]);
    if(!active()||epoch!==generation||startRevision!==revision||sequence!==pinsSequence)return;
    if(pins){pinsRows=pins.items;paintPins();}if(searchToken===searchSequence&&searchTerm){const fresh=new Map([...rows,...pages.flatMap(page=>page.items)].map(row=>[row.id,row]));searchRows=searchRows.map(row=>fresh.get(row.id)??row).filter(row=>!row.deleted&&row.text.normalize('NFKC').toLowerCase().includes(searchTerm.normalize('NFKC').toLowerCase()));paintSearch();}
  }
  function header(c:any){return html`<div class="chat-conversation-heading"><div><h2 tabindex="-1" title="${h(channelDisplayName(c))}">${h(channelDisplayName(c))}</h2><p>${c.kind==='direct'?t('Nur für euch beide'):c.visibility==='private'?t`Geschlossene Gruppe · ${c.members.length} Personen`:c.kind==='public'?t('Für alle angemeldeten Personen'):t`Öffentliche Gruppe · ${c.members.length} Mitglieder`}</p></div><div class="chat-header-actions"><button class="icon-btn chat-search-toggle" type="button" data-chat-search-toggle aria-label="Nachrichten durchsuchen" title="Nachrichten durchsuchen" aria-controls="chat-message-search-panel" aria-expanded="false">${icon('search')}</button>${c.canManage?html`<button class="icon-btn" id="chat-manage" aria-label="Gruppe verwalten" title="Gruppe verwalten">${icon('settings')}</button>`:''}${c.kind==='group'&&!c.joined&&c.visibility==='public'?html`<button class="btn secondary small" id="chat-join" aria-label="Beitreten" title="Beitreten">${icon('plus')}<span class="chat-action-label">Beitreten</span></button>`:''}${c.kind==='group'&&c.joined&&c.ownerId!==ctx.session.user.id?html`<button class="btn secondary small" id="chat-leave" aria-label="Verlassen" title="Verlassen">${icon('logout')}<span class="chat-action-label">Verlassen</span></button>`:''}</div></div>`;}
  function bindHeader(){const toggle=pane.querySelector<HTMLButtonElement>('[data-chat-search-toggle]');if(toggle){toggle.setAttribute('aria-expanded',String(pane.querySelector<HTMLElement>('#chat-message-search-panel')?.hidden===false));toggle.addEventListener('click',()=>{if(pane.querySelector<HTMLElement>('#chat-message-search-panel')?.hidden)setSearchOpen(true);else closeSearch();});}pane.querySelector('#chat-manage')?.addEventListener('click',()=>void groupDialog(current));pane.querySelector('#chat-join')?.addEventListener('click',()=>void membership('join'));pane.querySelector('#chat-leave')?.addEventListener('click',()=>void membership('leave'));}
  function updateHeader(){const heading=pane.querySelector('.chat-conversation-heading');if(!current||!heading)return;const markup=header(current);if(markup!==paintedHeaderMarkup){heading.outerHTML=markup;paintedHeaderMarkup=markup;bindHeader();}}
  function connectionError(err:any){if(!active())return;if(err.status===404){current=null;workspace.setAttribute('data-chat-current','false');rows=[];pane.innerHTML=html('<div class="message-empty">Diese Unterhaltung ist nicht mehr verfügbar.</div>');return;}let banner=pane.querySelector<HTMLElement>('[data-chat-error]');if(!banner){banner=document.createElement('p');banner.dataset.chatError='true';banner.className='chat-connection-error';banner.setAttribute('role','status');pane.prepend(banner);}setText(banner,t(t`Verbindung unterbrochen. Wir versuchen es erneut. ${apiError(err.message)}`));}
  async function open(n:number){if(opening===n)return;const epoch=++generation;searchSequence++;pinsSequence++;localChanges.clear();searchTerm='';searchRows=[];searchMarkup='';searchCursor=null;searchHasMore=false;pinsRows=[];pinsEnabled=false;opening=n;selected=n;current=null;rows=[];loaded=false;hasMore=false;renderList();pane.inert=true;pane.setAttribute('aria-busy','true');
    try{
      // Read both parts before mounting the conversation. A switch keeps the
      // existing surface stable and cannot send through the previous composer.
      const [channel,result]=await Promise.all([ctx.api('/api/chat/channels/'+n),syncMessageHistory({rows:[],hasMore:false,api:(query:string)=>ctx.api(`/api/chat/channels/${n}/messages`+query)})]);
      if(!active()||epoch!==generation)return;current=channel;workspace.setAttribute('data-chat-current','true');rows=result.items;hasMore=result.hasMore;syncedThrough=rows.at(-1)?.id??0;pinsRows=channel.pins??[];pinsEnabled=Array.isArray(channel.pins);
      paintedHeaderMarkup=header(channel);pane.innerHTML=paintedHeaderMarkup+lookupMarkup()+html`<button class="btn secondary small" id="chat-older" hidden>Ältere Nachrichten laden</button><div class="chat-message-log" aria-label="Nachrichtenverlauf" aria-live="polite"></div>${ctx.can('chatSend')?composer(undefined,undefined,{placeholder:t('Nachricht schreiben …')}).replace('<div class="composer-footer">',chatFileControls(ctx.config)+'<div class="composer-footer">'):html('<p class="chat-readonly muted">Du hast Leserechte für diesen Chat.</p>')}`;
      const form=ctx.can('chatSend')?pane.querySelector<HTMLFormElement>('form.message-composer'):null;if(form){
        const auth=ctx.authGeneration,userId=ctx.session.user.id,files=bindChatFiles(ctx,form,{channelId:n,active:()=>active()&&form.isConnected&&epoch===generation&&auth===ctx.authGeneration&&userId===ctx.session.user?.id&&ctx.can('chatSend'),after:(saved:any)=>{revision++;rows=[...rows.filter(row=>row.id!==saved.id),saved].sort((a,b)=>a.id-b.id);paintMessages();void refresh();}});
        bindComposer(ctx,form,{people,post:(text:string)=>ctx.api(`/api/chat/channels/${n}/messages`,{method:'POST',body:{text}}),after:(saved:any)=>{revision++;rows=[...rows.filter(row=>row.id!==saved.id),saved].sort((a,b)=>a.id-b.id);paintMessages();return refresh();},afterClear:files.resetTextBaseline});
      }
      for(const [selector,label] of [['[data-chat-file-pick]','Dateien anhängen'],['[data-mention-picker]','Person erwähnen']] as const){const button=form?.querySelector<HTMLButtonElement>(selector);if(button){const text=t(label),pair=encodeURIComponent(JSON.stringify([text.de,text.en]));for(const attribute of ['aria-label','title']){button.setAttribute(attribute,text);button.setAttribute('data-rb-i18n-'+attribute,pair);}}}
      bindHeader();
      bindLookup();
      pane.querySelector('#chat-older')?.addEventListener('click',()=>void refresh(rows[0]?.id));
      paintMessages();
      if(rows.length&&panels.isConversationVisible())void ctx.api(`/api/chat/channels/${n}/read`,{method:'POST',body:{messageId:rows.at(-1).id}}).catch(err=>{if(active()&&epoch===generation)connectionError(err);});
    }catch(err){if(active()&&epoch===generation){if(!current){pane.innerHTML=html`<div class="message-empty"><h3>Verbindung fehlgeschlagen</h3><p>${h(apiError(err.message))}</p><p>${t('Verbindung unterbrochen. Wir versuchen es erneut.')}</p></div>`;}else connectionError(err);}}
    finally{if(epoch===generation){opening=0;pane.inert=false;pane.removeAttribute('aria-busy');}}
  }
  async function membership(action:string){const n=selected,epoch=generation;try{if(action==='leave'&&current?.visibility==='private'&&!await canLeaveForms(pane))return;await ctx.api(`/api/chat/channels/${n}/${action}`,{method:'POST',body:{}});if(!active()||epoch!==generation)return;await loadList();if(!active()||epoch!==generation)return;const fresh=channels.find(c=>c.id===n);if(fresh){current=fresh;updateHeader();}else{current=null;workspace.setAttribute('data-chat-current','false');rows=[];pane.innerHTML=html('<div class="message-empty">Du hast die Gruppe verlassen.</div>');location.hash=channels.length?'channel-'+channels[0].id:'';}}catch(err){ctx.toast(apiError(err.message));}}
  async function refresh(before?:number){if(!active()||!current||refreshing===generation)return;const epoch=generation,n=selected,startRevision=revision;refreshing=epoch;
    try{const result=await syncMessageHistory({rows,hasMore,initialized:loaded,before,after:syncedThrough,api:(query:string)=>ctx.api(`/api/chat/channels/${n}/messages`+query)});if(!active()||epoch!==generation||startRevision!==revision)return;
      rows=result.items;hasMore=result.hasMore;if(!before)syncedThrough=rows.at(-1)?.id??syncedThrough;pane.querySelector('[data-chat-error]')?.remove();paintMessages();
      await refreshLookup(epoch,startRevision,n);if(!active()||epoch!==generation||startRevision!==revision)return;
      if(!before&&result.items.length&&panels.isConversationVisible()&&!pane.querySelector('.message-edit'))await ctx.api(`/api/chat/channels/${n}/read`,{method:'POST',body:{messageId:result.items.at(-1).id}});
    }catch(err){if(active()&&epoch===generation)connectionError(err);}
    finally{if(refreshing===epoch)refreshing=null;}
  }
  async function loadList(){const data=await ctx.api('/api/chat/channels');if(!active())return;channels=data;renderList();}
  async function groupDialog(existing?:any){
    try{const all=(await ctx.api('/api/collaboration/users')).filter(u=>u.chatAvailable);if(!active())return;
      const dialog:HTMLDialogElement=openDialog({title:existing?t('Gruppe verwalten'):t('Neue Gruppe'),subtitle:existing?.visibility==='private'?t('Nur Gruppenmitglieder sehen den Verlauf.'):t('Name, Sichtbarkeit und Mitglieder festlegen.'),body:html`<form><div class="dialog-body"><label class="field"><span>Gruppenname *</span><input name="name" maxlength="80" required value="${h(existing?.name??'')}" placeholder="z. B. Wareneingang"></label>${!existing?html('<label class="field"><span>Sichtbarkeit</span><select name="visibility"><option value="private">Geschlossen · nur Mitglieder</option><option value="public">Öffentlich · für alle angemeldeten Personen</option></select></label>'):''}<fieldset class="chat-member-picker"><legend>Mitglieder</legend><p class="muted">Die Gruppenleitung gehört automatisch dazu. Neue Mitglieder können den bisherigen Verlauf lesen.</p>${all.filter(u=>u.id!==(existing?.ownerId??ctx.session.user.id)).map(u=>html`<label class="checkbox-field"><input type="checkbox" name="memberIds" value="${u.id}" ${existing?.members.some(m=>m.id===u.id)?'checked':''}><span>${h(u.displayName)} <small>@${h(u.username)}</small></span></label>`).join('')}</fieldset><p class="form-error" role="alert" hidden></p></div><div class="dialog-footer"><button class="btn secondary" type="button" data-close>Abbrechen</button><button class="btn primary" type="submit">${existing?t('Änderungen speichern'):t('Gruppe erstellen')}</button></div></form>`});
      const form=dialog.querySelector('form'),error=form.querySelector<HTMLElement>('.form-error'),button=form.querySelector<HTMLButtonElement>('[type=submit]');
      form.onsubmit=async(event:any)=>{event.preventDefault();if(button.disabled)return;button.disabled=true;form.inert=true;error.hidden=true;const epoch=generation,data=new FormData(form);
        try{const body={kind:'group',name:data.get('name'),...(!existing?{visibility:data.get('visibility')}:{}),memberIds:data.getAll('memberIds').map(Number)};const channel=await ctx.api('/api/chat/channels'+(existing?'/'+existing.id:''),{method:existing?'PUT':'POST',body});if(!form.isConnected||!dialog.open)return;markForm(form,false);dialog.close();if(!active()||epoch!==generation)return;await loadList();if(!active()||epoch!==generation)return;if(selected===channel.id){current=channel;updateHeader();}else location.hash='channel-'+channel.id;}catch(err){if(form.isConnected){setText(error,apiError(err.message));error.hidden=false;}}finally{button.disabled=false;form.inert=false;}
      };
    }catch(err){ctx.toast(apiError(err.message));}
  }
  async function directDialog(){try{const all=(await ctx.api('/api/collaboration/users')).filter(u=>u.chatAvailable&&u.id!==ctx.session.user.id);if(!active())return;
    const dialog:HTMLDialogElement=openDialog({title:t('Privatnachricht beginnen'),subtitle:t('Nur du und die gewählte Person sehen die Unterhaltung.'),body:html`<form><div class="dialog-body"><label class="field"><span>Person auswählen *</span><select name="userId" required><option value="">Bitte auswählen</option>${all.map(u=>html`<option value="${u.id}">${h(u.displayName)} (@${h(u.username)})</option>`).join('')}</select></label>${!all.length?html('<p class="muted">Noch keine weiteren Konten mit Chat-Zugriff vorhanden.</p>'):''}<p class="form-error" role="alert" hidden></p></div><div class="dialog-footer"><button class="btn secondary" type="button" data-close>Abbrechen</button><button class="btn primary" type="submit" ${!all.length?'disabled':''}>Unterhaltung öffnen</button></div></form>`});
    const form=dialog.querySelector('form'),button=form.querySelector<HTMLButtonElement>('[type=submit]'),error=form.querySelector<HTMLElement>('.form-error');form.onsubmit=async(e:any)=>{e.preventDefault();if(button.disabled)return;button.disabled=true;form.inert=true;error.hidden=true;const epoch=generation;try{const result=await ctx.api('/api/chat/channels',{method:'POST',body:{kind:'direct',userId:Number(new FormData(form).get('userId'))}});if(!dialog.open||!form.isConnected)return;markForm(form,false);dialog.close();if(!active()||epoch!==generation)return;await loadList();if(!active()||epoch!==generation)return;location.hash='channel-'+result.id;}catch(err){setText(error,apiError(err.message));error.hidden=false;}finally{button.disabled=false;form.inert=false;}};
  }catch(err){ctx.toast(apiError(err.message));}}
  root.querySelector('#chat-direct')?.addEventListener('click',()=>void directDialog());root.querySelector('#chat-group')?.addEventListener('click',()=>void groupDialog());search.oninput=renderList;
  async function tick(){if(!active())return;try{if(document.visibilityState==='visible'){await loadList();const requested=requestedChannel||selected||channels[0]?.id;if(requested&&(requested!==selected||!current))await open(requested);else if(current){const fresh=channels.find(c=>c.id===selected);if(!fresh){current=null;workspace.setAttribute('data-chat-current','false');rows=[];pane.innerHTML=html('<div class="message-empty">Diese Unterhaltung ist nicht mehr verfügbar.</div>');}else{current=fresh;updateHeader();await refresh();}}}}catch(err){if(active()){if(!channels.length){paintedListMarkup=null;list.innerHTML=html`<p class="form-error">${h(err.message)}</p>`;}connectionError(err);}}finally{if(active()){timer=setTimeout(tick,3000);timer?.unref?.();}}}
  void tick();
  return {workspace,async navigate(hash:string){
    if(!active())return;
    const channel=hash.match(/^#channel-(\d+)$/);requestedChannel=channel?Number(channel[1]):0;
    if(requestedChannel){panels.showConversation();if(requestedChannel!==selected||!current)await open(requestedChannel);if(current&&panels.isConversationVisible())panels.showConversation(true);}
  }};
}
