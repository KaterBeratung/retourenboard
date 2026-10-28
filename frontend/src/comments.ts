import {html,setText,t} from './i18n.js';
import {h,icon} from './ui.js';
import {composer,bindComposer,renderMessage,bindMessageActions,liveRoot,syncMessageHistory} from './collaboration-ui.js';
export function renderComments(ctx:any,returnId:number,root:HTMLElement,options:{kind?:'returns'|'disposals';onPaint?:(log:HTMLElement,rows:any[])=>void}={}){
  const kind=options.kind??'returns',write=kind==='disposals'?'disposalsCommentsCreate':'commentsCreate';
  root.className='return-comments';root.innerHTML=html`<div class="comments-heading"><div><h3>${icon('chat')}Kommentare <span class="count-pill" id="comment-count">0</span></h3><p class="muted">Absprachen und Rückfragen direkt am Vorgang.</p></div></div><button type="button" class="btn secondary small" id="comments-older" hidden>Ältere Kommentare laden</button><div class="comment-log" aria-live="polite"><p class="muted">Kommentare werden geladen …</p></div>${ctx.can(write)?composer(t('Kommentar'),t('Kommentar hinzufügen')):html('<p class="muted">Du hast Leserechte für die Kommentare.</p>')}`;
  const path=`/api/${kind}/${returnId}/comments`,log=root.querySelector<HTMLElement>('.comment-log'),older=root.querySelector<HTMLButtonElement>('#comments-older');
  let rows:any[]=[],busy=false,hasMore=false,initialized=false,revision=0,paintedMarkup:string|null=null;
  const people=()=>ctx.api('/api/collaboration/users');
  function paint(force=false){
    if(!liveRoot(ctx,root)||log.querySelector('.message-edit'))return;
    const markup=rows.length?rows.map(r=>renderMessage(r,ctx.session.user.id)).join(''):html`<div class="comment-empty">${icon('chat')}<p>Noch keine Kommentare. Halte die erste Absprache hier fest.</p></div>`;
    if(!force&&markup===paintedMarkup)return;
    const active=document.activeElement as HTMLElement,focused=active&&log.contains?.(active)?active.closest<HTMLElement>('[data-message]'):null;
    const selector=focused?(active.matches('input.switch-input')&&active.closest('[data-comment-sharing]')?'.comment-sharing input':active.hasAttribute('data-edit-message')?'[data-edit-message]':active.hasAttribute('data-delete-message')?'[data-delete-message]':null):null;
    const focusId=focused?.dataset.message;
    log.innerHTML=markup;paintedMarkup=markup;
    bindMessageActions(ctx,log,rows,{people,change:(n:number,body:any,remove:boolean)=>ctx.api(path+'/'+n,{method:remove?'DELETE':'PUT',body}),reload:(saved:any)=>{if(saved){revision++;rows=rows.map(r=>r.id===saved.id?saved:r);}paint(true);return load().then(()=>root.dispatchEvent(new CustomEvent(kind==='returns'?'return-activity-changed':'disposal-activity-changed',{bubbles:true})));}});
    options.onPaint?.(log,rows);
    if(focusId){const card=log.querySelector<HTMLElement>('[data-message="'+focusId+'"]'),control=selector?card?.querySelector<HTMLElement>(selector):null;const target=control&&!(control as HTMLInputElement).disabled?control:card;target?.focus({preventScroll:true});}
  }
  async function load(before?:number){if(busy||!liveRoot(ctx,root))return;busy=true;const startRevision=revision;try{
    const result=await syncMessageHistory({rows,hasMore,initialized,before,api:(query:string)=>ctx.api(path+query)});if(!liveRoot(ctx,root)||startRevision!==revision)return;
    rows=result.items;hasMore=result.hasMore;initialized=true;
    setText(root.querySelector('#comment-count'),result.total);older.hidden=!hasMore;
    paint();
  }catch(err){if(liveRoot(ctx,root)){if(!initialized)log.innerHTML=html`<p class="form-error">${h(err.message)}</p>`;else older.title=t('Verbindung unterbrochen. Der Verlauf wird erneut geladen.');}}finally{busy=false;}}
  const form=root.querySelector('form');if(form)bindComposer(ctx,form,{people,post:(value:string)=>ctx.api(path,{method:'POST',body:{text:value}}),after:async()=>{await load();root.dispatchEvent(new CustomEvent(kind==='returns'?'return-activity-changed':'disposal-activity-changed',{bubbles:true}));ctx.toast(t('Kommentar gespeichert.'));}});
  older.onclick=()=>void load(rows[0]?.id);
  async function tick(){if(!liveRoot(ctx,root))return;if(document.visibilityState==='visible')await load();if(liveRoot(ctx,root))setTimeout(tick,5000);}
  void tick();
}
