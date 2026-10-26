import {html,t,addTranslations} from './i18n.js';
import {icon} from './ui.js';
import {switchField} from './switches.js';
type Kind='products'|'returns'|'disposals';
type Preferences={hidden:string[];density:'compact'|'comfortable'};
const columns={products:[['ean','EAN'],['supplier','Lieferant'],['category','Kategorie'],['price','Preis'],['status','Status']],returns:[['supplier','Lieferant'],['serial','Seriennummer'],['reason','Retourengrund'],['received','Erfasst / Eingang'],['status','Status']],disposals:[['status','Status'],['serial','Seriennummer / Gerätekennung'],['mode','Maßnahme'],['received','Erfasst']]};
addTranslations({'Tabellenansicht':'Table view','Spalten':'Columns','Zeilenabstand':'Row spacing','Kompakt':'Compact','Großzügig':'Comfortable','Standard wiederherstellen':'Restore defaults','Produkt und Aktionen bleiben sichtbar.':'Product and actions remain visible.','Gerät und Aktionen bleiben sichtbar.':'Device and actions remain visible.','Ansicht konnte nicht gespeichert werden.':'Could not save view settings.'});
function sanitize(kind:Kind,value:any):Preferences{
 const allowed=new Set(columns[kind].map(([key])=>key));
 return {hidden:Array.isArray(value?.hidden)?[...new Set<string>(value.hidden.filter(key=>typeof key==='string'&&allowed.has(key)))]:[],density:value?.density==='compact'?'compact':'comfortable'};
}
export function tablePreferenceStore(storage:Pick<Storage,'getItem'|'setItem'>|null,user:any){
 const account=/^[1-9]\d*$/.test(String(user))?String(user):'anonymous';
 const key=(kind:Kind)=>`retourenboard.table.v1.${account}.${kind}`;
 return {read(kind:Kind):Preferences{try{return sanitize(kind,JSON.parse(storage?.getItem(key(kind))??'null'));}catch{return sanitize(kind,null);}},
 save(kind:Kind,value:any){try{if(!storage||account==='anonymous')return false;storage.setItem(key(kind),JSON.stringify(sanitize(kind,value)));return true;}catch{return false;}},
 reset(kind:Kind){return this.save(kind,null);}};
}
function storeFor(ctx:any){let storage;try{storage=ctx.storage??globalThis.localStorage;}catch{storage=null;}return tablePreferenceStore(storage,ctx.session?.user?.id);}
export const readTablePreferences=(ctx:any,kind:Kind)=>storeFor(ctx).read(kind);
export function renderTableControls(ctx:any,kind:Kind){
 const settings=storeFor(ctx).read(kind);
 return html`<details class="table-preferences" data-table-settings><summary>${icon('settings')}<span>Tabellenansicht</span>${icon('chevron')}</summary><div class="table-preferences-menu"><div class="table-preferences-heading"><strong>Tabellenansicht</strong><button type="button" class="icon-btn" data-table-close aria-label="Schließen">${icon('close')}</button></div><fieldset><legend>Zeilenabstand</legend><div class="density-options"><button type="button" data-table-density="comfortable" aria-pressed="${settings.density==='comfortable'}">Großzügig</button><button type="button" data-table-density="compact" aria-pressed="${settings.density==='compact'}">Kompakt</button></div></fieldset><fieldset><legend>Spalten</legend>${columns[kind].map(([key,label])=>switchField('',t(label),!settings.hidden.includes(key)).replace('<input ','<input data-column-choice="'+key+'" ')).join('')}</fieldset><small>${t(kind==='disposals'?'Gerät und Aktionen bleiben sichtbar.':'Produkt und Aktionen bleiben sichtbar.')}</small><button class="text-link" type="button" data-table-reset>Standard wiederherstellen</button></div></details>`;
}
export function applyTablePreferences(root:any,kind:Kind,value:any){
 const settings=sanitize(kind,value),hidden=new Set(settings.hidden);
 root.dataset.tableDensity=settings.density;
 root.querySelectorAll('[data-column]').forEach(el=>el.hidden=hidden.has(el.dataset.column));
}
export function bindTableControls(ctx:any,root:any,kind:Kind){
 const store=storeFor(ctx),menu=root.querySelector('[data-table-settings]');
 if(!menu)return;
 function apply(){const value=store.read(kind);applyTablePreferences(root,kind,value);menu.querySelectorAll('[data-column-choice]').forEach(el=>el.checked=!value.hidden.includes(el.dataset.columnChoice));menu.querySelectorAll('[data-table-density]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.tableDensity===value.density)));}
 function save(value:Preferences){if(!store.save(kind,value))ctx.toast(t('Ansicht konnte nicht gespeichert werden.'));else apply();}
 menu.querySelectorAll('[data-column-choice]').forEach(el=>el.onchange=()=>{const value=store.read(kind);value.hidden=el.checked?value.hidden.filter(key=>key!==el.dataset.columnChoice):[...value.hidden,el.dataset.columnChoice];save(value);});
 menu.querySelectorAll('[data-table-density]').forEach(el=>el.onclick=()=>save({...store.read(kind),density:el.dataset.tableDensity}));
 menu.querySelector('[data-table-reset]').onclick=()=>save({hidden:[],density:'comfortable'});
 const close=()=>{menu.open=false;menu.querySelector('summary').focus({preventScroll:true});};
 menu.querySelector('[data-table-close]').onclick=close;
 menu.addEventListener('keydown',event=>{if(event.key==='Escape')close();});
 apply();
 return {apply};
}
