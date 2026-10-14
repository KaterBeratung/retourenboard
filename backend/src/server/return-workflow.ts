import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {InputError} from '../shared/model.js';
import {hasPermission,type PermissionUser} from '../shared/permissions.js';

export type TimelineItem={id:string;type:'created'|'status'|'assignment'|'nextStep'|'comment'|'attachment';at:string;actorName:string;text:string;returnId:number;commentId?:number;attachmentId?:number;fromStatus?:string;toStatus?:string;fromStatusId?:number|null;toStatusId?:number|null};
type Cursor={v:1;r:number;at:string;id:string};
const selectionError=()=>new InputError('Bitte 1 bis 200 unterschiedliche Retouren mit gültigen IDs auswählen.');
function positiveId(value:unknown):number{
  if(typeof value!=='number'||!Number.isSafeInteger(value)||value<1)throw new InputError('Ungültige ID.');
  return value;
}
export function returnSelection(value:unknown):number[]{
  if(!Array.isArray(value)||value.length<1||value.length>200||value.some(n=>typeof n!=='number'||!Number.isSafeInteger(n)||n<1)||new Set(value).size!==value.length)throw selectionError();
  return value;
}

export function createReturnWorkflow({store,users,now=Date.now}:any){
  const db=store.db,cursorKey=randomBytes(32);
  type UndoRow={id:number;statusId:number;fingerprint:string;auditId:number};
  const undoTokens=new Map<string,{actorId:number;expires:number;rows:UndoRow[]}>();
  const statusRight=(user:PermissionUser)=>{if(!hasPermission(user,'returnsStatus'))throw new InputError('Du darfst den Retourenstatus nicht ändern.',403);};
  function revision(id:number){
    const raw=db.prepare('SELECT * FROM returns WHERE id=?').get(id);
    const auditId=Number(db.prepare("SELECT COALESCE(MAX(id),0) AS id FROM audit WHERE entity='returns' AND entityId=?").get(String(id)).id);
    return {fingerprint:JSON.stringify(raw??null),auditId};
  }
  function offerUndo(user:any,before:any[]){
    if(!before.length)return null;
    const token=randomBytes(32).toString('base64url'),expires=now()+12000;
    const rows:UndoRow[]=before.map(row=>({id:row.id,statusId:row.statusId,...revision(row.id)}));
    // Publish/consume tokens only with the outer database commit. A failed batch
    // never creates a usable token or consumes a token whose writes rolled back.
    store.onCommit(()=>{
      for(const [key,value] of undoTokens)if(value.expires<=now())undoTokens.delete(key);
      if(undoTokens.size>=2000)undoTokens.delete(undoTokens.keys().next().value!);
      undoTokens.set(token,{actorId:user.id,expires,rows});
    });
    return {token,expiresAt:new Date(expires).toISOString()};
  }
  function signature(payload:string){return createHmac('sha256',cursorKey).update('return-timeline:'+payload).digest('base64url');}
  function encodeCursor(cursor:Cursor){const payload=Buffer.from(JSON.stringify(cursor)).toString('base64url');return payload+'.'+signature(payload);}
  function decodeCursor(value:unknown,returnId:number):Cursor{
    try{
      if(typeof value!=='string'||value.length>500||!/^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/.test(value))throw new Error();
      const [payload,mac]=value.split('.'),expected=signature(payload);
      if(!timingSafeEqual(Buffer.from(mac),Buffer.from(expected)))throw new Error();
      const parsed=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));
      if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||Object.keys(parsed).sort().join(',')!=='at,id,r,v'||parsed.v!==1||parsed.r!==returnId||typeof parsed.at!=='string'||parsed.at.length>50||!Number.isFinite(Date.parse(parsed.at))||typeof parsed.id!=='string'||!/^(?:audit:\d{16}:(?:created|status|assignment|nextStep)|comment:\d{16}|attachment:\d{16}|legacy:\d{16})$/.test(parsed.id))throw new Error();
      return parsed;
    }catch{throw new InputError('Ungültige Verlaufsmarkierung. Bitte den Verlauf erneut öffnen.');}
  }
  function selected(ids:number[]){return ids.map(n=>{const ret=store.getReturn(n);if(!ret)throw new InputError('Retoure nicht gefunden.',404);return ret;});}
  return {
    enrichReturns(rows:any[]){
      // Completion is the most recent recorded transition into a closed state.
      // updatedAt also changes for notes/assignment and is never a substitute.
      const completions=db.prepare(`WITH state AS (
        SELECT entityId,createdAt,json_extract(changes,'$.isClosed.after') AS closed,
        ROW_NUMBER() OVER(PARTITION BY entityId ORDER BY id DESC) AS position
        FROM audit WHERE entity='returns' AND action='update'
        AND json_valid(changes) AND json_type(changes,'$.isClosed.after') IN ('true','false')
      ) SELECT entityId,createdAt FROM state WHERE position=1 AND closed=1`).all();
      const dates=new Map(completions.map((row:any)=>[Number(row.entityId),row.createdAt]));
      return rows.map(row=>({...row,completedAt:row.isClosed?dates.get(row.id)??null:null}));
    },
    assignees(){return users.list().filter((user:any)=>user.active).map(({id,username,displayName}:any)=>({id,username,displayName}));},
    selectedExport(query:URLSearchParams){
      const values=query.getAll('ids');
      if(!values.length)return store.listReturns();
      if(values.length!==1||values[0].length>4000||!/^\d+(,\d+)*$/.test(values[0]))throw selectionError();
      const ids=returnSelection(values[0].split(',').map(Number));
      return selected(ids);
    },
    bulkStatus(user:PermissionUser,input:any){
      statusRight(user);
      if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['ids','statusId'].includes(key)))throw selectionError();
      const ids=returnSelection(input.ids),statusId=positiveId(input.statusId);
      return store.transaction(()=>{
        store.masters.resolve('statuses',statusId,null,true);
        const returns=selected(ids);
        // Validate every row before the first audited write. The outer transaction
        // keeps later SQLite failures from leaving partial data or audit entries.
        const changed=returns.filter(ret=>ret.statusId!==statusId);
        for(const ret of changed)store.prepareReturn({...ret,statusId},ret.id);
        for(const ret of changed)store.updateReturn(ret.id,{...ret,statusId});
        return {items:selected(ids),updated:changed.length,undo:offerUndo(user,changed)};
      });
    },
    quickStatus(user:PermissionUser,returnId:number,input:any){
      statusRight(user);positiveId(returnId);
      if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==1||Object.keys(input).some(key=>!['status','statusId'].includes(key)))throw new InputError('Bitte ausschließlich den neuen Status angeben.');
      return store.transaction(()=>{
        const old=selected([returnId])[0],value={...old,...input};if(Object.hasOwn(input,'status'))delete value.statusId;
        const prepared=store.prepareReturn(value,returnId);
        if(prepared.statusId===old.statusId)return {...old,undo:null};
        const result=store.updateReturn(returnId,value);
        return {...result,undo:offerUndo(user,[old])};
      });
    },
    undoStatus(user:PermissionUser&{id?:number},input:any){
      statusRight(user);
      if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==1||typeof input.token!=='string'||! /^[A-Za-z0-9_-]{43}$/.test(input.token))throw new InputError('Ungültige Rückgängig-Aktion.');
      const pending=undoTokens.get(input.token);
      if(!pending||pending.expires<=now())throw new InputError('Rückgängig ist nicht mehr verfügbar. Bitte den aktuellen Status prüfen.',409);
      if(user.id!==pending.actorId)throw new InputError('Nur dein eigener Statuswechsel kann rückgängig gemacht werden.',403);
      return store.transaction(()=>{
        const rows=pending.rows.map(expected=>{
          const current=store.getReturn(expected.id),actual=revision(expected.id);
          if(!current||actual.fingerprint!==expected.fingerprint||actual.auditId!==expected.auditId)throw new InputError('Die Retoure wurde inzwischen geändert. Bitte den aktuellen Status prüfen.',409);
          const prepared=store.prepareReturn({...current,statusId:expected.statusId},current.id,{allowArchivedReferences:true});
          return {current,expected,prepared};
        });
        for(const {current,expected,prepared} of rows){
          // BEGIN IMMEDIATE plus the checked revision makes this compare-and-swap
          // atomic. Restore only status fields, and append the normal audit diff.
          const result=db.prepare('UPDATE returns SET statusId=?,status=?,updatedAt=? WHERE id=? AND statusId=? AND updatedAt=?').run(expected.statusId,prepared.status,new Date(now()).toISOString(),current.id,current.statusId,current.updatedAt);
          if(result.changes!==1)throw new InputError('Die Retoure wurde inzwischen geändert. Bitte den aktuellen Status prüfen.',409);
          store.recordChange({entity:'returns',id:current.id,action:'update',before:current,after:store.getReturn(current.id)});
        }
        store.onCommit(()=>undoTokens.delete(input.token));
        return {items:selected(pending.rows.map(row=>row.id)),updated:rows.length};
      });
    },
    timeline(user:PermissionUser,returnId:number,query:URLSearchParams){
      positiveId(returnId);const ret=store.getReturn(returnId);if(!ret)throw new InputError('Retoure nicht gefunden.',404);
      const limits=query.getAll('limit'),cursors=query.getAll('before');
      if(limits.length>1||cursors.length>1||limits.length&& !/^\d+$/.test(limits[0]))throw new InputError('Ungültige Verlaufsseite.');
      const limit=limits.length?Number(limits[0]):30;if(!Number.isInteger(limit)||limit<1||limit>100)throw new InputError('Der Verlauf muss 1 bis 100 Einträge pro Seite enthalten.');
      const before=cursors.length?decodeCursor(cursors[0],returnId):null;
      const attachmentSql=hasPermission(user,'attachmentsView')?`UNION ALL
        SELECT printf('attachment:%016d',f.id),'attachment',f.createdAt,COALESCE(a.actorName,'System'),substr(f.originalName,1,250),NULL,NULL,NULL,NULL,NULL,f.id
        FROM attachments f LEFT JOIN audit a ON a.id=(SELECT MAX(x.id) FROM audit x WHERE x.entity='attachments' AND x.entityId=CAST(f.id AS TEXT) AND x.action='create') WHERE f.returnId=:returnId`:'';
      // Each audit branch projects only the allowlisted field. No changes object,
      // account event, note, removed comment or removed file crosses this boundary.
      const sql=`WITH return_audit AS (
        SELECT id,createdAt,actorName,action,changes FROM audit
        WHERE entity='returns' AND entityId=:entityId AND action IN ('create','update') AND json_valid(changes)
      ), timeline(eventId,type,at,actorName,text,fromStatus,toStatus,fromStatusId,toStatusId,commentId,attachmentId) AS (
        SELECT printf('audit:%016d:created',id),'created',createdAt,actorName,substr(COALESCE(json_extract(changes,'$.returnNumber.after'),:returnNumber),1,100),NULL,NULL,NULL,NULL,NULL,NULL FROM return_audit WHERE action='create'
        UNION ALL SELECT printf('legacy:%016d',:returnId),'created',:createdAt,'System',:returnNumber,NULL,NULL,NULL,NULL,NULL,NULL WHERE NOT EXISTS(SELECT 1 FROM return_audit WHERE action='create')
        UNION ALL SELECT printf('audit:%016d:status',id),'status',createdAt,actorName,substr(COALESCE(json_extract(changes,'$.status.before'),''),1,250)||' → '||substr(COALESCE(json_extract(changes,'$.status.after'),''),1,250),substr(json_extract(changes,'$.status.before'),1,250),substr(json_extract(changes,'$.status.after'),1,250),json_extract(changes,'$.statusId.before'),json_extract(changes,'$.statusId.after'),NULL,NULL FROM return_audit WHERE action='update' AND json_type(changes,'$.status.after')='text'
        UNION ALL SELECT printf('audit:%016d:assignment',id),'assignment',createdAt,actorName,substr(COALESCE(json_extract(changes,'$.assignedDisplayName.after'),'—'),1,100),NULL,NULL,NULL,NULL,NULL,NULL FROM return_audit WHERE json_type(changes,'$.assignedUserId')='object' AND (action='update' OR json_extract(changes,'$.assignedUserId.after') IS NOT NULL)
        UNION ALL SELECT printf('audit:%016d:nextStep',id),'nextStep',createdAt,actorName,substr(COALESCE(json_extract(changes,'$.nextStep.after'),''),1,500),NULL,NULL,NULL,NULL,NULL,NULL FROM return_audit WHERE json_type(changes,'$.nextStep.after')='text' AND (action='update' OR json_extract(changes,'$.nextStep.after')<>'')
        UNION ALL SELECT printf('comment:%016d',c.id),'comment',c.createdAt,COALESCE(u.displayName,'Gelöschtes Konto'),substr(c.text,1,4000),NULL,NULL,NULL,NULL,c.id,NULL FROM return_comments c LEFT JOIN users u ON u.id=c.authorId WHERE c.returnId=:returnId AND c.deleted=0
        ${attachmentSql}
      ) SELECT * FROM timeline ${before?'WHERE at<:beforeAt OR (at=:beforeAt AND eventId<:beforeId)':''} ORDER BY at DESC,eventId DESC LIMIT :limit`;
      const params:any={returnId,entityId:String(returnId),returnNumber:ret.returnNumber,createdAt:ret.createdAt,limit:limit+1,...(before?{beforeAt:before.at,beforeId:before.id}:{})};
      const rows=db.prepare(sql).all(params),page=rows.slice(0,limit);
      const items:TimelineItem[]=page.map((row:any)=>({id:row.eventId,type:row.type,at:row.at,actorName:String(row.actorName).slice(0,100),text:String(row.text??''),returnId,
        ...(row.commentId!==null?{commentId:Number(row.commentId)}:{}),...(row.attachmentId!==null?{attachmentId:Number(row.attachmentId)}:{}),
        ...(row.type==='status'?{fromStatus:String(row.fromStatus??''),toStatus:String(row.toStatus??''),fromStatusId:typeof row.fromStatusId==='number'?row.fromStatusId:null,toStatusId:typeof row.toStatusId==='number'?row.toStatusId:null}:{})}));
      const last=page.at(-1);
      return {items,nextCursor:rows.length>limit&&last?encodeCursor({v:1,r:returnId,at:last.at,id:last.eventId}):null};
    }
  };
}
