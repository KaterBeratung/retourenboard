type PreferenceStorage=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
type Choice={version:1;preferences:boolean;expiresAt:number};
export const privacyStorageKey='retourenboard.website.privacy';
const lifetime=180*86400000;
const values:Record<string,readonly string[]>={
 'retourenboard.website.theme':['light','dark'],
 'retourenboard.website.language':['de','en'],
 'retourenboard.website.motion':['on','off'],
};

// Only the privacy decision is read before consent. Display controls still
// work in memory; they never need optional persistent storage to function.
export function createPreferencePrivacy(raw:()=>PreferenceStorage|undefined,now:()=>number=Date.now){
 const memory=new Map<string,string>(),listeners=new Set<()=>void>();let choice:Choice|null=null;
 const notify=()=>{for(const listener of listeners)listener();};
 const removePreferences=()=>{for(const key of Object.keys(values))try{raw()?.removeItem(key);}catch{/* Storage can be disabled. */}};
 function sync(){
  let next:Choice|null=null;
  try{const parsed=JSON.parse(raw()?.getItem(privacyStorageKey)??'null');
   if(parsed?.version===1&&typeof parsed.preferences==='boolean'&&Number.isFinite(parsed.expiresAt)&&parsed.expiresAt<=now()){removePreferences();raw()?.removeItem(privacyStorageKey);}
   if(parsed?.version===1&&typeof parsed.preferences==='boolean'&&Number.isFinite(parsed.expiresAt)&&parsed.expiresAt>now()&&parsed.expiresAt<=now()+lifetime)next={version:1,preferences:parsed.preferences,expiresAt:parsed.expiresAt};
  }catch{/* Invalid or unavailable storage never grants permission. */}
  const changed=choice?.preferences!==next?.preferences||choice?.expiresAt!==next?.expiresAt;choice=next;if(changed)notify();
 }
 function state():boolean|null{
  if(choice&&choice.expiresAt<=now()){choice=null;removePreferences();try{raw()?.removeItem(privacyStorageKey);}catch{}notify();}
  return choice?.preferences??null;
 }
 function choose(remember:boolean){
  choice={version:1,preferences:remember,expiresAt:now()+lifetime};
  if(!remember)removePreferences();
  try{raw()?.setItem(privacyStorageKey,JSON.stringify(choice));}catch{/* Choice remains effective for this page. */}
  if(remember)for(const [key,value]of memory)try{raw()?.setItem(key,value);}catch{}
  notify();
 }
 const valid=(key:string,value:string|null):value is string=>typeof value==='string'&&Object.hasOwn(values,key)&&values[key].includes(value);
 const storage={
  getItem(key:string):string|null{
   if(!Object.hasOwn(values,key))return null;
   const allowed=state()===true;
   if(memory.has(key))return memory.get(key)!;
   if(allowed)try{const saved=raw()?.getItem(key)??null;if(valid(key,saved)){memory.set(key,saved);return saved;}}catch{}
   return null;
  },
  setItem(key:string,value:string){if(!valid(key,value))return;const allowed=state()===true;memory.set(key,value);if(allowed)try{raw()?.setItem(key,value);}catch{}},
 };
 sync();return {storage,state,choose,sync,onChange:(listener:()=>void)=>listeners.add(listener)};
}

export function bindPrivacyBanner(page:Document,privacy:ReturnType<typeof createPreferencePrivacy>){
 const banner=page.querySelector<HTMLDialogElement>('#privacy-banner');if(!banner)return;
 const openers=[...page.querySelectorAll<HTMLButtonElement>('[data-privacy-open]')];let opener:HTMLButtonElement|null=null;
 function show(){if(!banner!.open)banner!.showModal();}
 function close(){if(banner!.open)banner!.close();}
 page.querySelector<HTMLButtonElement>('[data-privacy-dismiss]')?.addEventListener('click',close);
 banner.addEventListener('close',()=>{opener?.focus({preventScroll:true});opener=null;});
 for(const button of openers){button.hidden=false;button.addEventListener('click',()=>{opener=button;show();});}
 for(const button of page.querySelectorAll<HTMLButtonElement>('[data-privacy-choice]'))button.addEventListener('click',()=>{privacy.choose(button.dataset.privacyChoice==='remember');close();});
 privacy.onChange(()=>{if(privacy.state()===null)show();else close();});
 if(privacy.state()===null)show();
}
