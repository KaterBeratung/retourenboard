import {AsyncLocalStorage} from 'node:async_hooks';
import type {SqlDatabase,SqlValue} from './database/types.js';
import type {Actor} from '../shared/types.js';
import {InputError} from '../shared/model.js';
import {createChanges,type Change} from './changes.js';
export function createAudit(store:any){
 const db:SqlDatabase=store.db,context=new AsyncLocalStorage<Actor>(),changes=createChanges(store);
 const record=(change:Change)=>changes.run(context.getStore()??{id:null,name:'System',source:'system'},change,()=>change.after??{});
 store.recordChange=record;
 for(const [method,entity,action,getter]of [
  ['createProduct','products','create','getProduct'],['updateProduct','products','update','getProduct'],['deleteProduct','products','delete','getProduct'],
  ['createReturn','returns','create','getReturn'],['updateReturn','returns','update','getReturn'],['deleteReturn','returns','delete','getReturn'],
  ['createMasterData','masterdata','create',''],['updateMasterData','masterdata','update',''],['deleteMasterData','masterdata','delete','']
 ]){
  const original=store[method];store[method]=async(...args:any[])=>store.transaction(async()=>{
   const before=action==='create'?null:getter?await store[getter](args[0]):await store.masters.get(args[0]);
   const result=await original(...args),id=action==='create'?result.id:args[0],after=action==='delete'?(getter?await store[getter](id):await store.masters.get(id)):result;
   await record({entity,id,action:action==='delete'&&after?'archive':action,before,after:method==='updateReturn'&&args[2]?.reopenReason?{...after,reopenReason:args[2].reopenReason}:after??{}});return result;
  });
 }
 return {context,record,
  async actors(){return (await db.query('SELECT a.actorId AS id,COALESCE(u.displayName,a.actorName) AS name FROM audit a JOIN (SELECT actorId,MAX(id) AS lastId FROM audit WHERE actorId IS NOT NULL GROUP BY actorId) latest ON a.id=latest.lastId LEFT JOIN users u ON u.id=a.actorId AND u.deletedAt IS NULL ORDER BY lower(COALESCE(u.displayName,a.actorName)),a.actorId')).rows;},
  async wrap<T>(actor:Actor,job:()=>T|Promise<T>):Promise<T>{return context.run(actor,job);},
  async list(query:Record<string,unknown>={}, {masterdataManage=false}:{masterdataManage?:boolean}={}){
   const page=Number(query.page??1),pageSize=Number(query.pageSize??25);
   if(!Number.isInteger(page)||page<1||page>100000||![10,25,50,100].includes(pageSize))throw new InputError('Ungültige Verlaufsseite.');
   const where:string[]=[],params:SqlValue[]=[],source='audit a LEFT JOIN users u ON u.id=a.actorId AND u.deletedAt IS NULL',actorName='COALESCE(u.displayName,a.actorName)',visibleChanges=masterdataManage?'a.changes':"CASE WHEN a.entity='masterdata' THEN (a.changes::jsonb - 'code' - 'notes')::text ELSE a.changes END";
   for(const field of ['entity','action','actorId','entityId'])if(query[field]!==undefined&&query[field]!==''){
    const value=String(query[field]);if(value.length>100||field==='actorId'&&!/^[1-9]\d*$/.test(value))throw new InputError('Ungültiger Filter.');params.push(value);where.push(`a.${field}=$${params.length}`);
   }
   for(const [field,comparison]of [['from','>='],['to','<=']])if(query[field]){
    const date=String(query[field]);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date)))throw new InputError('Ungültiges Filterdatum.');params.push(date+(field==='to'?'T23:59:59.999Z':'T00:00:00.000Z'));where.push(`a.createdAt${comparison}$${params.length}`);
   }
   if(query.query){const value=String(query.query);if(value.length>100)throw new InputError('Suchtext zu lang.');params.push('%'+value.replace(/[!%_]/g,c=>'!'+c)+'%');const n='$'+params.length;where.push(`(${actorName} ILIKE ${n} ESCAPE '!' OR a.actorName ILIKE ${n} ESCAPE '!' OR a.entityId ILIKE ${n} ESCAPE '!' OR ${visibleChanges} ILIKE ${n} ESCAPE '!')`);}
   const clause=where.length?' WHERE '+where.join(' AND '):'',total=Number((await db.query('SELECT COUNT(*) AS n FROM '+source+clause,params)).rows[0].n);
   const items=(await db.query('SELECT a.id,a.createdAt,a.actorId,'+actorName+' AS actorName,a.source,a.entity,a.entityId,a.action,a.operationId,'+visibleChanges+' AS changes FROM '+source+clause+` ORDER BY a.id DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`,[...params,pageSize,(page-1)*pageSize])).rows.map(row=>({...row,changes:JSON.parse(String(row.changes))}));
   return {items,total,page,pageSize};
  }
 };
}
