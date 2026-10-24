const controls='button,a,summary,[role="button"],[role="menuitem"],[role="tab"],label.btn';
const unavailable=':disabled,[aria-disabled="true"],[data-copy-state="copied"]';
const bindings=new WeakSet<Document>();

// Keep each short CSS sequence alive after pointer exit. Neither the SVG's
// viewport nor its control moves, and nested menus own their individual icons.
export function bindIconMotion(root:Document){
 if(bindings.has(root))return;
 bindings.add(root);
 const running=new Map<SVGSVGElement,{effects:Animation[]}>();
 const allowed=()=>root.documentElement.dataset.motion==='normal';
 const release=(icon:SVGSVGElement,run:{effects:Animation[]})=>{
  if(running.get(icon)!==run)return;
  running.delete(icon);icon.removeAttribute('data-icon-motion');
 };
 function play(control:Element){
  if(!allowed()||!control.closest('[data-ui="board"]')||control.matches(unavailable))return;
  for(const icon of control.querySelectorAll<SVGSVGElement>('svg.icon')){
   if(icon.closest(controls)!==control||icon.closest(unavailable)||running.has(icon)||!icon.getAnimations)continue;
   const run={effects:[] as Animation[]};running.set(icon,run);icon.setAttribute('data-icon-motion','active');
   run.effects=icon.getAnimations({subtree:true}).filter(effect=>String((effect as CSSAnimation).animationName??'').startsWith('board-symbol-'));
   if(!run.effects.length){release(icon,run);continue;}
   void Promise.allSettled(run.effects.map(effect=>effect.finished)).then(()=>release(icon,run));
  }
 }
 function target(event:Event){return (event.target as Element)?.closest?.(controls);}
 root.addEventListener('pointerover',event=>{
  if(event.pointerType==='touch')return;
  const control=target(event),previous=event.relatedTarget as Node;
  if(control&&!(previous?.nodeType&&control.contains(previous)))play(control);
 });
 root.addEventListener('focusin',event=>{
  const control=target(event);if(control&&(event.target as Element)?.matches?.(':focus-visible'))play(control);
 });
 root.addEventListener('pointerup',event=>{
  const control=target(event);if(control&&event.pointerType==='touch')play(control);
 });
 const Observer=root.defaultView?.MutationObserver;
 if(Observer)new Observer(()=>{
  if(allowed())return;
  for(const [icon,run]of running){run.effects.forEach(effect=>effect.cancel());release(icon,run);}
 }).observe(root.documentElement,{attributes:true,attributeFilter:['data-motion']});
}
