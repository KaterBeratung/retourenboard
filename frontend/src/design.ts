import {html,t,addTranslations} from './i18n.js';
import {icon} from './ui.js';

export type Scope = '' | 'open' | 'checking' | 'closed' | 'active' | 'overdue' | 'today';
export type View = 'overview' | 'returns' | 'products' | 'admin' | 'account' | 'chat' | 'scan-intake' | 'disposals';

addTranslations({'Schnellmenü':'Quick menu','Währung':'Currency','Sprache':'Language','Darstellung':'Appearance'});
export function preserveListScroll(root:HTMLElement,update:()=>void){
  const page=root.ownerDocument.scrollingElement,pagePosition=page?{top:page.scrollTop,left:page.scrollLeft}:null;
  const positions=Array.from(root.querySelectorAll<HTMLElement>('.table-scroll')).map(node=>({top:node.scrollTop,left:node.scrollLeft}));
  try{return update();}finally{
    root.querySelectorAll<HTMLElement>('.table-scroll').forEach((node,index)=>{const position=positions[index];if(position){node.scrollTop=position.top;node.scrollLeft=position.left;}});
    if(page&&pagePosition){page.scrollTop=pagePosition.top;page.scrollLeft=pagePosition.left;}
  }
}
export function inventoryFilterOptions(products:{category?:string}[],returns:{reason?:string}[]){
  return {categories:[...new Set(products.map(item=>item.category).filter(Boolean))].sort(),reasons:[...new Set(returns.map(item=>item.reason))].sort()};
}
export function renderHeaderMenu(){
  return html`<summary aria-label="Schnellmenü" aria-controls="header-controls-panel" aria-expanded="false">${icon('settings')}<span class="header-menu-label">Schnellmenü</span><span class="header-menu-count" hidden aria-hidden="true"></span><span class="header-menu-caret">${icon('chevron')}</span></summary><section id="header-controls-panel" class="header-menu-panel" role="region" aria-label="Schnellmenü"><div class="header-menu-heading"><strong>Schnellmenü</strong><button type="button" class="icon-btn" data-header-menu-close aria-label="Schließen">${icon('close')}</button></div><div class="header-menu-controls"></div></section>`;
}
const headerBindings=new WeakMap<HTMLElement,{close:(restore?:boolean)=>void;refresh:()=>void}>();
export function renderHeaderSignOut(){
  return html`<button type="button" class="btn secondary header-signout" data-header-signout hidden>${icon('logout')}<span>Abmelden</span></button>`;
}
export function bindHeaderMenu(root:HTMLElement,onSignOut?:(button:HTMLButtonElement)=>unknown){
  if(!root)return;
  const previous=headerBindings.get(root);if(previous)return previous;
  const doc=root.ownerDocument,details=doc.createElement('details');details.className='header-menu';details.innerHTML=renderHeaderMenu();root.append(details);
  const summary=details.querySelector('summary'),panel=details.querySelector<HTMLElement>('.header-menu-panel'),controls=details.querySelector('.header-menu-controls'),badge=details.querySelector<HTMLElement>('.header-menu-count');
  const rows=new Map<HTMLElement,HTMLElement>();
  const kinds=[['#inbox-button','notifications',''],['.currency-control','currency','Währung'],['.language-switch','language','Sprache'],['.theme-switch','appearance','Darstellung'],['#header-access','account',''],['.preview-badge','preview','']];
  function refresh(){
    for(const node of Array.from(root.children) as HTMLElement[]){
      const kind=kinds.find(([selector])=>node.matches(selector));if(!kind)continue;
      const row=doc.createElement('div');row.className='header-menu-row';row.dataset.headerControl=kind[1];
      if(kind[2])row.innerHTML=html`<span class="header-menu-caption">${t(kind[2])}</span>`;
      const position=kinds.indexOf(kind),next=Array.from(controls.children).find(child=>kinds.findIndex(([,name])=>name===(child as HTMLElement).dataset.headerControl)>position);
      row.append(node);controls.insertBefore(row,next??null);rows.set(node,row);
      if(kind[1]==='account'&&onSignOut){
        row.insertAdjacentHTML('beforeend',renderHeaderSignOut());
        const button=row.querySelector<HTMLButtonElement>('[data-header-signout]');
        button.onclick=()=>{void onSignOut(button);};
      }
    }
    for(const [node,row] of rows){if(row.hidden!==node.hidden)row.hidden=node.hidden;}
    const inbox=panel.querySelector<HTMLElement>('#inbox-button'),unread=inbox?.querySelector<HTMLElement>('.inbox-count'),count=inbox&&!inbox.hidden&&unread&&!unread.hidden?unread.textContent?.trim()??'':'';
    if(badge.textContent!==count)badge.textContent=count;
    if(badge.hidden!==!count)badge.hidden=!count;
  }
  function close(restore=false){
    details.open=false;summary.setAttribute('aria-expanded','false');
    details.querySelectorAll<HTMLDetailsElement>('details[open]').forEach(nested=>nested.open=false);
    if(restore&&summary.isConnected)summary.focus({preventScroll:true});
  }
  details.addEventListener('toggle',()=>summary.setAttribute('aria-expanded',String(details.open)));
  panel.querySelector('[data-header-menu-close]').addEventListener('click',()=>close(true));
  details.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.defaultPrevented){event.preventDefault();event.stopPropagation();close(true);}});
  panel.addEventListener('click',event=>{if((event.target as Element).closest('#inbox-button,#header-access,[data-header-signout]'))close(true);},true);
  doc.addEventListener('pointerdown',event=>{if(details.open&&!details.contains(event.target as Node))close();});
  doc.defaultView?.addEventListener('popstate',()=>close());doc.defaultView?.addEventListener('hashchange',()=>close());
  refresh();
  new MutationObserver(refresh).observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
  const binding={close,refresh};headerBindings.set(root,binding);return binding;
}

