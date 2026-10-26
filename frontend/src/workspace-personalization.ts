import {html,t,addTranslations} from './i18n.js';
import {h,icon,openDialog} from './ui.js';
import {switchField} from './switches.js';
import {captureAuthContext} from './auth-context.js';

const groups={
 kpis:{label:'Kennzahlen',symbol:'dashboard',cards:[['open','Offene Retouren'],['checking','In Prüfung'],['closed','Abgeschlossen'],['products','Aktive Produkte']]},
 queues:{label:'Dein nächster Schritt',symbol:'arrow',cards:[['mine','Meine offenen Retouren'],['today','Heute fällig'],['unassigned','Nicht zugewiesen']]},
 dashboard:{label:'Bestand und Prozess',symbol:'box',cards:[['recent','Aktuelle Retouren'],['workflow','Dein Retourenprozess']]},
 analytics:{label:'Retouren-Kennzahlen',symbol:'clock',cards:[['completion','Durchschnittliche Bearbeitungszeit'],['reasons','Häufigste Retourengründe'],['trend','Letzte sechs Monate']]}
};
type Group=keyof typeof groups;
export type OverviewPreferences={hidden:string[];order:Record<Group,string[]>;compactEmpty:boolean};
const groupKeys=Object.keys(groups) as Group[];
const cardKeys=new Set(groupKeys.flatMap(group=>groups[group].cards.map(([key])=>key)));
addTranslations({'Übersicht anpassen':'Customize overview','Kennzahlen':'Key figures','Bestand und Prozess':'Inventory and workflow','Leere Karten kompakt anzeigen':'Compact empty cards','Karten innerhalb eines Bereichs verschieben oder ausblenden.':'Move or hide cards within each section.','Nach oben':'Move up','Nach unten':'Move down','Nach oben:':'Move up:','Nach unten:':'Move down:','Übersicht konnte nicht gespeichert werden.':'Could not save overview settings.','Deine Übersicht bleibt für dieses Konto in diesem Browser gespeichert.':'Your overview stays saved for this account in this browser.','Zurücksetzen':'Reset','Karten':'Cards','Reihenfolge':'Order','Reihenfolge ändern:':'Change order:','Bereich auswählen':'Choose a section','Änderungen werden sofort übernommen.':'Changes apply immediately.','Kennzahlen bleiben immer gleich groß.':'Key figure cards always stay the same size.','Fertig':'Done','Standard wiederherstellen':'Restore defaults'});
function sanitize(value:any):OverviewPreferences{
 const order={} as OverviewPreferences['order'];
 for(const group of groupKeys){const allowed=groups[group].cards.map(([key])=>key),given=Array.isArray(value?.order?.[group])?value.order[group]:[];order[group]=[...new Set<string>([...given.filter(key=>typeof key==='string'&&allowed.includes(key)),...allowed])];}
 return {hidden:Array.isArray(value?.hidden)?[...new Set<string>(value.hidden.filter(key=>typeof key==='string'&&cardKeys.has(key)))]:[],order,compactEmpty:value?.compactEmpty===true};
}
export function preferenceAccount(value:any):string|null{
 if(typeof value!=='number'&&typeof value!=='string')return null;
 const text=String(value??'');return /^[1-9]\d*$/.test(text)&&Number.isSafeInteger(Number(text))?text:null;
}
export function preferenceStorage(ctx:any):Pick<Storage,'getItem'|'setItem'>|null{
 try{return ctx.storage===undefined?globalThis.localStorage??null:ctx.storage;}catch{return null;}
}
export function overviewPreferenceStore(storage:Pick<Storage,'getItem'|'setItem'>|null,user:any){
 const account=preferenceAccount(user),key=account?`retourenboard.overview.v1.${account}`:null;
 return {read():OverviewPreferences{try{const source=key?storage?.getItem(key):null;return sanitize(source&&source.length<=20000?JSON.parse(source):null);}catch{return sanitize(null);}},
 save(value:any){try{if(!key||!storage)return false;storage.setItem(key,JSON.stringify(sanitize(value)));return true;}catch{return false;}},reset(){return this.save(null);}};
}
const storeFor=(ctx:any)=>overviewPreferenceStore(preferenceStorage(ctx),ctx.session?.user?.id);
export function moveOverviewCard(value:any,key:string,direction:number):OverviewPreferences{
 const result=sanitize(value),group=groupKeys.find(group=>result.order[group].includes(key));
 if(!group||![1,-1].includes(direction))return result;
 const order=result.order[group],index=order.indexOf(key),target=index+direction;
 if(target>=0&&target<order.length)[order[index],order[target]]=[order[target],order[index]];
 return result;
}
function cardEditor(value:OverviewPreferences,group:Group){
 return html`<fieldset role="tabpanel" id="overview-group-panel" aria-labelledby="overview-group-${group}"><legend class="sr-only">${t(groups[group].label)}</legend><div class="overview-list-heading" aria-hidden="true"><span>Karten</span><span>Reihenfolge</span></div><ul>${value.order[group].map((key,index)=>{const label=t(groups[group].cards.find(([id])=>id===key)[1]);return html`<li>${switchField('',label,!value.hidden.includes(key)).replace('<input ',`<input data-overview-choice="${key}" `)}<div class="overview-move-controls" role="group" aria-label="Reihenfolge ändern: ${h(label)}"><button type="button" class="icon-btn" data-overview-move="${key}" data-move-direction="-1" aria-label="Nach oben: ${h(label)}" title="Nach oben"${index===0?' disabled':''}>${icon('arrow')}</button><button type="button" class="icon-btn" data-overview-move="${key}" data-move-direction="1" aria-label="Nach unten: ${h(label)}" title="Nach unten"${index===value.order[group].length-1?' disabled':''}>${icon('arrow')}</button></div></li>`;}).join('')}</ul></fieldset>`;
}
export function renderOverviewEditor(value:any,selected:Group='kpis'){
 const settings=sanitize(value),group=groupKeys.includes(selected)?selected:'kpis';
 return html`<div class="overview-editor" data-overview-editor><div class="overview-editor-content"><div class="overview-group-tabs" role="tablist" aria-label="Bereich auswählen">${groupKeys.map(key=>html`<button type="button" id="overview-group-${key}" role="tab" data-overview-group-choice="${key}" aria-selected="${key===group}" aria-controls="overview-group-panel" tabindex="${key===group?'0':'-1'}"><span class="overview-group-symbol">${icon(groups[key].symbol)}</span><span>${t(groups[key].label)}</span></button>`).join('')}</div><div class="overview-card-list" data-overview-card-list>${cardEditor(settings,group)}</div><div class="overview-compact-choice">${switchField('',t('Leere Karten kompakt anzeigen'),settings.compactEmpty).replace('<input ','<input data-overview-compact ')}<small>Kennzahlen bleiben immer gleich groß.</small></div><div class="overview-editor-note">${icon('info')}<small>Deine Übersicht bleibt für dieses Konto in diesem Browser gespeichert.</small></div></div><div class="dialog-footer"><button type="button" class="btn secondary" data-overview-reset aria-label="Standard wiederherstellen" title="Standard wiederherstellen"><span class="overview-reset-full">Standard wiederherstellen</span><span class="overview-reset-short" aria-hidden="true">Zurücksetzen</span></button><button type="button" class="btn primary" data-close>${icon('check')}Fertig</button></div></div>`;
}
export function renderOverviewControls(){
 return html`<button type="button" class="btn secondary overview-preferences" data-overview-settings aria-haspopup="dialog">${icon('settings')}<span>Übersicht anpassen</span></button>`;
}
export function applyOverviewPreferences(root:any,value:any){
 const settings=sanitize(value),hidden=new Set(settings.hidden);root.dataset.compactEmpty=String(settings.compactEmpty);
 root.querySelectorAll('[data-overview-group]').forEach(group=>{
  const order=settings.order[group.dataset.overviewGroup as Group];if(!order)return;
  const cards=Array.from(group.children).filter((card:any)=>card.dataset?.overviewCard) as HTMLElement[];
  for(const key of order){const card=cards.find(card=>card.dataset.overviewCard===key);if(card){card.hidden=hidden.has(key);group.append(card);}}
  const visible=cards.filter(card=>!card.hidden).length;group.hidden=visible===0;group.dataset.visibleCards=String(visible);
  const section=group.closest('[data-overview-section]');if(section)section.hidden=group.hidden;
 });
}
export function bindOverviewEditor(ctx:any,root:any,body:any){
 const store=storeFor(ctx),current=captureAuthContext(ctx),cards=body.querySelector('[data-overview-card-list]');
 let group:Group='kpis';
 const apply=()=>applyOverviewPreferences(root,store.read());
 function sync(){const value=store.read();body.querySelectorAll('[data-overview-choice]').forEach(el=>el.checked=!value.hidden.includes(el.dataset.overviewChoice));body.querySelector('[data-overview-compact]').checked=value.compactEmpty;}
 function save(value:any){if(!current())return false;if(!store.save(value)){ctx.toast(t('Übersicht konnte nicht gespeichert werden.'));sync();return false;}apply();return true;}
 function bindCards(){
  body.querySelectorAll('[data-overview-choice]').forEach(el=>el.onchange=()=>{const value=store.read(),key=el.dataset.overviewChoice;value.hidden=el.checked?value.hidden.filter(id=>id!==key):[...value.hidden,key];save(value);});
  body.querySelectorAll('[data-overview-move]').forEach(el=>el.onclick=()=>{if(!save(moveOverviewCard(store.read(),el.dataset.overviewMove,Number(el.dataset.moveDirection))))return;const key=el.dataset.overviewMove,direction=el.dataset.moveDirection;renderCards();const moves=Array.from(body.querySelectorAll('[data-overview-move]')) as HTMLButtonElement[];const choice=Array.from(body.querySelectorAll('[data-overview-choice]')) as HTMLInputElement[];(moves.find(item=>item.dataset.overviewMove===key&&item.dataset.moveDirection===direction&&!item.disabled)??choice.find(item=>item.dataset.overviewChoice===key))?.focus({preventScroll:true});});
 }
 function renderCards(){const scroll=cards.scrollTop;cards.innerHTML=cardEditor(store.read(),group);cards.scrollTop=scroll;bindCards();}
 const tabs=Array.from(body.querySelectorAll('[data-overview-group-choice]')) as HTMLButtonElement[];
 function select(key:Group,focus=false){if(!current())return;group=key;tabs.forEach(tab=>{const active=tab.dataset.overviewGroupChoice===group;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;if(active&&focus)tab.focus();});renderCards();}
 tabs.forEach((tab,index)=>{tab.onclick=()=>select(tab.dataset.overviewGroupChoice as Group);tab.onkeydown=event=>{const step=['ArrowRight','ArrowDown'].includes(event.key)?1:['ArrowLeft','ArrowUp'].includes(event.key)?-1:0;if(step||event.key==='Home'||event.key==='End'){event.preventDefault();select(groupKeys[event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+step+tabs.length)%tabs.length],true);}};});
 const compact=body.querySelector('[data-overview-compact]');compact.onchange=()=>save({...store.read(),compactEmpty:compact.checked});
 body.querySelector('[data-overview-reset]').onclick=()=>{if(save(null)){renderCards();sync();}};
 bindCards();return {apply};
}
export function bindOverviewControls(ctx:any,root:any){
 const trigger=root.querySelector('[data-overview-settings]');if(!trigger)return;
 const current=captureAuthContext(ctx),apply=()=>applyOverviewPreferences(root,storeFor(ctx).read());
 trigger.onclick=()=>{if(!current())return;const dialog=openDialog({title:t('Übersicht anpassen'),subtitle:t('Karten innerhalb eines Bereichs verschieben oder ausblenden.')+' '+t('Änderungen werden sofort übernommen.'),body:renderOverviewEditor(storeFor(ctx).read())});dialog.classList.add('overview-settings-dialog');bindOverviewEditor(ctx,root,dialog.querySelector('[data-overview-editor]'));};
 apply();return {apply};
}
