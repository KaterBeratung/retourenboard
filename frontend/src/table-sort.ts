import {html,t,addTranslations,locale} from './i18n.js';
import {h} from './ui.js';
import {preferenceAccount,preferenceStorage} from './workspace-personalization.js';
import {captureAuthContext} from './auth-context.js';
type Kind='products'|'returns';
export type InventorySort={key:string;direction:'asc'|'desc'};
const columns={products:[['identity','Produkt'],['ean','EAN'],['supplier','Lieferant'],['category','Kategorie'],['price','Preis'],['status','Status']],returns:[['identity','Retoure / Produkt'],['supplier','Lieferant'],['serial','Seriennummer'],['reason','Retourengrund'],['received','Erfasst / Eingang'],['status','Status']]};
addTranslations({'Sortieren':'Sort','Standardreihenfolge':'Default order','Aufsteigend':'Ascending','Absteigend':'Descending','Sortierung konnte nicht gespeichert werden.':'Could not save sorting settings.'});
function sanitize(kind:Kind,value:any):InventorySort{
 return columns[kind].some(([key])=>key===value?.key)?{key:value.key,direction:value.direction==='desc'?'desc':'asc'}:{key:'',direction:'asc'};
}
export function tableSortStore(storage:Pick<Storage,'getItem'|'setItem'>|null,user:any){
 const account=preferenceAccount(user),key=(kind:Kind)=>`retourenboard.sort.v1.${account}.${kind}`;
 return {read(kind:Kind):InventorySort{try{const source=account?storage?.getItem(key(kind)):null;return sanitize(kind,source&&source.length<=1000?JSON.parse(source):null);}catch{return sanitize(kind,null);}},
 save(kind:Kind,value:any){try{if(!account||!storage)return false;storage.setItem(key(kind),JSON.stringify(sanitize(kind,value)));return true;}catch{return false;}}};
}
const storeFor=(ctx:any)=>tableSortStore(preferenceStorage(ctx),ctx.session?.user?.id);
function temporary(ctx:any){
 const account=preferenceAccount(ctx.session?.user?.id),generation=ctx.authGeneration;
 if(ctx.inventorySort?.account!==account||ctx.inventorySort?.generation!==generation)ctx.inventorySort={account,generation,values:{}};
 return ctx.inventorySort.values;
}
export const readInventorySort=(ctx:any,kind:Kind):InventorySort=>temporary(ctx)[kind]??storeFor(ctx).read(kind);
export function setInventorySort(ctx:any,kind:Kind,value:any){const settings=sanitize(kind,value);temporary(ctx)[kind]=settings;return storeFor(ctx).save(kind,settings);}
function sortValue(row:any,kind:Kind,key:string,label?:(row:any,key:string)=>any):string|number|null{
 if(key==='price')return typeof row.priceCents==='number'&&Number.isFinite(row.priceCents)?row.priceCents:null;
 if(key==='received'){const date=typeof row.createdAt==='string'&&row.createdAt.trim()?Date.parse(row.createdAt):NaN;return Number.isFinite(date)?date:null;}
 const raw=label?label(row,key):key==='identity'?(kind==='products'?row.name:row.returnNumber):key==='serial'?row.serialNumber:key==='status'&&kind==='products'?(row.active?t('Aktiv'):t('Archiviert')):row[key];
 return raw==null||String(raw).trim()===''?null:String(raw);
}
export function sortInventoryRows<T>(rows:T[],kind:Kind,value:any,{label,language=locale()}:{label?:(row:T,key:string)=>any;language?:string}={}):T[]{
 const settings=sanitize(kind,value);if(!settings.key)return rows.slice();
 let compare:Intl.Collator;try{compare=new Intl.Collator(language,{numeric:true,sensitivity:'base'});}catch{compare=new Intl.Collator('de-DE',{numeric:true,sensitivity:'base'});}
 return rows.map((row,index)=>({row,index,value:sortValue(row,kind,settings.key,label)})).sort((a,b)=>{
  if(a.value===null||b.value===null)return a.value===b.value?a.index-b.index:a.value===null?1:-1;
  const result=typeof a.value==='number'&&typeof b.value==='number'?a.value-b.value:compare.compare(String(a.value),String(b.value));
  return (settings.direction==='desc'?-result:result)||a.index-b.index;
 }).map(item=>item.row);
}
export function sortableHeading(kind:Kind,key:string,value:any){
 const settings=sanitize(kind,value),label=t(columns[kind].find(([id])=>id===key)?.[1]??''),active=settings.key===key;
 return html`<th scope="col"${key==='identity'?'':html` data-column="${key}"`}${key==='status'?' class="record-status-heading"':''} aria-sort="${active?settings.direction==='desc'?'descending':'ascending':'none'}"><button type="button" class="table-sort-button" data-sort-key="${key}"><span>${h(label)}</span><span class="table-sort-indicator" aria-hidden="true">${active?settings.direction==='desc'?'↓':'↑':'↕'}</span></button></th>`;
}
export function renderMobileSorting(kind:Kind,value:any){
 const settings=sanitize(kind,value);
 return html`<div class="mobile-table-sorting"><label><span>Sortieren</span><select data-mobile-sort aria-label="Sortieren"><option value=""${settings.key?'':' selected'}>Standardreihenfolge</option>${columns[kind].map(([key,label])=>html`<option value="${key}"${settings.key===key?' selected':''}>${t(label)}</option>`).join('')}</select></label><button type="button" class="btn secondary small" data-sort-direction${settings.key?'':' disabled'}>${settings.direction==='asc'?t('Aufsteigend'):t('Absteigend')} <span aria-hidden="true">${settings.direction==='asc'?'↑':'↓'}</span></button></div>`;
}
export function bindInventorySorting(ctx:any,root:any,kind:Kind,refresh:()=>void){
 const current=captureAuthContext(ctx);
 function update(value:InventorySort,focus:{key?:string;mobile?:boolean;direction?:boolean}){
  if(!current())return;
  if(!setInventorySort(ctx,kind,value))ctx.toast(t('Sortierung konnte nicht gespeichert werden.'));
  refresh();
  const host=root.isConnected?root:document.querySelector('#table-content');
  const target=focus.mobile?host?.querySelector('[data-mobile-sort]'):focus.direction?host?.querySelector('[data-sort-direction]'):Array.from(host?.querySelectorAll('[data-sort-key]')??[]).find((node:any)=>node.dataset.sortKey===focus.key) as HTMLElement;
  target?.focus({preventScroll:true});
 }
 root.querySelectorAll('[data-sort-key]').forEach(el=>el.onclick=()=>{const previous=readInventorySort(ctx,kind),key=el.dataset.sortKey;update(previous.key===key?(previous.direction==='asc'?{key,direction:'desc'}:{key:'',direction:'asc'}):{key,direction:'asc'},{key});});
 root.querySelectorAll('[data-mobile-sort]').forEach(el=>el.onchange=()=>update({key:el.value,direction:readInventorySort(ctx,kind).direction},{mobile:true}));
 root.querySelectorAll('[data-sort-direction]').forEach(el=>el.onclick=()=>{const value=readInventorySort(ctx,kind);update({...value,direction:value.direction==='asc'?'desc':'asc'},{direction:true});});
}
