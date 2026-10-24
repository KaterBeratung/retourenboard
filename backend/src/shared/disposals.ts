import {InputError} from './model.js';
export const DISPOSAL_MODES={destroy:'Physische Vernichtung',erase:'Sichere Datenlöschung',dispose:'Entsorgung'} as const;
export const DISPOSAL_STATUSES={planned:'Vorgemerkt',approved:'Freigegeben',completed:'Durchgeführt',cancelled:'Storniert'} as const;
export type DisposalMode=keyof typeof DISPOSAL_MODES;
export type DisposalStatus=keyof typeof DISPOSAL_STATUSES;
import {serialKey} from './serial-number.js';
export {serialKey} from './serial-number.js';
export function disposalText(value:unknown,label:string,max=250,required=false){if(value===undefined||value===null)value='';if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))throw new InputError(label+': ungültiger Text.');const result=value.trim();if(required&&!result)throw new InputError(label+' ist erforderlich.');return result;}
export function disposalDate(value:unknown){const text=disposalText(value,'Durchführungsdatum',10,true);const date=new Date(text+'T12:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(text)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==text)throw new InputError('Bitte ein gültiges Durchführungsdatum angeben.');return text;}
export function validateDisposalRecord(row:any){
 if(!row||typeof row!=='object'||Array.isArray(row)||typeof row.mode!=='string'||typeof row.status!=='string'||!Object.hasOwn(DISPOSAL_MODES,row.mode)||!Object.hasOwn(DISPOSAL_STATUSES,row.status))throw new InputError('Ungültiger Geräteauftrag.');
 disposalText(row.productName,'Gerätebezeichnung',250,true);disposalText(row.sku,'Artikelnummer');disposalText(row.manufacturer,'Hersteller');disposalText(row.serialNumber,'Seriennummer / Gerätekennung',250,true);if(row.serialKey!==serialKey(row.serialNumber))throw new InputError('Ungültige Gerätekennung.');
 if(!Number.isSafeInteger(row.id)||row.id<1||typeof row.disposalNumber!=='string'||!/^DIS-\d{4}-\d{6,16}$/.test(row.disposalNumber)||!Number.isSafeInteger(row.revision)||row.revision<1)throw new InputError('Ungültiger Geräteauftrag.');
 if(!row.details||typeof row.details!=='object'||Array.isArray(row.details))throw new InputError('Ungültige Auftragsangaben.');
 for(const field of ['createdAt','updatedAt'])if(typeof row[field]!=='string'||!Number.isFinite(Date.parse(row[field])))throw new InputError('Ungültiger Auftragszeitpunkt.');
 for(const field of ['notes','reason','location','ownerReference'])disposalText(row.details[field],field,field==='notes'?4000:500);
 if(['approved','completed'].includes(row.status)){disposalText(row.details.approvedByName,'Freigegeben durch',250,true);if(typeof row.details.approvedAt!=='string'||!Number.isFinite(Date.parse(row.details.approvedAt)))throw new InputError('Freigabezeitpunkt fehlt.');}
 if(row.status==='completed'){disposalDate(row.details.completedOn);disposalText(row.details.method,'Verfahren',500,true);disposalText(row.details.performedBy,'Ausführende Person / Dienstleister',250,true);disposalText(row.details.documentedByName,'Dokumentiert durch',250,true);if(typeof row.details.documentedAt!=='string'||!Number.isFinite(Date.parse(row.details.documentedAt)))throw new InputError('Dokumentationszeitpunkt fehlt.');}
 if(row.status==='cancelled')disposalText(row.details.cancellationReason,'Stornierungsgrund',500,true);
 return row;
}

/** Incremental validation keeps large backup histories bounded to one snapshot. */
export function createDisposalHistoryCheck(row:any){
 validateDisposalRecord(row);let revision=0,last:any=null;
 const fail=()=>{throw new InputError('Auftrag und Verlauf passen nicht zusammen.');};
 return {add(event:any){
  if(!event||event.revision!==++revision||typeof event.action!=='string'||typeof event.createdAt!=='string'||!Number.isFinite(Date.parse(event.createdAt)))fail();
  textActor(event.actorName);const snapshot=validateDisposalRecord(event.snapshot);
  if(snapshot.id!==row.id||snapshot.disposalNumber!==row.disposalNumber||snapshot.revision!==revision)fail();
  const from=last?.status,to=snapshot.status;
  const legal=event.action==='create'?revision===1&&to==='planned':event.action==='update'?from==='planned'&&to==='planned':event.action==='approve'?from==='planned'&&to==='approved':event.action==='complete'?from==='approved'&&to==='completed':event.action==='cancel'?['planned','approved'].includes(from)&&to==='cancelled':event.action==='correct'?from==='completed'&&to==='completed':event.action==='import'?!!from&&from===to:false;
  if(!legal)fail();last=snapshot;
 },finish(){
  if(!last||revision!==row.revision)fail();
  for(const key of ['disposalNumber','productName','sku','manufacturer','serialNumber','serialKey','mode','status','revision','createdAt','updatedAt'])if(last[key]!==row[key])fail();
  if(JSON.stringify(last.details)!==JSON.stringify(row.details))fail();
 }};
}
function textActor(value:any){disposalText(value,'Person',250,true);}
