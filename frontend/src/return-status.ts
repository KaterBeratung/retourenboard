import {html,t,locale} from './i18n.js';
import {h} from './forms.js';
export function overdueMarker(item:{overdue?:boolean;dueDate?:string}){return item.overdue?html`<span class="overdue-label" title="Frist: ${h(item.dueDate??'')}">Überfällig${item.dueDate?' · '+h(item.dueDate):''}</span>`:'';}
export function auditLink(entity:string,id:number){return `/admin#audit?${new URLSearchParams({entity,entityId:String(id)})}`;}
