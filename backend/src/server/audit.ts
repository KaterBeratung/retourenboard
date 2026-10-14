import {AsyncLocalStorage} from 'node:async_hooks';
import type {DatabaseSync} from 'node:sqlite';
import type {Actor} from '../shared/types.js';
import {InputError} from '../shared/model.js';
import {createChanges,type Change} from './changes.js';
export function createAudit(store:any){
  const db:DatabaseSync=store.db,context=new AsyncLocalStorage<Actor>(),changes=createChanges(store);
  const record=(change:Change)=>changes.run(context.getStore()??{id:null,name:'System',source:'system'},change,()=>change.after??{});
  store.recordChange=record;
  for(const [method,entity,action,getter]of [
    ['createProduct','products','create','getProduct'],['updateProduct','products','update','getProduct'],['deleteProduct','products','delete','getProduct'],
    ['createReturn','returns','create','getReturn'],['updateReturn','returns','update','getReturn'],['deleteReturn','returns','delete','getReturn'],
    ['createMasterData','masterdata','create',''],['updateMasterData','masterdata','update',''],['deleteMasterData','masterdata','delete','']
  ]){
    const original=store[method];store[method]=(...args:any[])=>store.transaction(()=>{const before=action==='create'?null:getter?store[getter](args[0]):store.masters.get(args[0]);const result=original(...args);const id=action==='create'?result.id:args[0],after=action==='delete'?(getter?store[getter](id):store.masters.get(id)):result;record({entity,id,action:action==='delete'&&after?'archive':action,before,after:after??{}});return result;});
  }
  return {
    context,record,
    actors(){return db.prepare('SELECT a.actorId AS id,a.actorName AS name FROM audit a JOIN (SELECT actorId,MAX(id) AS lastId FROM audit WHERE actorId IS NOT NULL GROUP BY actorId) latest ON a.id=latest.lastId ORDER BY a.actorName COLLATE NOCASE,a.actorId').all();},
    wrap<T>(actor:Actor,job:()=>T):T{return context.run(actor,job);},
    list(query:Record<string,unknown>={}, {masterdataManage=false}:{masterdataManage?:boolean}={}){
      const page=Number(query.page??1),pageSize=Number(query.pageSize??25);if(!Number.isInteger(page)||page<1||page>100000||![10,25,50,100].includes(pageSize))throw new InputError('Ungültige Verlaufsseite.');
      const where:string[]=[],params:(string|number)[]=[];
      const visibleChanges=masterdataManage?'changes':"CASE WHEN entity='masterdata' THEN json_remove(changes,'$.code','$.notes') ELSE changes END";
      for(const field of ['entity','action','actorId','entityId'])if(query[field]!==undefined&&query[field]!==''){const value=String(query[field]);if(value.length>100)throw new InputError('Ungültiger Filter.');where.push(`${field}=?`);params.push(value);}
      for(const [field,comparison]of [['from','>='],['to','<=']])if(query[field]){const date=String(query[field]);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date)))throw new InputError('Ungültiges Filterdatum.');where.push(`createdAt${comparison}?`);params.push(date+(field==='to'?'T23:59:59.999Z':'T00:00:00.000Z'));}
      if(query.query){const value=String(query.query);if(value.length>100)throw new InputError('Suchtext zu lang.');where.push(`(actorName LIKE ? ESCAPE '!' OR entityId LIKE ? ESCAPE '!' OR ${visibleChanges} LIKE ? ESCAPE '!')`);const pattern='%'+value.replace(/[!%_]/g,c=>'!'+c)+'%';params.push(pattern,pattern,pattern);}
      const clause=where.length?' WHERE '+where.join(' AND '):'',total=Number(db.prepare('SELECT COUNT(*) AS n FROM audit'+clause).get(...params)!.n),items=db.prepare('SELECT id,createdAt,actorId,actorName,source,entity,entityId,action,operationId,'+visibleChanges+' AS changes FROM audit'+clause+' ORDER BY id DESC LIMIT ? OFFSET ?').all(...params,pageSize,(page-1)*pageSize).map(row=>({...row,changes:JSON.parse(String(row.changes))}));return {items,total,page,pageSize};
    }
  };
}
