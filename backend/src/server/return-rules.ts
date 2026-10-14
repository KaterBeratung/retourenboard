import {InputError} from '../shared/model.js';
import type {ReturnRules,Clock} from '../shared/types.js';
export const defaultRules:ReturnRules={requiredFields:[],deadlineDays:14,numberPrefix:'RET',timezone:'Europe/Berlin'};
export function checkReturnFields(input:Record<string,unknown>,rules:ReturnRules){
  const labels={serialNumber:'Seriennummer',orderNumber:'Bestellnummer',supplier:'Lieferant',notes:'Notizen'};
  for(const field of rules.requiredFields)if(!String(input[field]??'').trim())throw new InputError(`${labels[field]} ist laut Retourenregeln erforderlich.`);
}
export function dueDate(receiptDate:string,deadlineDays:number):string|null{
  if(deadlineDays===0||receiptDate==='')return null;
  const date=new Date(`${receiptDate}T12:00:00Z`);if(!/^\d{4}-\d{2}-\d{2}$/.test(receiptDate)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==receiptDate||!Number.isInteger(deadlineDays)||deadlineDays<1||deadlineDays>365)throw new InputError('Ungültige Kalenderfrist.');
  date.setUTCDate(date.getUTCDate()+deadlineDays);return date.toISOString().slice(0,10);
}
const calendarFormatters=new Map<string,Intl.DateTimeFormat>();
export function calendarDate(time:number,timezone:string):string{
  let formatter=calendarFormatters.get(timezone);
  if(!formatter){
    formatter=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'});
    // Reuse ICU formatters during minute-by-minute backup scans, with bounded memory.
    if(calendarFormatters.size>=32)calendarFormatters.delete(calendarFormatters.keys().next().value!);
    calendarFormatters.set(timezone,formatter);
  }
  const p=formatter.formatToParts(time),get=(type:string)=>p.find(x=>x.type===type)!.value;return `${get('year')}-${get('month')}-${get('day')}`;
}
export function isOverdue(ret:{receiptDate:string,isClosed?:boolean},rules:Pick<ReturnRules,'deadlineDays'|'timezone'>,clock:Clock):boolean{const due=dueDate(ret.receiptDate,rules.deadlineDays);return !ret.isClosed&&due!==null&&calendarDate(clock.now(),rules.timezone)>due;}
