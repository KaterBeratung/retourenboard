import {createHash,randomBytes} from 'node:crypto';
import {InputError} from '../shared/model.js';
import {hasPermission} from '../shared/permissions.js';

export const CUSTOMER_STATUS_TOKEN=/^[A-Za-z0-9_-]{22}$/;
const defaults={showProduct:true,showUpdated:true,showPublicNote:true};
const unavailable=()=>new InputError('Dieser Link ist nicht verfügbar oder abgelaufen.',404);
const digest=(token:string)=>createHash('sha256').update(token).digest('hex');
const grantColumns='tokenHash AS "tokenHash",tokenEnc AS "tokenEnc",publicNote AS "publicNote",expiresAt,revision,creatorId AS "creatorId",createdAt,updatedAt,options,publishedComments AS "publishedComments"';
const publishableText=(text:string)=>text.replace(/(?<![\w@])@[A-Za-z0-9._-]{3,64}/g,'@Team');
const commentVersion=(row:any)=>createHash('sha256').update(JSON.stringify([row.text,row.createdAt,row.editedAt??''])).digest('hex');
function visibility(value:any){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!Object.hasOwn(defaults,key)||typeof value[key]!=='boolean'))throw new InputError('Ungültige Auswahl der sichtbaren Inhalte.');
 return {...defaults,...value};
}
export function createCustomerStatus({store,users,secrets,now=Date.now,kind='returns'}:any){
 const db=store.db,disposal=kind==='disposals',records=disposal?'disposals':'returns',grants=disposal?'disposal_shares':'return_shares',commentsTable=disposal?'disposal_comments':'return_comments',key=disposal?'disposalId':'returnId',permission=disposal?'disposalsShare':'returnsShare',columns=key+','+grantColumns;
 const aad=(id:number)=>disposal?'disposal:'+id:String(id);
 function right(user:any){if(!hasPermission(user,permission))throw new InputError('Du hast keine Berechtigung für diese Aktion.',403);}
 async function returned(id:number){const row=disposal?(await db.query('SELECT * FROM disposals WHERE id=$1',[id])).rows[0]:await store.getReturn(id);if(!row)throw new InputError(disposal?'Geräteauftrag nicht gefunden.':'Retoure nicht gefunden.',404);return row;}
 async function creatorAllowed(grant:any){if(!grant?.creatorId)return false;const user=await users.get(grant.creatorId);return Boolean(user&&user.active&&!user.deletedAt&&hasPermission(user,permission));}
 function current(grant:any){return Boolean(grant?.tokenHash&&grant.expiresAt>now());}
 async function liveComments(id:number,grant:any){
  const saved=grant?.publishedComments??[];if(!saved.length)return [];
  const existing=new Set((await db.query('SELECT id FROM '+commentsTable+' WHERE '+key+'=$1 AND deleted=0 AND id=ANY($2::bigint[])',[id,saved.map((c:any)=>c.id)])).rows.map((c:any)=>c.id));
  return saved.filter((c:any)=>existing.has(c.id));
 }
 function preview(row:any,grant:any,comments:any[]=[],full=false){
  const options=full?defaults:grant?.options??defaults;
  const core=disposal?{recordKind:'disposal',disposalNumber:row.disposalNumber,status:({planned:'Vorgemerkt',approved:'Freigegeben',completed:'Durchgeführt',cancelled:'Storniert'} as Record<string,string>)[row.status],statusKey:row.status,statusTone:({planned:'received',approved:'checking',completed:'done',cancelled:'neutral'} as Record<string,string>)[row.status],isClosed:['completed','cancelled'].includes(row.status)}:{returnNumber:row.returnNumber,status:row.status,statusTone:['received','checking','working','done','neutral','warning','danger'].includes(row.statusTone)?row.statusTone:'neutral',isClosed:Boolean(row.isClosed)};
  return {...core,
   ...(options.showProduct?{productName:row.productName}:{}),
   ...(options.showUpdated?{updatedAt:grant?.updatedAt>row.updatedAt?grant.updatedAt:row.updatedAt}:{}),
   ...(options.showPublicNote?{publicNote:grant?.publicNote??''}:{}),
   ...(comments.length?{comments:comments.map(({text,createdAt}:any)=>({text,createdAt}))}:{})};
 }
 async function presentation(row:any,grant:any){
  const active=current(grant)&&await creatorAllowed(grant);let path:string|null=null;
  if(active){try{const token=secrets.decrypt('customer-share',aad(row.id),grant.tokenEnc);if(CUSTOMER_STATUS_TOKEN.test(token)&&digest(token)===grant.tokenHash)path=(disposal?'/d/':'/s/')+token;}catch{/* Renewing creates a new grant if its separate encryption key was lost. */}}
  const comments=await liveComments(row.id,grant);
  return {active,revision:grant?.revision??0,expiresAt:grant?.expiresAt?new Date(grant.expiresAt).toISOString():null,path,publicNote:grant?.publicNote??'',options:grant?.options??{...defaults},selectedComments:comments,preview:preview(row,grant,comments,true)};
 }
 function revision(value:any){if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)throw new InputError('Ungültiger Freigabestand. Bitte erneut öffnen.');return value;}
 function input(data:any){
  const days=data.days??30,note=data.publicNote??'';
  if(![7,30,90].includes(days))throw new InputError('Bitte 7, 30 oder 90 Tage wählen.');
  if(typeof note!=='string'||note.length>1000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(note))throw new InputError('Öffentlicher Hinweis: maximal 1.000 Zeichen erlaubt.');
  const options=Object.hasOwn(data,'options')?visibility(data.options):undefined;
  const ids=Object.hasOwn(data,'commentIds')?data.commentIds:undefined;
  if(ids!==undefined&&(!Array.isArray(ids)||ids.length>20||ids.some((id:any)=>!Number.isSafeInteger(id)||id<1)||new Set(ids).size!==ids.length))throw new InputError('Bitte höchstens 20 gültige Kommentare auswählen.');
  const versions=data.commentVersions??{};
  if(!versions||typeof versions!=='object'||Array.isArray(versions)||Object.keys(versions).length>20||Object.entries(versions).some(([key,value])=>!Number.isSafeInteger(Number(key))||Number(key)<1||typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value)))throw new InputError('Ungültiger Kommentarstand.');
  return {days,note:note.trim(),options,ids,versions};
 }
 async function selection(id:number,grant:any,ids:number[]|undefined,versions:Record<string,string>){
  if(ids===undefined)return liveComments(id,grant);
  if(!ids.length)return [];
  const rows=(await db.query('SELECT id,text,createdAt,editedAt FROM '+commentsTable+' WHERE '+key+'=$1 AND deleted=0 AND id=ANY($2::bigint[]) ORDER BY id FOR SHARE',[id,ids])).rows;
  if(rows.length!==ids.length)throw new InputError('Ein ausgewählter Kommentar ist nicht mehr verfügbar. Bitte erneut laden.');
  const saved=new Map((grant?.publishedComments??[]).map((c:any)=>[c.id,c]));
  return rows.map((row:any)=>{
   if(saved.has(row.id))return saved.get(row.id);
   if(versions[row.id]!==commentVersion(row))throw new InputError('Ein Kommentar wurde seit der Vorschau geändert. Bitte erneut laden und prüfen.',409);
   if(row.text.length>4000)throw new InputError('Der ausgewählte Kommentar ist zu lang. Bitte intern kürzen.');
   return {id:row.id,text:publishableText(row.text),createdAt:row.createdAt};
  });
 }
 return {
  async read(user:any,id:number){right(user);const row=await returned(id),grant=(await db.query('SELECT '+columns+' FROM '+grants+' WHERE '+key+'=$1',[id])).rows[0];return presentation(row,grant);},
  async commentChoices(user:any,id:number,before?:string,ids?:string){
   right(user);await returned(id);
   if(before!==undefined&&(!/^[1-9]\d*$/.test(before)||!Number.isSafeInteger(Number(before))))throw new InputError('Ungültiger Kommentarstand.');
   let chosen:number[]|undefined;
   if(ids!==undefined){if(before!==undefined||typeof ids!=='string'||ids.length>1000||!/^\d+(,\d+)*$/.test(ids))throw new InputError('Ungültiger Kommentarstand.');chosen=ids.split(',').map(Number);if(chosen.length>50||chosen.some(n=>!Number.isSafeInteger(n)||n<1)||new Set(chosen).size!==chosen.length)throw new InputError('Ungültiger Kommentarstand.');}
   const rows=(await db.query('SELECT id,text,createdAt,editedAt FROM '+commentsTable+' WHERE '+key+'=$1 AND deleted=0'+(chosen?' AND id=ANY($2::bigint[])':before?' AND id<$2':'')+' ORDER BY id DESC LIMIT 51',chosen?[id,chosen]:before?[id,Number(before)]:[id])).rows;
   return {items:rows.slice(0,50).map((c:any)=>({id:c.id,text:publishableText(c.text),createdAt:c.createdAt,version:commentVersion(c)})),hasMore:rows.length>50};
  },
  async write(user:any,id:number,method:string,data:any){
   right(user);const expected=revision(data.revision),values=method==='DELETE'?null:input(data);
   return store.transaction(async()=>{
    if(!(await db.query('SELECT id FROM '+records+' WHERE id=$1 FOR UPDATE',[id])).rowCount)throw new InputError('Retoure nicht gefunden.',404);
    const grant=(await db.query('SELECT '+columns+' FROM '+grants+' WHERE '+key+'=$1 FOR UPDATE',[id])).rows[0];
    if(expected!==(grant?.revision??0))throw new InputError('Die Freigabe wurde inzwischen geändert. Bitte erneut öffnen.',409);
    if(method==='PUT'&&(!current(grant)||!await creatorAllowed(grant)))throw new InputError('Die Freigabe ist nicht mehr aktiv. Bitte einen neuen Kundenlink erstellen.',409);
    const options=values?.options??grant?.options??{...defaults},comments=values?await selection(id,grant,values.ids,values.versions):[];
    const next=(grant?.revision??0)+1,at=new Date(now()).toISOString();
    const token=method==='POST'?randomBytes(16).toString('base64url'):null;
    const hash=method==='DELETE'?null:token?digest(token):grant.tokenHash;
    const enc=method==='DELETE'?'':token?secrets.encrypt('customer-share',aad(id),token,true):grant.tokenEnc;
    const expires=values?now()+values.days*86400000:0;
    await db.query(`INSERT INTO ${grants}(${key},tokenHash,tokenEnc,publicNote,expiresAt,revision,creatorId,createdAt,updatedAt,options,publishedComments)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$10) ON CONFLICT(${key}) DO UPDATE SET tokenHash=EXCLUDED.tokenHash,tokenEnc=EXCLUDED.tokenEnc,publicNote=EXCLUDED.publicNote,expiresAt=EXCLUDED.expiresAt,revision=EXCLUDED.revision,creatorId=EXCLUDED.creatorId,updatedAt=EXCLUDED.updatedAt,options=EXCLUDED.options,publishedComments=EXCLUDED.publishedComments`,[id,hash,enc,values?.note??'',expires,next,method==='DELETE'?null:user.id,at,JSON.stringify(options),JSON.stringify(comments)]);
    await store.recordChange?.({entity:disposal?'disposalCustomerStatus':'customerStatus',id,action:method==='DELETE'?'revoke':method==='POST'?'share':'update',before:grant?{active:current(grant),expiresAt:grant.expiresAt}:null,after:{active:method!=='DELETE',expiresAt:expires}});
    return this.read(user,id);
   });
  },
  async publicRead(token:string){
   if(!CUSTOMER_STATUS_TOKEN.test(token))throw unavailable();
   const grant=(await db.query('SELECT '+columns+' FROM '+grants+' WHERE tokenHash=$1',[digest(token)])).rows[0];
   if(!current(grant)||!await creatorAllowed(grant))throw unavailable();
   let row;try{row=await returned(grant[key]);}catch(error:any){if(error.status===404)throw unavailable();throw error;}
   return preview(row,grant,await liveComments(row.id,grant));
  }
 };
}

// Fixed window limiter, bounded in both retained entries and lifetime.
export function customerStatusLimiter(now=Date.now){
 const buckets=new Map<string,{start:number;count:number}>();
 return (ip:string)=>{const at=now();for(const [key,bucket]of buckets)if(at-bucket.start>=60000)buckets.delete(key);let bucket=buckets.get(ip);if(!bucket){if(buckets.size>=10000)return 60;bucket={start:at,count:0};buckets.set(ip,bucket);}bucket.count++;return bucket.count>60?Math.max(1,Math.ceil((60000-(at-bucket.start))/1000)):0;};
}
