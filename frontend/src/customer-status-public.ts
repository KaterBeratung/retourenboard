type PublicStatus={returnNumber?:string;recordKind?:'disposal';disposalNumber?:string;statusKey?:string;productName?:string;status:string;statusTone:string;isClosed:boolean;updatedAt?:string;publicNote?:string;comments?:{text:string;createdAt:string}[]};
const copy={
 de:{eyebrow:'FÜR DEINE RETOURE',title:'Dein Bearbeitungsstand.',intro:'Hier siehst du den aktuellen Stand deiner Retoure.',statusLabel:'Aktueller Status',numberLabel:'Retourennummer',productLabel:'Produkt',updatedLabel:'Zuletzt aktualisiert',noteLabel:'Nachricht zu deiner Retoure',refresh:'Aktualisieren',refreshing:'Wird aktualisiert …',auto:'Der Status wird automatisch aktualisiert.',privacy:'Diese Ansicht zeigt nur die für diesen Link freigegebenen Angaben.',errorTitle:'Der Status ist gerade nicht verfügbar.',unavailable:'Dieser Link ist ungültig, abgelaufen oder wurde widerrufen. Bitte wende dich an das Team, das dir den Link geschickt hat.',connection:'Die Verbindung konnte nicht hergestellt werden. Bitte versuche es erneut.',rate:'Es gab zu viele Aufrufe. Bitte warte eine Minute und versuche es erneut.',theme:'Darstellung wechseln',language:'Sprache auswählen',comments:'Freigegebene Kommentare',progressLabel:'Fortschritt deiner Retoure',progressReceived:'Eingegangen',progressProcessing:'In Bearbeitung',progressCompleted:'Abgeschlossen',stepDone:'Erledigt',stepCurrent:'Aktueller Schritt',stepUpcoming:'Noch offen'},
 en:{eyebrow:'FOR YOUR RETURN',title:'Your return status.',intro:'Check the current processing status of your return.',statusLabel:'Current status',numberLabel:'Return number',productLabel:'Product',updatedLabel:'Last updated',noteLabel:'A message about your return',refresh:'Refresh',refreshing:'Refreshing …',auto:'The status refreshes automatically.',privacy:'This page shows only the information shared through this link.',errorTitle:'The status is currently unavailable.',unavailable:'This link is invalid, expired or has been revoked. Please contact the team that sent it to you.',connection:'We could not connect. Please try again.',rate:'There have been too many requests. Please wait a minute and try again.',theme:'Switch appearance',language:'Choose language',comments:'Shared comments',progressLabel:'Return progress',progressReceived:'Received',progressProcessing:'Processing',progressCompleted:'Completed',stepDone:'Done',stepCurrent:'Current step',stepUpcoming:'Upcoming'}
};
type RecordKind='returns'|'disposals';
const disposalCopy={de:{eyebrow:'FÜR DEINEN GERÄTEAUFTRAG',title:'Dein Bearbeitungsstand.',intro:'Hier siehst du den aktuellen Stand deines Geräteauftrags.',numberLabel:'Auftragsnummer',productLabel:'Gerät',noteLabel:'Nachricht zu deinem Auftrag',progressLabel:'Fortschritt deines Auftrags',progressReceived:'Vorgemerkt',progressProcessing:'Freigegeben',progressCompleted:'Durchgeführt'},en:{eyebrow:'FOR YOUR DEVICE ORDER',title:'Your order status.',intro:'Check the current processing status of your device order.',numberLabel:'Order number',productLabel:'Device',noteLabel:'A message about your order',progressLabel:'Order progress',progressReceived:'Planned',progressProcessing:'Approved',progressCompleted:'Completed'}};
const disposalStatuses={de:{planned:'Vorgemerkt',approved:'Freigegeben',completed:'Durchgeführt',cancelled:'Storniert'},en:{planned:'Planned',approved:'Approved',completed:'Completed',cancelled:'Cancelled'}};
const words=(language:string,kind:RecordKind='returns')=>({...copy[language==='en'?'en':'de'],...(kind==='disposals'?disposalCopy[language==='en'?'en':'de']:{})});
const numberOf=(data:PublicStatus)=>data.recordKind==='disposal'?data.disposalNumber:data.returnNumber;
const valid=(data:any,kind:RecordKind):data is PublicStatus=>data&&(kind==='disposals'?data.recordKind==='disposal'&&typeof data.disposalNumber==='string'&&['planned','approved','completed','cancelled'].includes(data.statusKey):data.recordKind===undefined&&typeof data.returnNumber==='string')&&['status','statusTone'].every(key=>typeof data[key]==='string')&&typeof data.isClosed==='boolean'&&['productName','publicNote','updatedAt'].every(key=>data[key]===undefined||typeof data[key]==='string')&&(data.updatedAt===undefined||Number.isFinite(Date.parse(data.updatedAt)))&&(data.comments===undefined||Array.isArray(data.comments)&&data.comments.length<=20&&data.comments.every((c:any)=>c&&typeof c.text==='string'&&c.text.length<=5000&&typeof c.createdAt==='string'&&Number.isFinite(Date.parse(c.createdAt))));
const loads=new WeakMap<object,number>();
const rendered=new WeakMap<object,{number:string;status:string;note:string;comments:string}>();
const motion=new WeakMap<object,Animation>();
const easing='cubic-bezier(.22,1,.36,1)';
function writeText(element:any,value:string){if(element&&element.textContent!==value)element.textContent=value;}
function animate(element:any,frames:Keyframe[],duration:number){
 if(typeof matchMedia!=='function'||matchMedia('(prefers-reduced-motion: reduce)').matches||typeof element?.animate!=='function')return;
 // Let finite feedback finish during rapid interactions instead of restarting it.
 if(motion.has(element))return;
 const animation=element.animate(frames,{duration,easing,fill:'none'});motion.set(element,animation);
 const clear=()=>{if(motion.get(element)===animation)motion.delete(element);};
 // A cancelled animation rejects finished; consume both outcomes.
 animation.finished?.then(clear,clear);
}
// This is a phase overview, not an audit history: custom states are never guessed.
export function customerProgressPhase(data:Pick<PublicStatus,'statusTone'|'isClosed'|'recordKind'|'statusKey'>|null):number|null{
 if(!data)return null;
 if(data.recordKind==='disposal')return data.statusKey==='planned'?0:data.statusKey==='approved'?1:data.statusKey==='completed'?2:null;
 if(data.isClosed)return 2;
 if(data.statusTone==='received')return 0;
 if(data.statusTone==='checking'||data.statusTone==='working')return 1;
 return null;
}
function renderProgress(root:any,data:PublicStatus|null,text:ReturnType<typeof words>){
 const progress=root.querySelector('[data-customer-progress]'),phase=customerProgressPhase(data);
 progress.hidden=phase===null;
 if(progress.getAttribute('aria-label')!==text.progressLabel)progress.setAttribute('aria-label',text.progressLabel);
 ['received','processing','completed'].forEach((key,index)=>{
  const step=root.querySelector('[data-customer-step="'+key+'"]'),active=phase!==null&&index===phase;
  const state=phase===null?'upcoming':index<phase||index===phase&&data.isClosed?'complete':active?'current':'upcoming';
  if(step.dataset.state!==state)step.dataset.state=state;
  if(active){if(step.getAttribute('aria-current')!=='step')step.setAttribute('aria-current','step');}
  else if(step.getAttribute('aria-current')!==null)step.removeAttribute('aria-current');
  writeText(step.querySelector('[data-progress-state-label]'),({complete:text.stepDone,current:text.stepCurrent,upcoming:text.stepUpcoming})[state]);
 });
}
export function renderCustomerStatus(root:any,data:PublicStatus|null,language='de',error='unavailable',kind:RecordKind=data?.recordKind==='disposal'?'disposals':'returns'){
 const previous=rendered.get(root),text=words(language,kind),view=root.querySelector('[data-customer-data]');
 for(const [key,value]of Object.entries(text))writeText(root.querySelector('[data-copy="'+key+'"]'),value);
 view.hidden=!data;root.querySelector('[data-customer-error]').hidden=Boolean(data);
 renderProgress(root,data,text);
 root.querySelector('.customer-status-card').dataset.customerPhase=data?'ready':'unavailable';
 for(const [key,value]of Object.entries({number:data?numberOf(data)??'':'',product:data?.productName??'',status:data?.recordKind==='disposal'?(disposalStatuses[language==='en'?'en':'de'] as Record<string,string>)[data.statusKey]??data.status:data?.status??'',note:data?.publicNote??'',updated:data?.updatedAt?new Intl.DateTimeFormat(language==='en'?'en-GB':'de-DE',{dateStyle:'medium',timeStyle:'short'}).format(new Date(data.updatedAt)):''}))writeText(root.querySelector('[data-customer-'+key+']'),value);
 root.querySelector('[data-customer-status]').dataset.tone=data&&['received','checking','working','done','neutral','warning','danger'].includes(data.statusTone)?data.statusTone:'neutral';
 root.querySelector('[data-customer-note-section]').hidden=!data?.publicNote;
 root.querySelector('[data-customer-product-section]').hidden=data?.productName===undefined;
 root.querySelector('[data-customer-updated-section]').hidden=data?.updatedAt===undefined;
 const comments=data?.comments??[],signature=JSON.stringify([language,comments]);
 root.querySelector('[data-customer-comments-section]').hidden=!comments.length;
 if(previous?.comments!==signature){
  const document=root.ownerDocument,list=root.querySelector('[data-customer-comments]');
  list.replaceChildren(...comments.map(comment=>{
   const item=document.createElement('li'),text=document.createElement('p'),date=document.createElement('time');
   text.textContent=comment.text;date.dateTime=comment.createdAt;date.textContent=new Intl.DateTimeFormat(language==='en'?'en-GB':'de-DE',{dateStyle:'medium',timeStyle:'short'}).format(new Date(comment.createdAt));item.append(text,date);return item;
  }));
 }
 writeText(root.querySelector('[data-customer-error-copy]'),text[error]??text.unavailable);
 if(!data){rendered.delete(root);return;}
 const status=JSON.stringify([data.status,data.statusTone,data.isClosed]);
 if(!previous||previous.number!==numberOf(data))animate(view,[{opacity:.25},{opacity:1}],360);
 else{
  if(previous.status!==status)animate(root.querySelector('[data-customer-status]'),[{opacity:.45,transform:'translateY(2px)'},{opacity:1,transform:'translateY(0)'}],380);
  if(data.publicNote&&previous.note!==data.publicNote)animate(root.querySelector('[data-customer-note-section]'),[{opacity:.4},{opacity:1}],300);
 }
 rendered.set(root,{number:numberOf(data),status,note:data.publicNote??'',comments:signature});
}
export async function loadCustomerStatus({root,token,language='de',fetcher=fetch,feedback=false,kind='returns'}:any){
 const sequence=(loads.get(root)??0)+1;loads.set(root,sequence);
 if(!/^[A-Za-z0-9_-]{22}$/.test(token)){renderCustomerStatus(root,null,language,'unavailable',kind);return null;}
 if(feedback)animate(root.querySelector('[data-customer-refresh] svg'),[{transform:'rotate(0deg)'},{transform:'rotate(360deg)'}],620);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
 try{
  const response=await fetcher((kind==='disposals'?'/api/public/disposal-status/':'/api/public/return-status/')+token,{credentials:'omit',cache:'no-store',signal:controller.signal});
  if(!response.ok){if(loads.get(root)===sequence)renderCustomerStatus(root,null,language,response.status===404?'unavailable':response.status===429?'rate':'connection',kind);return null;}
  const data=await response.json();if(!valid(data,kind))throw Error('Invalid public status');
  if(loads.get(root)===sequence)renderCustomerStatus(root,data,language,'unavailable',kind);return data;
 }catch{if(loads.get(root)===sequence)renderCustomerStatus(root,null,language,'connection',kind);return null;}
 finally{clearTimeout(timer);}
}
function start(root:HTMLElement){
 let language=navigator.language?.startsWith('en')?'en':'de',running=false;
 const kind:RecordKind=location.pathname.startsWith('/d/')?'disposals':'returns',token=location.pathname.slice(3),button=root.querySelector<HTMLButtonElement>('[data-customer-refresh]');
 const updateLanguage=()=>{document.documentElement.lang=language;for(const el of root.querySelectorAll<HTMLButtonElement>('[data-customer-language]'))el.setAttribute('aria-pressed',String(el.dataset.customerLanguage===language));root.querySelector('[data-customer-theme]').setAttribute('aria-label',words(language,kind).theme);};
 async function refresh(manual=false){
  if(running)return;running=true;const indicate=manual||!rendered.has(root);
  // Keep the visible label stable so right alignment and the centered icon never jump.
  if(indicate){button.disabled=true;button.setAttribute('aria-busy','true');button.setAttribute('aria-label',words(language,kind).refreshing);}
  try{await loadCustomerStatus({root,token,language,kind,feedback:manual});}
  finally{running=false;button.disabled=false;button.setAttribute('aria-busy','false');button.setAttribute('aria-label',words(language,kind).refresh);writeText(button.querySelector('[data-copy=refresh]'),words(language,kind).refresh);}
 }
 for(const [key,value]of Object.entries(words(language,kind)))if(key!=='errorTitle')writeText(root.querySelector('[data-copy="'+key+'"]'),value);
 document.documentElement.dataset.theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';updateLanguage();
 button.onclick=()=>void refresh(true);root.querySelector<HTMLButtonElement>('[data-customer-theme]').onclick=()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';};
 root.querySelectorAll<HTMLButtonElement>('[data-customer-language]').forEach(el=>el.onclick=()=>{if(running)return;language=el.dataset.customerLanguage==='en'?'en':'de';updateLanguage();void refresh();});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void refresh();});
 setInterval(()=>{if(document.visibilityState==='visible')void refresh();},60000);void refresh();
}
if(typeof document!=='undefined'){const root=document.querySelector<HTMLElement>('[data-customer-root]');if(root)start(root);}
