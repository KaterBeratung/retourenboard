type MotionQuery={readonly matches:boolean;addEventListener(type:'change',listener:()=>void):void;removeEventListener(type:'change',listener:()=>void):void};

// Content stays visible without JavaScript or a working observer. A later
// explicit opt-in can enable reveals even when the page started in reduced mode.
export function revealOnScroll(elements:HTMLElement[],query:MotionQuery,Observer:typeof IntersectionObserver|undefined):()=>void{
 let observer:IntersectionObserver|undefined;
 const completed=new Set<HTMLElement>();
 const showAll=()=>{for(const element of elements)element.dataset.revealState='visible';observer?.disconnect();};
 const changed=()=>{
  if(query.matches||!Observer){showAll();return;}
  try{
   observer??=new Observer(entries=>{
    if(query.matches)return;
    for(const entry of entries)if(entry.isIntersecting){const element=entry.target as HTMLElement;element.dataset.revealState='visible';completed.add(element);observer?.unobserve(element);}
   },{threshold:.08,rootMargin:'0px 0px -24px 0px'});
   for(const element of elements)if(!completed.has(element)){element.dataset.revealState='pending';observer.observe(element);}
  }catch{showAll();}
 };
 changed();query.addEventListener('change',changed);
 return ()=>{showAll();query.removeEventListener('change',changed);};
}

// The hero scene leans a few pixels toward the pointer. It is decoration only: it needs a fine pointer,
// follows the effective motion choice and rests again when the pointer leaves or motion is reduced.
export function bindHeroDepth(page:Document,query:MotionQuery,pointer:{readonly matches:boolean},schedule:(callback:()=>void)=>unknown=callback=>window.requestAnimationFrame(callback)):void{
 const stage=page.querySelector<HTMLElement>('.hero-stage'),scene=page.querySelector<HTMLElement>('.hero-scene');
 if(!stage||!scene)return;
 let queued=false,x=0,y=0;
 const clamp=(value:number)=>Math.max(-1,Math.min(1,value));
 const paint=()=>{queued=false;scene.style.setProperty('--depth-x',x.toFixed(3));scene.style.setProperty('--depth-y',y.toFixed(3));};
 const aim=(nextX:number,nextY:number)=>{x=nextX;y=nextY;if(!queued){queued=true;schedule(paint);}};
 stage.addEventListener('pointermove',event=>{
  if(query.matches||!pointer.matches||event.pointerType==='touch')return;
  const box=stage.getBoundingClientRect();if(!box.width||!box.height)return;
  aim(clamp((event.clientX-box.left)/box.width*2-1),clamp((event.clientY-box.top)/box.height*2-1));
 });
 stage.addEventListener('pointerleave',()=>aim(0,0));
 query.addEventListener('change',()=>{if(query.matches)aim(0,0);});
}

// Restarts the CSS animation of one element, for example the typed install command after a tab change.
export function replayAnimation(element:HTMLElement|null):void{
 if(!element)return;
 element.style.animation='none';void element.offsetWidth;element.style.removeProperty('animation');
}

// The system is the default. The visible switch lets a visitor explicitly
// enable motion; visibility only pauses decoration, never the content itself.
export function bindSceneMotion(page:Document,query:MediaQueryList,Observer:typeof IntersectionObserver|undefined,storage:()=>Pick<Storage,'getItem'|'setItem'>=()=>window.localStorage):MotionQuery{
 const button=page.querySelector<HTMLButtonElement>('#scene-motion'),stage=page.querySelector('.hero-stage');
 if(!button||!stage)return query;
 const key='retourenboard.website.motion',listeners=new Set<()=>void>();
 let choice:string|null=null,inView=true,reduced=query.matches;
 try{const saved=storage().getItem(key);if(saved==='on'||saved==='off')choice=saved;}catch{/* Private browsing can disable storage. */}
 const effective:MotionQuery={get matches(){return reduced;},addEventListener(_type,listener){listeners.add(listener);},removeEventListener(_type,listener){listeners.delete(listener);}};
 function apply(){
  const previous=reduced;reduced=choice?choice==='off':query.matches;
  page.documentElement.dataset.siteMotion=reduced?'reduce':'normal';
  page.documentElement.dataset.sceneMotion=!reduced&&!page.hidden&&inView?'play':'pause';
  button!.setAttribute('aria-pressed',String(!reduced));button!.hidden=false;
  if(previous!==reduced)for(const listener of listeners)listener();
 }
 button.addEventListener('click',()=>{choice=reduced?'on':'off';try{storage().setItem(key,choice);}catch{/* The current-page choice still works. */}apply();});
 query.addEventListener('change',apply);page.addEventListener('visibilitychange',apply);
 if(Observer)try{new Observer(entries=>{for(const entry of entries)if(entry.target===stage)inView=entry.isIntersecting;apply();},{threshold:0}).observe(stage);}catch{/* Manual and document visibility controls still work. */}
 apply();return effective;
}
