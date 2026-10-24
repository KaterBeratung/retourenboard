import {html,t,formatDate} from './i18n.js';
import {h} from './forms.js';
export function overdueMarker(item:{overdue?:boolean;dueDate?:string}){
 if(!item.overdue)return '';
 const raw=item.dueDate??'',parsed=new Date(raw+'T12:00:00Z');
 const valid=/^\d{4}-\d{2}-\d{2}$/.test(raw)&&Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===raw;
 const dueDate=valid?formatDate(parsed,{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'UTC'},'toLocaleDateString'):raw;
 return html`<span class="overdue-label" title="${t('Frist')}: ${h(dueDate)}">Überfällig${raw?html` · ${h(dueDate)}`:''}</span>`;
}
export function auditLink(entity:string,id:number){return `/admin#audit?${new URLSearchParams({entity,entityId:String(id)})}`;}
