type Theme='light'|'dark';
type ThemeStorage=Pick<Storage,'getItem'|'setItem'>;

export function bindThemeToggle(page:Document,system:MediaQueryList,storage:()=>ThemeStorage|undefined){
 const button=page.querySelector<HTMLButtonElement>('#theme-toggle');
 const key='retourenboard.website.theme';let preference:Theme|undefined;
 try{const saved=storage()?.getItem(key);if(saved==='light'||saved==='dark')preference=saved;}catch{/* The switch remains usable without storage. */}
 function apply(){
  const theme=preference??(system.matches?'dark':'light');
  page.documentElement.dataset.theme=theme;page.documentElement.style.colorScheme=theme;
  page.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='dark'?'#0a131d':'#edf2f5');
  if(button){button.setAttribute('aria-pressed',String(theme==='dark'));button.hidden=false;}
 }
 button?.addEventListener('click',()=>{
  preference=page.documentElement.dataset.theme==='dark'?'light':'dark';apply();
  try{storage()?.setItem(key,preference);}catch{/* Keep the choice for this visit. */}
 });
 system.addEventListener('change',()=>{if(!preference)apply();});apply();
}
