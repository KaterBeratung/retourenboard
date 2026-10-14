import {html,addTranslations} from './i18n.js';
import {h} from './ui.js';
let menuSequence=0;
let active:{trigger:HTMLElement;close:(restore?:boolean)=>void}|null=null;
addTranslations({'Weitere Aktionen':'More actions','Weitere Aktionen:':'More actions:'});
export function recordActionMenu(label:any,items:string){
 const id=`record-menu-${++menuSequence}`;
 return html`<div class="record-menu" data-record-menu><button type="button" class="icon-btn" data-record-menu-trigger aria-label="Weitere Aktionen: ${h(label)}" title="Weitere Aktionen" aria-haspopup="menu" aria-expanded="false" aria-controls="${id}"><svg class="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg></button><div data-record-menu-popup class="record-menu-popup" id="${id}" popover="auto" role="menu" aria-label="Weitere Aktionen: ${h(label)}" hidden>${items}</div></div>`;
}
export function recordMenuPosition(trigger:{left:number;right:number;top:number;bottom:number},menu:{width:number;height:number},viewport:{width:number;height:number}){
 const pad=12,gap=6,left=Math.max(pad,Math.min(trigger.right-menu.width,viewport.width-menu.width-pad));
 const below=trigger.bottom+gap,above=trigger.top-menu.height-gap;
 return {left,top:Math.max(pad,Math.min(below+menu.height<=viewport.height-pad?below:above,viewport.height-menu.height-pad))};
}
export function closeRecordMenus(){active?.close(false);}
export function bindRecordMenus(root:any){
 if(active&&(!active.trigger.isConnected||root.contains?.(active.trigger)))closeRecordMenus();
 root.querySelectorAll('[data-record-menu-trigger]').forEach((trigger:HTMLButtonElement)=>{
  const wrapper=trigger.closest<HTMLElement>('[data-record-menu]'),popup=wrapper.querySelector<HTMLElement>('[data-record-menu-popup]');
  let open=false,fallback=false;
  const items=()=>Array.from(popup.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
  const viewport=()=>({width:window.innerWidth,height:window.innerHeight});
  function position(){const point=recordMenuPosition(trigger.getBoundingClientRect(),popup.getBoundingClientRect(),viewport());popup.style.left=point.left+'px';popup.style.top=point.top+'px';}
  function close(restore=false){
   if(!open)return;open=false;trigger.setAttribute('aria-expanded','false');wrapper.removeAttribute('data-menu-open');
   if(!fallback&&popup.matches(':popover-open'))popup.hidePopover();
   popup.hidden=true;if(fallback){popup.classList.remove('record-menu-fallback');wrapper.append(popup);}
   document.removeEventListener('pointerdown',outside,true);window.removeEventListener('resize',dismiss);document.removeEventListener('scroll',scroll,true);
   if(active?.trigger===trigger)active=null;if(restore&&trigger.isConnected)trigger.focus({preventScroll:true});
  }
  const outside=(event:Event)=>{if(!popup.contains(event.target as Node)&&!trigger.contains(event.target as Node))close();};
  const dismiss=()=>close();
  const scroll=(event:Event)=>{if(!popup.contains(event.target as Node))close();};
  function show(last=false){
   if(open){items()[last?items().length-1:0]?.focus();return;}
   closeRecordMenus();open=true;active={trigger,close};trigger.setAttribute('aria-expanded','true');wrapper.setAttribute('data-menu-open','');popup.hidden=false;
   fallback=typeof popup.showPopover!=='function';
   if(fallback){popup.classList.add('record-menu-fallback');document.body.append(popup);}else popup.showPopover();
   position();items()[last?items().length-1:0]?.focus({preventScroll:true});
   document.addEventListener('pointerdown',outside,true);window.addEventListener('resize',dismiss);document.addEventListener('scroll',scroll,true);
  }
  trigger.onclick=event=>{event.preventDefault();if(open)close(true);else show();};
  trigger.onkeydown=event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();show(event.key==='ArrowUp');}else if(event.key==='Escape'&&open){event.preventDefault();close(true);}};
  popup.addEventListener('toggle',(event:ToggleEvent)=>{if(event.newState==='closed')close(document.activeElement===popup||popup.contains(document.activeElement));});
  popup.onkeydown=event=>{
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);return;}
   if(event.key==='Tab'){close(true);return;}
   const entries=items(),index=entries.indexOf(document.activeElement as HTMLButtonElement);
   if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?entries.length-1:event.key==='ArrowDown'?(index+1)%entries.length:(index-1+entries.length)%entries.length;entries[next]?.focus();}
  };
  popup.addEventListener('click',event=>{if((event.target as Element).closest('button:not(:disabled)'))close(true);},{capture:true});
 });
}
