import {html,t,addTranslations} from './i18n.js';
import {h} from './ui.js';

addTranslations({'Bereich wechseln':'Switch area','Arbeitsbereich':'Workspace','Adminbereich':'Admin area'});

// Only accepted routes belong here; callers keep the existing unsaved-form guard.
// Bookmarks live in this tab and are reset when its authentication context changes.
export function createAreaNavigation(){
 let workspace='#overview',admin='#admin';
 return {
  remember(hash:string){
   if(!hash.startsWith('#'))return;
   const page=hash.slice(1).split('?')[0];
   if(page==='admin')admin=hash;
   else if(/^(overview|returns|products|disposals|scan-intake|chat|channel-\d+)$/.test(page))workspace=hash;
  },
  destinations(canAdminSection:(section:string)=>boolean=()=>true){
   const section=new URLSearchParams(admin.split('?')[1]??'').get('section');
   return {workspace,admin:section&&!canAdminSection(section)?'#admin':admin};
  },
  clear(){workspace='#overview';admin='#admin';}
 };
}

export function renderAreaSwitcher(state:{adminPage:boolean;canAdminAccess:boolean;workspace:string;admin:string}){
 return html`<nav class="sidebar-areas" aria-label="${t('Bereich wechseln')}"><a href="${h(state.workspace)}" data-area="workspace"${!state.adminPage?' aria-current="true"':''}>Arbeitsbereich</a>${state.canAdminAccess?html`<a href="${h(state.admin)}" data-area="admin" id="admin-link"${state.adminPage?' aria-current="true"':''}>Adminbereich</a>`:''}</nav>`;
}
