import {html,t,locale} from './i18n.js';
import {h} from './ui.js';

type SwitchOptions = {id?:string;fieldId?:string;full?:boolean;hidden?:boolean;disabled?:boolean;required?:boolean;confirmation?:boolean};

// Keep the native checkbox for labels, keyboard input, form values and validation.
// The switch role derives its state from checked, including programmatic updates.
export function switchField(name:string,label:string,checked=false,options:SwitchOptions={}):string {
  return html`<label class="checkbox-field switch-field${options.full?' full':''}${options.confirmation?' confirmation-field':''}"${options.fieldId?` id="${h(options.fieldId)}"`:''}${options.hidden?' hidden':''}><input type="checkbox" role="switch" class="switch-input"${name?` name="${h(name)}"`:''}${options.id?` id="${h(options.id)}"`:''}${checked?' checked':''}${options.disabled?' disabled':''}${options.required?' required':''}><span class="switch-control" aria-hidden="true"><span class="switch-thumb"></span></span><span class="switch-label">${h(label)}</span></label>`;
}

const bound=new WeakSet<Document>();
export function bindSwitchAnimations():void {
  if(bound.has(document))return;
  bound.add(document);
  const system=window.matchMedia('(prefers-reduced-motion: reduce)');
  const running=new WeakMap<HTMLElement,Animation>();
  const active=new Set<Animation>();
  const reduced=()=>system.matches||document.documentElement.dataset.motion==='reduce';
  const stopIfReduced=()=>{if(reduced()){for(const animation of active)animation.cancel();active.clear();}};
  window.addEventListener('account-preferences',stopIfReduced);
  system.addEventListener('change',stopIfReduced);
  document.addEventListener('change',event=>{
    const input=event.target as HTMLInputElement|null;
    if(!input?.matches?.('input.switch-input')||input.disabled)return;
    const thumb=input.parentElement?.querySelector<HTMLElement>('.switch-thumb');
    if(!thumb)return;
    running.get(thumb)?.cancel();
    if(reduced()||!thumb.animate)return;
    const animation=thumb.animate([
      {scale:'1 1',offset:0},
      {scale:'1.14 .86',offset:.3},
      {scale:'.96 1.05',offset:.72},
      {scale:'1 1',offset:1}
    ],{duration:300,easing:'cubic-bezier(.22,1,.36,1)'});
    running.set(thumb,animation);active.add(animation);
    void animation.finished.then(()=>active.delete(animation),()=>active.delete(animation));
  },{capture:true});
}
