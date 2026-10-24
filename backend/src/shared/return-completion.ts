export const completionDefaults={completionRequiredFields:['resolution'] as ('resolution'|'notes')[],requireReplacementSerialOnExchange:true,requireCompletedDisposal:true,protectClosedReturns:true,exchangeResolutionIds:[] as number[],disposalResolutionIds:[] as number[]};
export type CompletionIssue={field:string;code:string;message:string};
import {serialKey as key} from './serial-number.js';
export function completionPolicy(rules:any={}){return {...completionDefaults,...rules};}
export function inspectCompletion(row:any,masters:any,rules:any={},disposals:any[]=[]){
 const policy=completionPolicy(rules),issues:CompletionIssue[]=[],solution=(masters.resolutions??[]).find((item:any)=>item.id===Number(row.resolutionId));
 const add=(field:string,code:string,message:string)=>issues.push({field,code,message});
 if(policy.completionRequiredFields.includes('resolution')&&(!solution||solution.builtinKey==='resolutions.pending'))add('resolutionId','resolution','Für den Abschluss bitte eine abgeschlossene Lösung auswählen.');
 if(policy.completionRequiredFields.includes('notes')&&!String(row.notes??'').trim())add('notes','notes','Für den Abschluss bitte das Bearbeitungsergebnis in den Notizen dokumentieren.');
 const exchange=solution?.builtinKey==='resolutions.exchange'||policy.exchangeResolutionIds.includes(solution?.id);
 if(policy.requireReplacementSerialOnExchange&&exchange&&!String(row.replacementSerialNumber??'').trim())add('replacementSerialNumber','replacement','Für den Abschluss eines Austauschs ist die Austauschseriennummer erforderlich.');
 const linked=disposals.filter(item=>item.status!=='cancelled');
 if(policy.requireCompletedDisposal){
  if(linked.some(item=>item.status!=='completed'))add('disposal','disposalPending','Die verknüpfte Entsorgung muss zuerst durchgeführt und dokumentiert werden.');
  if(linked.some(item=>key(item.serialNumber)!==key(row.serialNumber)))add('serialNumber','disposalSerial','Die Seriennummer stimmt nicht mit dem verknüpften Entsorgungsauftrag überein.');
  if(policy.disposalResolutionIds.includes(solution?.id)&&!linked.some(item=>item.status==='completed'&&key(item.serialNumber)===key(row.serialNumber)))add('disposal','disposalMissing','Für diese Lösung ist ein durchgeführter Entsorgungsauftrag erforderlich.');
 }
 return {ok:issues.length===0,issues,disposalCheck:{linked:linked.length>0,pending:linked.some(item=>item.status!=='completed'),matchingCompleted:linked.some(item=>item.status==='completed'&&key(item.serialNumber)===key(row.serialNumber)),mismatched:linked.some(item=>key(item.serialNumber)!==key(row.serialNumber))},requirements:{fields:policy.completionRequiredFields,replacementSerial:policy.requireReplacementSerialOnExchange&&exchange,disposal:policy.requireCompletedDisposal,protectClosed:policy.protectClosedReturns},disposals};
}
