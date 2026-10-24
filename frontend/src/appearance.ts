export function motionAllowed(account:any,systemReduced:boolean){
  if(account.motionMode==='on')return true;
  if(account.motionMode==='off')return false;
  if(account.motionMode==='system')return !systemReduced;
  return !account.reduceMotion&&!systemReduced;
}
let currentAccount:any={reduceMotion:false};
function updateMotion(){document.documentElement.dataset.motion=motionAllowed(currentAccount,window.matchMedia('(prefers-reduced-motion: reduce)').matches)?'normal':'reduce';}
if(typeof window!=='undefined'){
  window.addEventListener('account-preferences',(event:CustomEvent)=>{currentAccount=event.detail;updateMotion();});
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',updateMotion);
  updateMotion();
}
export function applyAccountAppearance(account:any){window.dispatchEvent(new CustomEvent('account-preferences',{detail:account}));}
export function motionScrollBehavior():ScrollBehavior{return document.documentElement.dataset.motion==='normal'?'smooth':'auto';}
