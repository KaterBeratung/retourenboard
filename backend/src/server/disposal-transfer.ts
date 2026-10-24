import {InputError} from '../shared/model.js';
import {requirePermission} from './permissions.js';
import {validateDisposalRecord,createDisposalHistoryCheck,disposalText as text} from '../shared/disposals.js';
const requireImport=(user:any)=>{for(const key of ['disposalsRead','disposalsImport','disposalsCreate'] as const)requirePermission(user,key);};
const fields=['id','disposalNumber','productId','returnId','productName','sku','manufacturer','serialNumber','serialKey','mode','status','revision','details','createdAt','updatedAt'];
function validateEntry(user:any,entry:any){
 validateDisposalRecord(entry);if(['approved','completed'].includes(entry.status))requirePermission(user,'disposalsApprove');if(entry.status==='completed')requirePermission(user,'disposalsComplete');
 if(!Array.isArray(entry.events)||entry.events.length<1||entry.events.length>10000)throw new InputError('Der Auftragsverlauf fehlt oder ist zu groß.');
 const history=createDisposalHistoryCheck(entry);for(const event of entry.events){history.add(event);if(['approved','completed'].includes(event.snapshot.status))requirePermission(user,'disposalsApprove');if(event.snapshot.status==='completed')requirePermission(user,'disposalsComplete');}history.finish();
}
export async function exportDisposals(store:any,user:any){requirePermission(user,'disposalsRead');requirePermission(user,'disposalsExport');return store.transaction(async()=>{await store.db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');const rows=(await store.db.query('SELECT * FROM disposals ORDER BY id LIMIT 5001')).rows;if(rows.length>5000)throw new InputError('Für größere Bestände bitte die Vollsicherung verwenden.');const items=[];
 for(const row of rows)items.push({...row,details:JSON.parse(row.details),events:(await store.db.query('SELECT * FROM disposal_events WHERE disposalId=$1 ORDER BY id',[row.id])).rows.map((e:any)=>({...e,snapshot:JSON.parse(e.snapshot)}))});return {format:'retourenboard-disposals',version:1,items};});
}
export async function importDisposals({store,user,data,commit=false,now=Date.now}:any){
 requireImport(user);if(!data||data.format!=='retourenboard-disposals'||data.version!==1||Object.keys(data).sort().join(',')!=='format,items,version'||!Array.isArray(data.items)||data.items.length<1||data.items.length>5000)throw new InputError('Bitte einen gültigen Geräteauftrag-Export mit 1 bis 5.000 Einträgen wählen.');
 const numbers=new Set<string>(),counts:any={planned:0,approved:0,completed:0,cancelled:0};for(const entry of data.items){validateEntry(user,entry);if(numbers.has(entry.disposalNumber))throw new InputError('Der Export enthält doppelte Auftragsnummern.');numbers.add(entry.disposalNumber);counts[entry.status]++;}
 try{return await store.transaction(async()=>{
  for(const number of numbers)if((await store.db.query('SELECT 1 FROM disposals WHERE disposalNumber=$1',[number])).rowCount)throw new InputError('Eine Auftragsnummer aus dieser Datei ist bereits vorhanden. Es wurde nichts importiert.',409);
  const active=new Set<string>();for(const entry of data.items)if(['planned','approved'].includes(entry.status)){if(active.has(entry.serialKey)||(await store.db.query("SELECT 1 FROM disposals WHERE serialKey=$1 AND status IN ('planned','approved')",[entry.serialKey])).rowCount)throw new InputError('Für diese Gerätekennung existiert bereits ein offener Auftrag.',409);active.add(entry.serialKey);}
  const linked=new Map();for(const entry of data.items){const candidate=entry.details.returnNumber?await store.findReturn(text(entry.details.returnNumber,'Retourennummer',100)):null;if(candidate&&candidate.serialNumber===entry.serialNumber)linked.set(entry.disposalNumber,candidate.id);}
  for(const recordId of [...new Set<number>(linked.values())].sort((a,b)=>a-b))await store.db.query('SELECT id FROM returns WHERE id=$1 FOR UPDATE',[recordId]);
  for(const entry of data.items){const ret=linked.has(entry.disposalNumber)?await store.getReturn(linked.get(entry.disposalNumber)):null;if(ret?.isClosed&&['planned','approved'].includes(entry.status))throw new InputError('Offene Entsorgungsaufträge dürfen nicht mit abgeschlossenen Retouren verknüpft werden.',409);}
  if(!commit)return {count:data.items.length,counts};
  for(const entry of data.items){
   const product=entry.sku?await store.findProduct(entry.sku):null,ret=linked.has(entry.disposalNumber)?await store.getReturn(linked.get(entry.disposalNumber)):null;
   const id=(await store.db.query("SELECT nextval(pg_get_serial_sequence($1,'id')) AS id",[store.db.schema+'.disposals'])).rows[0].id,at=new Date(now()).toISOString();
   const row:any=Object.fromEntries(fields.map(key=>[key,entry[key]]));Object.assign(row,{id,productId:product?.id??null,returnId:ret?.serialNumber===entry.serialNumber?ret.id:null,revision:entry.revision+1,updatedAt:at,details:{...entry.details,importedAt:at,importedByName:user.displayName}});validateDisposalRecord(row);
   await store.db.query('INSERT INTO disposals('+fields.join(',')+') VALUES('+fields.map((_,i)=>'$'+(i+1)).join(',')+')',fields.map(key=>key==='details'?JSON.stringify(row.details):row[key]));
   for(const original of entry.events){const snapshot={...original.snapshot,id,productId:row.productId,returnId:row.returnId};await store.db.query('INSERT INTO disposal_events(disposalId,revision,action,actorId,actorName,createdAt,snapshot) VALUES($1,$2,$3,NULL,$4,$5,$6)',[id,original.revision,original.action,original.actorName,original.createdAt,JSON.stringify(snapshot)]);}
   await store.db.query('INSERT INTO disposal_events(disposalId,revision,action,actorId,actorName,createdAt,snapshot) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,row.revision,'import',user.id,user.displayName,at,JSON.stringify(row)]);
   await store.recordChange?.({entity:'disposals',id,action:'import',after:{...row,...row.details}});
  }return {imported:data.items.length};
 });}catch(error){if((error as any).code==='23505')throw new InputError('Eine Auftragsnummer oder Gerätekennung ist bereits vorhanden. Es wurde nichts importiert.',409);throw error;}
}
