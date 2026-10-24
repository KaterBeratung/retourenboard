import {InputError} from '../shared/model.js';
import {DISPOSAL_MODES,DISPOSAL_STATUSES,disposalText as text,disposalDate,serialKey,validateDisposalRecord} from '../shared/disposals.js';
import {hasPermission,type PermissionKey} from '../shared/permissions.js';
export function createDisposals({store,now=Date.now,timezone=async()=>'Europe/Berlin'}:any){
 const db=store.db;
 const right=(user:any,key:PermissionKey)=>{if(!hasPermission(user,'disposalsRead')||!hasPermission(user,key))throw new InputError('Du hast keine Berechtigung für diese Aktion.',403);};
 const id=(value:any,optional=false)=>{if(optional&&(value===undefined||value===null||value===''))return null;if(!(typeof value==='number'||typeof value==='string'&&/^\d+$/.test(value))||!Number.isSafeInteger(Number(value))||Number(value)<1)throw new InputError('Ungültige ID.');return Number(value);};
 const object=(input:any,allowed:string[])=>{if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!allowed.includes(key)))throw new InputError('Ungültige Auftragsangaben.');return input;};
 const parsed=(row:any)=>row?{...row,details:JSON.parse(row.details)}:null;
 async function get(recordId:any,lock=false){const row=parsed((await db.query('SELECT * FROM disposals WHERE id=$1'+(lock?' FOR UPDATE':''),[id(recordId)])).rows[0]);if(!row)throw new InputError('Geräteauftrag nicht gefunden.',404);return row;}
 async function event(user:any,action:string,row:any,before:any=null){
  validateDisposalRecord(row);await db.query('INSERT INTO disposal_events(disposalId,revision,action,actorId,actorName,createdAt,snapshot) VALUES($1,$2,$3,$4,$5,$6,$7)',[row.id,row.revision,action,user.id,user.displayName,row.updatedAt,JSON.stringify(row)]);
  await store.recordChange?.({entity:'disposals',id:row.id,action,before:before?{...before,...before.details}:null,after:{...row,...row.details}});
 }
 async function persist(user:any,action:string,row:any,before:any){row.revision++;row.updatedAt=new Date(now()).toISOString();validateDisposalRecord(row);await db.query('UPDATE disposals SET productName=$1,sku=$2,manufacturer=$3,serialNumber=$4,serialKey=$5,mode=$6,status=$7,revision=$8,details=$9,updatedAt=$10 WHERE id=$11',[row.productName,row.sku,row.manufacturer,row.serialNumber,row.serialKey,row.mode,row.status,row.revision,JSON.stringify(row.details),row.updatedAt,row.id]);await event(user,action,row,before);return row;}
 async function translateConflict(job:()=>Promise<any>){try{return await job();}catch(error){if((error as any).code==='23505')throw new InputError('Für diese Gerätekennung existiert bereits ein offener Auftrag.',409);throw error;}}
 const createFields=['productId','returnId','productName','sku','manufacturer','serialNumber','mode','notes','reason','location','ownerReference'];
 async function device(input:any){
  let productId=id(input.productId,true),returnId=id(input.returnId,true);if(returnId)await db.query('SELECT id FROM returns WHERE id=$1 FOR UPDATE',[returnId]);const ret=returnId?await store.getReturn(returnId):null;
  if(returnId&&!ret)throw new InputError('Retoure nicht gefunden.',404);if(ret?.isClosed)throw new InputError('Die Retoure ist abgeschlossen. Bitte vor dem Anlegen eines Entsorgungsauftrags wieder öffnen.',409);
  if(ret){if(productId&&productId!==ret.productId)throw new InputError('Produkt und Retoure passen nicht zusammen.');productId=ret.productId;if(input.serialNumber&&serialKey(text(input.serialNumber,'Seriennummer / Gerätekennung'))!==serialKey(ret.serialNumber))throw new InputError('Die Seriennummer muss zur Retoure passen.');}
  const product=productId?await store.getProduct(productId):null;if(productId&&!product)throw new InputError('Produkt nicht gefunden.',404);
  if(typeof input.mode!=='string'||!Object.hasOwn(DISPOSAL_MODES,input.mode))throw new InputError('Bitte eine gültige Maßnahme auswählen.');
  return {productId,returnId,productName:text(product?.name??input.productName,'Gerätebezeichnung',250,true),sku:text(product?.sku??input.sku,'Artikelnummer'),manufacturer:text(product?.manufacturer??input.manufacturer,'Hersteller'),serialNumber:text(ret?.serialNumber??input.serialNumber,'Seriennummer / Gerätekennung',250,true),mode:input.mode};
 }
 return {
  async list(user:any,query:any={}){right(user,'disposalsRead');const where:string[]=[],params:any[]=[],search=text(query.search,'Suche',250),status=query.status??'',mode=query.mode??'';
   if(status&&!Object.hasOwn(DISPOSAL_STATUSES,status)||mode&&!Object.hasOwn(DISPOSAL_MODES,mode))throw new InputError('Ungültiger Auftragsfilter.');
   if(search){params.push('%'+search.replace(/[!%_]/g,c=>'!'+c)+'%');where.push(`(disposalNumber ILIKE $${params.length} ESCAPE '!' OR serialNumber ILIKE $${params.length} ESCAPE '!' OR productName ILIKE $${params.length} ESCAPE '!' OR sku ILIKE $${params.length} ESCAPE '!')`);}
   if(query.number!==undefined){const number=text(query.number,'Auftragsnummer',100,true);if(!/^DIS-\d{4}-\d{6,16}$/.test(number))throw new InputError('Ungültige Auftragsnummer.');params.push(number);where.push('disposalNumber=$'+params.length);}if(mode){params.push(mode);where.push('mode=$'+params.length);}if(query.returnId){params.push(id(query.returnId));where.push('returnId=$'+params.length);}
   const base=where.length?' WHERE '+where.join(' AND '):'',counts:any={all:0,planned:0,approved:0,completed:0,cancelled:0};for(const row of(await db.query('SELECT status,COUNT(*) AS n FROM disposals'+base+' GROUP BY status',params)).rows){counts[row.status]=row.n;counts.all+=row.n;}
   if(status){params.push(status);where.push('status=$'+params.length);}const page=Number(query.page??1);if(!Number.isSafeInteger(page)||page<1||page>100000)throw new InputError('Ungültige Seite.');
   const items=(await db.query('SELECT * FROM disposals'+(where.length?' WHERE '+where.join(' AND '):'')+' ORDER BY id DESC LIMIT 50 OFFSET $'+(params.length+1),[...params,(page-1)*50])).rows.map(parsed);return {items,counts,total:status?counts[status]:counts.all,page,pageSize:50};
  },
  async details(user:any,recordId:any){right(user,'disposalsRead');const row=await get(recordId);return {...row,events:(await db.query('SELECT e.id,e.disposalId,e.revision,e.action,e.actorId,COALESCE(u.displayName,e.actorName) AS actorName,e.createdAt,e.snapshot FROM disposal_events e LEFT JOIN users u ON u.id=e.actorId AND u.deletedAt IS NULL WHERE e.disposalId=$1 ORDER BY e.id',[row.id])).rows.map((e:any)=>({...e,snapshot:JSON.parse(e.snapshot)}))};},
  async create(user:any,input:any){right(user,'disposalsCreate');object(input,createFields);return translateConflict(()=>store.transaction(async()=>{
   const values=await device(input),at=new Date(now()).toISOString(),recordId=(await db.query("SELECT nextval(pg_get_serial_sequence($1,'id')) AS id",[db.schema+'.disposals'])).rows[0].id;
   const details={notes:text(input.notes,'Notizen',4000),reason:text(input.reason,'Grund',500),location:text(input.location,'Lagerort',500),ownerReference:text(input.ownerReference,'Referenz',500),createdByName:user.displayName,...(values.returnId?{returnNumber:(await store.getReturn(values.returnId)).returnNumber}:{})};
   const row:any={id:recordId,disposalNumber:'DIS-'+at.slice(0,4)+'-'+String(recordId).padStart(6,'0'),...values,serialKey:serialKey(values.serialNumber),status:'planned',revision:1,details,createdAt:at,updatedAt:at};
   validateDisposalRecord(row);const keys=Object.keys(row);await db.query('INSERT INTO disposals('+keys.join(',')+') VALUES('+keys.map((_,i)=>'$'+(i+1)).join(',')+')',keys.map(key=>key==='details'?JSON.stringify(details):row[key]));await event(user,'create',row);return row;
  }));},
  async change(user:any,recordId:any,action:string,input:any){const permission=action==='update'?'disposalsEdit':action==='approve'?'disposalsApprove':action==='cancel'?'disposalsEdit':'disposalsComplete';right(user,permission);object(input,action==='update'?[...createFields,'revision']:action==='approve'?['revision']:action==='cancel'?['revision','reason']:['revision','completedOn','method','performedBy','correctionReason']);
   return translateConflict(()=>store.transaction(async()=>{const before=await get(recordId,true),row=structuredClone(before);if(input.revision!==row.revision)throw new InputError('Der Auftrag wurde inzwischen geändert. Bitte erneut öffnen.',409);
    if(action==='update'){if(row.status!=='planned')throw new InputError('Nur vorgemerkte Aufträge können bearbeitet werden.',409);const values=await device({...row,...row.details,...input});if(values.productId!==row.productId||values.returnId!==row.returnId)throw new InputError('Die Verknüpfung kann nach dem Anlegen nicht geändert werden.');Object.assign(row,values,{serialKey:serialKey(values.serialNumber)});for(const field of ['notes','reason','location','ownerReference'])if(Object.hasOwn(input,field))row.details[field]=text(input[field],field,field==='notes'?4000:500);}
    else if(action==='approve'){if(row.status!=='planned')throw new InputError('Dieser Auftrag kann nicht freigegeben werden.',409);row.status='approved';Object.assign(row.details,{approvedAt:new Date(now()).toISOString(),approvedByName:user.displayName});}
    else if(action==='cancel'){if(!['planned','approved'].includes(row.status))throw new InputError('Dieser Auftrag kann nicht storniert werden.',409);row.status='cancelled';Object.assign(row.details,{cancellationReason:text(input.reason,'Stornierungsgrund',500,true),cancelledAt:new Date(now()).toISOString(),cancelledByName:user.displayName});}
    else if(action==='complete'||action==='correct'){if(row.status!==(action==='complete'?'approved':'completed'))throw new InputError('Für diese Aktion ist eine Freigabe bzw. ein abgeschlossener Auftrag erforderlich.',409);
     if(action==='correct'){right(user,'disposalsEdit');row.details.correctionReason=text(input.correctionReason,'Korrekturgrund',500,true);}
     const completedOn=disposalDate(input.completedOn),today=new Intl.DateTimeFormat('en-CA',{timeZone:await timezone(),year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now()));if(completedOn>today)throw new InputError('Das Durchführungsdatum darf nicht in der Zukunft liegen.');
     Object.assign(row.details,{completedOn,method:text(input.method,'Verfahren',500,true),performedBy:text(input.performedBy,'Ausführende Person / Dienstleister',250,true),documentedAt:new Date(now()).toISOString(),documentedByName:user.displayName});row.status='completed';
    }else throw new InputError('Unbekannte Auftragsaktion.');return persist(user,action,row,before);
   }));
  },
  async label(user:any,recordId:any,kind:string){right(user,'disposalsExport');if(!['order','certificate'].includes(kind))throw new InputError('Ungültige Druckansicht.');const row=await get(recordId);validateDisposalRecord(row);if(kind==='certificate'&&row.status!=='completed')throw new InputError('Ein Nachweis ist erst nach dokumentierter Durchführung verfügbar.',409);return {...row,kind};}
 };
}
