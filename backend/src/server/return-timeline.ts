import {InputError} from '../shared/model.js';
import {hasPermission,type PermissionUser} from '../shared/permissions.js';
import type {TimelineItem} from './return-workflow.js';

export async function readReturnTimeline({store,encodeCursor,decodeCursor}:any,user:PermissionUser,returnId:number,query:URLSearchParams){
 if(!Number.isSafeInteger(returnId)||returnId<1)throw new InputError('Ungültige ID.');
 const ret=await store.getReturn(returnId);if(!ret)throw new InputError('Retoure nicht gefunden.',404);
 const limits=query.getAll('limit'),cursors=query.getAll('before');
 if(limits.length>1||cursors.length>1||limits.length&&!/^\d+$/.test(limits[0]))throw new InputError('Ungültige Verlaufsseite.');
 const limit=limits.length?Number(limits[0]):30;if(!Number.isInteger(limit)||limit<1||limit>100)throw new InputError('Der Verlauf muss 1 bis 100 Einträge pro Seite enthalten.');
 const before=cursors.length?decodeCursor(cursors[0],returnId):null;
 const numericStatus=(side:'before'|'after')=>`CASE WHEN jsonb_typeof(changes::jsonb#>'{statusId,${side}}')='number' THEN CASE WHEN (changes::jsonb#>>'{statusId,${side}}')::numeric BETWEEN 1 AND 9007199254740991 AND trunc((changes::jsonb#>>'{statusId,${side}}')::numeric)=(changes::jsonb#>>'{statusId,${side}}')::numeric THEN (changes::jsonb#>>'{statusId,${side}}')::numeric::bigint ELSE NULL END ELSE NULL END`;
 const attachmentSql=hasPermission(user,'attachmentsView')?`UNION ALL
  SELECT 'attachment:'||lpad(f.id::text,16,'0'),'attachment',f.createdAt,COALESCE(u.displayName,a.actorName,'System'),substr(f.originalName,1,250),NULL,NULL,NULL,NULL,NULL,f.id
  FROM attachments f LEFT JOIN audit a ON a.id=(SELECT MAX(x.id) FROM audit x WHERE x.entity='attachments' AND x.entityId=f.id::text AND x.action='create') LEFT JOIN users u ON u.id=a.actorId AND u.deletedAt IS NULL WHERE f.returnId=$3::bigint`:'';
 // Resolve labels by account identity while retaining the original event data.
 const sql=`WITH return_audit AS (
  SELECT a.id,a.createdAt,COALESCE(u.displayName,a.actorName) AS actorName,a.action,a.changes FROM audit a LEFT JOIN users u ON u.id=a.actorId AND u.deletedAt IS NULL WHERE a.entity='returns' AND a.entityId=$1 AND a.action IN ('create','update')
 ), timeline(eventId,type,at,actorName,text,fromStatus,toStatus,fromStatusId,toStatusId,commentId,attachmentId) AS (
  SELECT 'audit:'||lpad(id::text,16,'0')||':created','created',createdAt,actorName,substr(COALESCE(changes::jsonb#>>'{returnNumber,after}',$2),1,100),NULL::text,NULL::text,NULL::bigint,NULL::bigint,NULL::bigint,NULL::bigint FROM return_audit WHERE action='create'
  UNION ALL SELECT 'legacy:'||lpad(($3::bigint)::text,16,'0'),'created',$4::text,'System',$2,NULL,NULL,NULL,NULL,NULL,NULL WHERE NOT EXISTS(SELECT 1 FROM return_audit WHERE action='create')
  UNION ALL SELECT 'audit:'||lpad(id::text,16,'0')||':status','status',createdAt,actorName,substr(COALESCE(changes::jsonb#>>'{status,before}',''),1,250)||' → '||substr(COALESCE(changes::jsonb#>>'{status,after}',''),1,250),substr(changes::jsonb#>>'{status,before}',1,250),substr(changes::jsonb#>>'{status,after}',1,250),${numericStatus('before')},${numericStatus('after')},NULL,NULL FROM return_audit WHERE action='update' AND jsonb_typeof(changes::jsonb#>'{status,after}')='string'
  UNION ALL SELECT 'audit:'||lpad(id::text,16,'0')||':assignment','assignment',createdAt,actorName,substr(COALESCE(changes::jsonb#>>'{assignedDisplayName,after}','—'),1,100),NULL,NULL,NULL,NULL,NULL,NULL FROM return_audit WHERE jsonb_typeof(changes::jsonb->'assignedUserId')='object' AND (action='update' OR changes::jsonb#>>'{assignedUserId,after}' IS NOT NULL)
  UNION ALL SELECT 'audit:'||lpad(id::text,16,'0')||':nextStep','nextStep',createdAt,actorName,substr(COALESCE(changes::jsonb#>>'{nextStep,after}',''),1,500),NULL,NULL,NULL,NULL,NULL,NULL FROM return_audit WHERE jsonb_typeof(changes::jsonb#>'{nextStep,after}')='string' AND (action='update' OR changes::jsonb#>>'{nextStep,after}'<>'')
  UNION ALL SELECT 'comment:'||lpad(c.id::text,16,'0'),'comment',c.createdAt,COALESCE(u.displayName,'Gelöschtes Konto'),substr(c.text,1,4000),NULL,NULL,NULL,NULL,c.id,NULL FROM return_comments c LEFT JOIN users u ON u.id=c.authorId WHERE c.returnId=$3::bigint AND c.deleted=0
  ${attachmentSql}
 ) SELECT timeline.*,(SELECT a.changes::jsonb#>>'{reopenReason,after}' FROM return_audit a WHERE 'audit:'||lpad(a.id::text,16,'0')||':status'=timeline.eventId LIMIT 1) AS reopenReason FROM timeline ${before?'WHERE at<$6::text OR (at=$6::text AND eventId<$7::text)':''} ORDER BY at DESC,eventId DESC LIMIT $5::integer`;
 const rows=(await store.db.query(sql,[String(returnId),ret.returnNumber,returnId,ret.createdAt,limit+1,...(before?[before.at,before.id]:[])])).rows,page=rows.slice(0,limit);
 const items:TimelineItem[]=page.map((row:any)=>({id:row.eventId,type:row.type,at:row.at,actorName:String(row.actorName).slice(0,100),text:String(row.text??''),returnId,
  ...(row.commentId!==null?{commentId:Number(row.commentId)}:{}),...(row.attachmentId!==null?{attachmentId:Number(row.attachmentId)}:{}),
  ...(typeof row.reopenReason==='string'?{reopenReason:row.reopenReason}:{}),
  ...(row.type==='status'?{fromStatus:String(row.fromStatus??''),toStatus:String(row.toStatus??''),fromStatusId:typeof row.fromStatusId==='number'?row.fromStatusId:null,toStatusId:typeof row.toStatusId==='number'?row.toStatusId:null}:{})}));
 const last=page.at(-1);return {items,nextCursor:rows.length>limit&&last?encodeCursor({v:1,r:returnId,at:last.at,id:last.eventId}):null};
}
