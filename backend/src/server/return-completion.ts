import {InputError} from '../shared/model.js';
import {inspectCompletion,completionPolicy} from '../shared/return-completion.js';
import {serialKey} from '../shared/serial-number.js';
export async function returnCompletionState(store:any,row:any,rules:any,masters?:any){
 const linked=row.id?(await store.db.query('SELECT id,disposalNumber,returnId,serialNumber,mode,status,revision,updatedAt FROM disposals WHERE returnId=$1 ORDER BY id DESC',[row.id])).rows:[];
 return inspectCompletion(row,masters??await store.listMasterData(),rules,linked);
}
export async function assertReturnCompletion(store:any,data:any,old:any,rules:any,masters:any,options:any={}){
 const policy=completionPolicy(rules),closed=!!masters.statuses.find((item:any)=>item.id===data.statusId)?.isClosed;
 const changed=!old||Object.entries(data).some(([field,value])=>field!=='returnNumber'&&JSON.stringify(value)!==JSON.stringify(old[field]));
 if(old?.isClosed&&!closed&&!options.allowReopen)throw new InputError('Abgeschlossene Retouren bitte mit Begründung wieder öffnen.',409);
 if(old?.isClosed&&changed&&policy.protectClosedReturns&&!options.allowReopen&&!options.allowClosedEdit)throw new InputError('Diese Retoure ist abgeschlossen. Bitte vor der Bearbeitung mit Begründung wieder öffnen.',409);
 if(old&&serialKey(data.serialNumber)!==serialKey(old.serialNumber)&&(await store.db.query("SELECT 1 FROM disposals WHERE returnId=$1 AND status<>'cancelled' LIMIT 1",[old.id])).rowCount)throw new InputError('Die Seriennummer kann bei verknüpfter Entsorgung nicht geändert werden. Bitte den Auftrag zuerst prüfen.',409);
 if(closed&&(!old?.isClosed||changed)){
  const state=await returnCompletionState(store,{...data,id:old?.id},rules,masters);if(!state.ok)throw new InputError(state.issues[0].message);
 }
}
