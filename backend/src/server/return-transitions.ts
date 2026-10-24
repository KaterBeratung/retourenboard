import {InputError} from '../shared/model.js';
import {hasPermission} from '../shared/permissions.js';
import {disposalText} from '../shared/disposals.js';
import {checkRecordRevision} from './database/record-metadata.js';
export function createReturnTransitions(store:any){
 const id=(value:any)=>{if(typeof value!=='number'||!Number.isSafeInteger(value)||value<1)throw new InputError('Ungültige ID.');return value;};
 return async function transition(user:any,recordId:number,action:'reopen'|'handover',input:any){
  if(!hasPermission(user,'returnsEdit')||!hasPermission(user,'returnsStatus'))throw new InputError('Für diese Aktion werden Retourenbearbeitung und Statusänderung benötigt.',403);
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!(action==='reopen'?['statusId','reason','expectedUpdatedAt','revision']:['statusId','assignedUserId','nextStep','expectedUpdatedAt','revision']).includes(key)))throw new InputError('Ungültige Übergabe oder Wiederöffnung.');
  const statusId=id(input.statusId),reason=action==='reopen'?disposalText(input.reason,'Begründung',500,true):'',nextStep=action==='handover'?disposalText(input.nextStep,'Nächster Schritt',500,true):'';
  return store.transaction(async()=>{
   await store.db.query('SELECT id FROM returns WHERE id=$1 FOR UPDATE',[id(recordId)]);const row=await store.getReturn(recordId);if(!row)throw new InputError('Retoure nicht gefunden.',404);
   if(input.revision!==undefined)await checkRecordRevision(store.db,'returns',recordId,input.revision);
   if(typeof input.expectedUpdatedAt!=='string'||input.expectedUpdatedAt!==row.updatedAt)throw new InputError('Die Retoure wurde inzwischen geändert. Bitte erneut öffnen.',409);
   const target=await store.masters.resolve('statuses',statusId,null,true);if(target.isClosed)throw new InputError('Bitte einen offenen Bearbeitungsstatus auswählen.');
   if(action==='reopen'){if(!row.isClosed)throw new InputError('Diese Retoure ist bereits offen.',409);return store.updateReturn(recordId,{...row,statusId},{allowReopen:true,reopenReason:reason});}
   if(row.isClosed)throw new InputError('Abgeschlossene Retouren bitte mit Begründung wieder öffnen.',409);
   const assignedUserId=id(input.assignedUserId),person=(await store.db.query('SELECT active FROM users WHERE id=$1 AND deletedAt IS NULL',[assignedUserId])).rows[0];if(!person?.active)throw new InputError('Nur aktive Konten können neu zugeordnet werden.');
   return store.updateReturn(recordId,{...row,statusId,assignedUserId,nextStep});
  });
 };
}