export function parseDesignRoute(hash: string, adminPage = false): { view: View; scope: Scope } {
  const [page, query = ''] = hash.replace(/^#/, '').split('?');
  if(page==='chat'||/^channel-\d+$/.test(page))return {view:'chat',scope:''};
  if(page==='account')return {view:'account',scope:''};
  if(page==='disposals')return {view:'disposals',scope:''};
  if(page==='scan-intake')return {view:'scan-intake',scope:''};
  if(page==='admin'||(adminPage&&!['overview','returns','products'].includes(page)))return {view:'admin',scope:''};
  const view: View = page === 'returns' || page === 'products' ? page : 'overview';
  const candidate = new URLSearchParams(query).get('scope') || '';
  const scopes = view === 'returns' ? ['open', 'checking', 'closed','overdue','today'] : view === 'products' ? ['active'] : [];
  return { view, scope: scopes.includes(candidate) ? candidate as Scope : '' };
}

// Canonical hash routes keep page links and older bookmarks in the mounted shell.
export function internalNavigationHash(href:string,currentHref:string):string|null {
  const current=new URL(currentHref),url=new URL(href,current);
  if(url.origin!==current.origin||!['/','/index.html','/admin','/admin/','/admin.html','/account','/account/','/account.html','/chat','/chat/'].includes(url.pathname)||url.hash==='#content')return null;
  const [page,query='']=url.hash.slice(1).split('?');
  const shared=['overview','returns','products','account','admin','chat','scan-intake','disposals'].includes(page)||/^channel-\d+$/.test(page);
  if(url.pathname.startsWith('/account')&&!shared)return '#account';
  if(url.pathname.startsWith('/admin')&&!shared){const params=new URLSearchParams(query);if(page)params.set('section',page);return '#admin'+(params.size?'?'+params:'');}
  if(url.pathname.startsWith('/chat')&&!page)return '#chat';
  return url.hash||'#overview';
}

// Friendly addresses share one mounted shell, even after entering via /admin.
export function internalNavigationUrl(href:string,currentHref:string):string|null {
  const hash=internalNavigationHash(href,currentHref);if(hash===null)return null;
  const url=new URL(href,currentHref),[page,query='']=hash.slice(1).split('?');
  if(page==='admin'){
    const params=new URLSearchParams(query),section=params.get('section');params.delete('section');
    return '/admin'+url.search+(section?'#'+encodeURIComponent(section)+(params.size?'?'+params:''):params.size?'#admin?'+params:'');
  }
  if(page==='account')return '/account'+url.search+(query?'#account?'+query:'');
  if(page==='chat')return '/chat'+url.search+(query?'#chat?'+query:'');
  if(/^channel-\d+$/.test(page))return '/chat'+url.search+hash;
  return '/'+url.search+hash;
}

// One browser traversal may emit both events. Replacements must sync this
// cursor too, so revisiting a previously used filter still triggers routing.
export function createLocationChangeListener(readHref:()=>string,change:()=>unknown){
  let observed=readHref();
  return {sync(){observed=readHref();},changed(){const href=readHref();if(href===observed)return;observed=href;return change();}};
}

// Reads may finish after a user leaves and revisits the same URL. The generation
// prevents those old requests from rebuilding a freshly edited form.
export function createNavigationLifecycle(readHash:()=>string){
  let generation=0;
  return {
    invalidate(){generation++;},
    checkpoint(){const current=generation,hash=readHash();return ()=>current===generation&&hash===readHash();},
    async openAccount(options:{isAccount:()=>boolean;canLeave:()=>Promise<boolean>;remember:(hash:string)=>void;open:()=>void;fallback:string}){
      const previous=readHash();
      if(options.isAccount()||previous.split('?')[0]==='#account'||!await options.canLeave())return;
      if(options.isAccount()||readHash()!==previous)return;
      options.remember(previous||options.fallback);options.open();
    }
  };
}

// A rejected history traversal must return to its original entry, rather than
// rename the entry the browser just visited. Native entry indices also cover
// older hashes created before the application mounted.
export function createHashHistory(history:any,readHash:()=>string,readIndex:()=>number|undefined=()=>undefined){
  const id=history.state?.rbRoute?.id??Math.random().toString(36).slice(2);
  const position=()=>readIndex()??(history.state?.rbRoute?.id===id?history.state.rbRoute.index:undefined);
  let index=position()??0,hash=readHash(),restoring=false;
  function mark(){history.replaceState({...history.state,rbRoute:{id,index}},'');}
  mark();
  return {
    accept(){index=position()??index+1;hash=readHash();restoring=false;mark();},
    replace(nextHash:string){history.replaceState({...history.state,rbRoute:{id,index}},'',nextHash);hash=readHash();},
    cancel(){const target=position();restoring=true;history.go(target===undefined?-1:index-target);},
    restored(){if(!restoring||readHash()!==hash)return false;restoring=false;return true;}
  };
}

export function matchesReturnScope(row: { isClosed: boolean; statusTone: string; overdue?:boolean;dueDate?:string }, scope: Scope, today?:string): boolean {
  if (scope === 'today') return !row.isClosed&&Boolean(today)&&row.dueDate===today;
  if (scope === 'overdue') return !row.isClosed&&Boolean(row.overdue);
  if (scope === 'open') return !row.isClosed;
  if (scope === 'closed') return row.isClosed;
  if (scope === 'checking') return row.statusTone === 'checking';
  return true;
}

type Inventory = { products: unknown[]; returns: unknown[]; masterdata: Record<string, unknown> };

export function inventoryChanged(previous: Inventory, next: Inventory): boolean {
  return JSON.stringify([previous.products, previous.returns, previous.masterdata]) !==
    JSON.stringify([next.products, next.returns, next.masterdata]);
}

export async function readWhenIdle<T>(read: () => Promise<T>, isBusy: () => boolean): Promise<T | undefined> {
  if (isBusy()) return undefined;
  const value = await read();
  return isBusy() ? undefined : value;
}

export function createDebouncedTask(task: () => void, delay = 100): { run: () => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  function cancel(): void { clearTimeout(timer); timer = undefined; }
  return {
    cancel,
    run(): void {
      cancel();
      timer = setTimeout(() => { timer = undefined; task(); }, delay);
    }
  };
}

export function bindMobileNavigation(): { close: () => void } | undefined {
  const sidebar = document.querySelector<HTMLElement>('.sidebar');
  const shell = document.querySelector<HTMLElement>('.app-shell');
  const toggle = document.querySelector<HTMLButtonElement>('#nav-toggle');
  const close = document.querySelector<HTMLButtonElement>('#nav-close');
  const backdrop = document.querySelector<HTMLButtonElement>('#nav-backdrop');
  if (!sidebar || !shell || !toggle || !close || !backdrop) return;
  const mobile = matchMedia('(max-width: 760px)');
  let opened = false;
  let opener:HTMLElement=toggle;
  function setOpen(value: boolean, restoreFocus = false): void {
    opened = mobile.matches && value;
    document.body.classList.toggle('nav-open', opened);
    toggle.setAttribute('aria-expanded', String(opened));
    document.querySelector('#mobile-more')?.setAttribute('aria-expanded',String(opened));
    sidebar.inert = mobile.matches && !opened;
    shell.inert = opened;
    if (opened) close.focus();
    else if (restoreFocus) (opener.isConnected===false?toggle:opener).focus();
  }
  toggle.addEventListener('click', () => {opener=toggle;setOpen(!opened, opened);});
  document.querySelector('#mobile-actions')?.addEventListener('click',event=>{const button=(event.target as Element).closest<HTMLElement>('#mobile-more');if(button){opener=button;setOpen(!opened,opened);}});
  close.addEventListener('click', () => setOpen(false, true));
  backdrop.addEventListener('click', () => setOpen(false, true));
  sidebar.addEventListener('click', event => {
    const action = (event.target as Element).closest('a,button');
    if (action && action !== close) setOpen(false, action.tagName === 'A');
  });
  document.addEventListener('keydown', event => {
    if (!opened) return;
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false, true); }
    if (event.key !== 'Tab') return;
    const nodes = [...sidebar.querySelectorAll<HTMLElement>('a[href],button:not([disabled])')]
      .filter(node => !node.hidden && node.getClientRects().length > 0);
    const first = nodes[0], last = nodes.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  mobile.addEventListener('change', () => setOpen(false));
  setOpen(false);
  return { close: () => setOpen(false) };
}
