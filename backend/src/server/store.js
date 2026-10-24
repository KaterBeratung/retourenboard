import {assertReturnCompletion,returnCompletionState} from './return-completion.js';
import {validateProduct,validateReturn,InputError,PRODUCT_REFS,RETURN_REFS} from '../shared/model.js';
import {createMasterDataRepository} from './masterdata.js';
import {checkReturnFields,defaultRules,dueDate,isOverdue} from './return-rules.js';
import {prepareProductImage,saveProductImage} from './product-images.js';
import {migratePostgres} from './database/migrations.js';
import {TABLE_CONTRACTS} from './database/schema.js';
import {syncReturnSerialSearch} from './database/serial-search.js';
import {serialKey} from '../shared/serial-number.js';
import {returnPageQuery} from './return-search.js';
import {checkRecordRevision,advanceRecordRevision,ensureRecordMetadata} from './database/record-metadata.js';
export async function createStore({database:db}){
 await migratePostgres(db);const masters=createMasterDataRepository(db);let rules=()=>defaultRules,clock={now:Date.now};
 const productQuery='SELECT p.*,v.revision,i.revision AS imageVersion,i.originalName AS imageName FROM products p JOIN product_versions v ON v.productId=p.id LEFT JOIN product_images i ON i.productId=p.id';
 const joinQuery='SELECT r.*,v.revision,v.priceSnapshotCents AS priceCents,v.priceSnapshotSource,v.priceCapturedAt,p.name AS productName,p.sku,p.ean,p.priceCents AS catalogPriceCents,i.revision AS imageVersion,i.originalName AS imageName,COALESCE(u.displayName,r.assignedDisplayName) AS assignedName FROM returns r JOIN products p ON p.id=r.productId JOIN return_versions v ON v.returnId=r.id LEFT JOIN product_images i ON i.productId=p.id LEFT JOIN users u ON u.id=r.assignedUserId AND u.deletedAt IS NULL';
 async function displayRows(rows,refs){
  const all=await masters.all(),lookup=new Map(Object.values(all).flat().map(row=>[row.id,row])),config=refs===RETURN_REFS?await rules():null;
  return rows.map(row=>{const result={...row};if(!result.imageVersion){delete result.imageVersion;delete result.imageName;}if(refs===PRODUCT_REFS)result.active=!!row.active;for(const field of Object.keys(refs))result[field]=lookup.get(row[field+'Id'])?.name??'';
   if(refs===RETURN_REFS){result.assignedDisplayName=row.assignedName;delete result.assignedName;const status=lookup.get(row.statusId);result.isClosed=!!status?.isClosed;result.statusTone=status?.tone??'neutral';result.dueDate=dueDate(row.receiptDate,config.deadlineDays);result.overdue=isOverdue(result,config,clock);}return result;});
 }
 function failMissing(value){if(!value)throw new InputError('Eintrag wurde nicht gefunden.',404);return value;}
 async function sqlAction(job){try{return await job();}catch(error){if(error.code==='23505')throw new InputError('Artikelnummer oder Retourennummer ist bereits vorhanden.',409);throw error;}}
 async function save(table,data,id,metadata={}){
  const now=new Date().toISOString(),values={...data,updatedAt:!id?metadata.updatedAt??now:now};if(!id)values.createdAt=metadata.createdAt??now;if(table==='products')values.active=Number(values.active);
  const keys=Object.keys(values),parameters=Object.values(values),contract=TABLE_CONTRACTS.find(item=>item.name===table);if(!contract||keys.some(key=>!contract.columns.some(column=>column.name===key)))throw new Error('Unbekanntes Datenbankfeld.');
  if(id)await sqlAction(()=>db.query(`UPDATE ${table} SET ${keys.map((key,i)=>key+'=$'+(i+1)).join(',')} WHERE id=$${keys.length+1}`,[...parameters,id]));
  else id=(await sqlAction(()=>db.query(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING id`,parameters))).rows[0].id;
  if(table==='returns')await syncReturnSerialSearch(db,id);return id;
 }
 async function resolveFields(input,refs,existing,options={}){
  const result={};for(const [field,kind]of Object.entries(refs)){const key=field+'Id';let value;
   if(Object.hasOwn(input,key)&&input[key]!==undefined){value=input[key];if(value==='')value=null;else if(typeof value==='string'&&/^\d+$/.test(value))value=Number(value);if(value!==null&&(typeof value!=='number'||!Number.isSafeInteger(value)||value<1))throw new InputError('Ungültige Auswahl.');}
   else if(Object.hasOwn(input,field))value=input[field];else if(existing)value=existing[key];
   const item=await masters.resolve(kind,value,existing?.[key],refs===RETURN_REFS&&field!=='supplier',options.allowArchivedReferences===true);result[key]=item?.id??null;result[field]=item?.name??'';
  }return result;
 }
 const store={db,masters,setRules:(getRules,newClock={now:Date.now})=>{rules=getRules;clock=newClock;},
  listMasterData:()=>masters.all(),createMasterData:(kind,input)=>masters.create(kind,input),updateMasterData:(id,input)=>masters.update(id,input),deleteMasterData:id=>masters.remove(id),
  async listProducts(){return displayRows((await db.query(productQuery+' ORDER BY p.createdAt DESC,p.id DESC')).rows,PRODUCT_REFS);},
  async getProduct(id){return (await displayRows((await db.query(productQuery+' WHERE p.id=$1',[id])).rows,PRODUCT_REFS))[0]??null;},
  async findProduct(sku){return (await displayRows((await db.query(productQuery+' WHERE p.sku=$1',[sku])).rows,PRODUCT_REFS))[0]??null;},
  async listReturns(){return displayRows((await db.query(joinQuery+' ORDER BY r.createdAt DESC,r.id DESC')).rows,RETURN_REFS);},
  async pageReturns(query){
   const page=returnPageQuery(query);if(!page)return null;
   return db.transaction(async()=>{
    await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const total=Number((await db.query('SELECT COUNT(*) AS total FROM returns r JOIN products p ON p.id=r.productId LEFT JOIN users u ON u.id=r.assignedUserId AND u.deletedAt IS NULL'+page.joins+page.where,page.values)).rows[0].total);
    const items=await displayRows((await db.query(joinQuery+page.joins+page.where+' ORDER BY '+page.order+` LIMIT $${page.values.length+1} OFFSET $${page.values.length+2}`,[...page.values,page.pageSize,(page.page-1)*page.pageSize])).rows,RETURN_REFS);
    return {items,total,page:page.page,pageSize:page.pageSize};
   });
  },
  async lookupReturnSerial(value,excludeId){
   const key=serialKey(value),params=excludeId?[key,excludeId]:[key],clause=`(r.id IN(SELECT returnId FROM return_serial_search WHERE serialKey=$1 UNION SELECT returnId FROM return_serial_search WHERE replacementKey=$1))${excludeId?' AND r.id<>$2':''}`;
   return db.transaction(async()=>{
    await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const total=Number((await db.query('SELECT COUNT(*) AS n FROM returns r WHERE '+clause,params)).rows[0].n);
    const rows=(await db.query(joinQuery+' LEFT JOIN masterdata s ON s.id=r.statusId WHERE '+clause+' ORDER BY COALESCE(s.isClosed,0),r.id DESC LIMIT 50',params)).rows;
    return {items:await displayRows(rows,RETURN_REFS),total};
   });
  },
  async getReturn(id){return (await displayRows((await db.query(joinQuery+' WHERE r.id=$1',[id])).rows,RETURN_REFS))[0]??null;},
  async findReturn(number){return (await displayRows((await db.query(joinQuery+' WHERE r.returnNumber=$1',[number])).rows,RETURN_REFS))[0]??null;},
  async prepareProduct(input,id,options={}){if(id)await db.query('SELECT id FROM products WHERE id=$1 FOR UPDATE',[id]);const old=id?failMissing(await store.getProduct(id)):null,refs=await resolveFields(input,PRODUCT_REFS,old,options);return {...validateProduct({...input,...refs}),...refs};},
  async prepareReturn(input,id,options={}){
   if(id)await db.query('SELECT id FROM returns WHERE id=$1 FOR UPDATE',[id]);
   const productId=typeof input.productId==='number'||typeof input.productId==='string'&&/^\d+$/.test(input.productId.trim())?Number(input.productId):NaN;
   if(!Number.isSafeInteger(productId)||productId<1)throw new InputError('Bitte ein Produkt auswählen.');
   const old=id?failMissing(await store.getReturn(id)):null,p=failMissing(await store.getProduct(productId));if(!p.active&&old?.productId!==p.id&&options.allowArchivedProduct!==true)throw new InputError('Archivierte Produkte können keine neuen Retouren erhalten.');
   const values={...input};for(const field of ['quantity','replacementSerialNumber','assignedUserId','nextStep'])if(old&&!Object.hasOwn(values,field))values[field]=old[field];if(!old&&!Object.hasOwn(values,'supplier')&&!Object.hasOwn(values,'supplierId'))values.supplierId=(await masters.get(p.supplierId))?.active?p.supplierId:null;
   const refs=await resolveFields(values,RETURN_REFS,old,options),allMasters=await masters.all(),choices=Object.fromEntries(Object.entries(allMasters).map(([key,items])=>[key,items.map(item=>item.name)])),config=await rules();checkReturnFields({...values,...refs},{...config,requiredFields:config.requiredFields.filter(field=>field!=='serialNumber')});
   const data=validateReturn({...values,...refs},choices,{requireSerialNumber:!old||Boolean(old.serialNumber.trim())});let assignedDisplayName='';if(data.assignedUserId!==null){if(old?.assignedUserId===data.assignedUserId)assignedDisplayName=old.assignedDisplayName;else{const account=(await db.query('SELECT active,displayName FROM users WHERE id=$1 AND deletedAt IS NULL',[data.assignedUserId])).rows[0];if(!account)throw new InputError('Zuständiges Konto nicht gefunden.');if(!account.active&&options.allowArchivedAssignee!==true)throw new InputError('Nur aktive Konten können neu zugeordnet werden.');assignedDisplayName=account.displayName;}}
   const prepared={...data,...refs,assignedDisplayName};await assertReturnCompletion(store,prepared,old,config,allMasters,options);return prepared;
  },
  async inspectReturnCompletion(recordId,input){const row=failMissing(await store.getReturn(recordId));return returnCompletionState(store,{...row,...input},await rules());},
  async getRules(){return rules();},
  async createProduct(input,options={}){const image=prepareProductImage(input.image);return store.transaction(async()=>{const id=await save('products',await store.prepareProduct(input,undefined,options),undefined,options);await ensureRecordMetadata(db,'products',id);await saveProductImage(db,id,image);return store.getProduct(id);});},
  async updateProduct(id,input,options={}){const image=prepareProductImage(input.image);return store.transaction(async()=>{await checkRecordRevision(db,'products',id,options.expectedRevision??input.revision);await save('products',await store.prepareProduct(input,id,options),id);await saveProductImage(db,id,image);await advanceRecordRevision(db,'products',id);return store.getProduct(id);});},
  async deleteProduct(id,options={}){return store.transaction(async()=>{await checkRecordRevision(db,'products',id,options.expectedRevision);if((await db.query('SELECT id FROM returns WHERE productId=$1 LIMIT 1',[id])).rows.length){await db.query('UPDATE products SET active=0,updatedAt=$1 WHERE id=$2',[new Date().toISOString(),id]);await advanceRecordRevision(db,'products',id);return {archived:true};}await db.query('DELETE FROM products WHERE id=$1',[id]);return {archived:false};});},
  async createReturn(input,options={}){return store.transaction(async()=>{const data=await store.prepareReturn(input,undefined,options),now=new Date().toISOString();await db.query('SELECT id FROM products WHERE id=$1 FOR SHARE',[data.productId]);data.returnNumber=data.returnNumber||null;const id=await save('returns',data,undefined,options);await ensureRecordMetadata(db,'returns',id,{priceSnapshot:options.priceSnapshot,source:options.priceSnapshotSource});if(!data.returnNumber){let number=`${(await rules()).numberPrefix}-${now.slice(0,4)}-${String(id).padStart(6,'0')}`;while(await store.findReturn(number))number+='A';await db.query('UPDATE returns SET returnNumber=$1 WHERE id=$2',[number,id]);}return store.getReturn(id);});},
  async updateReturn(id,input,options={}){return store.transaction(async()=>{await checkRecordRevision(db,'returns',id,options.expectedRevision??input.revision);const data=await store.prepareReturn(input,id,options);delete data.returnNumber;await save('returns',data,id);await advanceRecordRevision(db,'returns',id);return store.getReturn(id);});},
  async deleteReturn(id,options={}){return store.transaction(async()=>{await checkRecordRevision(db,'returns',id,options.expectedRevision);await db.query('DELETE FROM returns WHERE id=$1',[id]);return {deleted:true};});},
  transaction:job=>db.transaction(job),onCommit:job=>db.onCommit(job),onRollback:job=>db.onRollback(job),close:()=>db.close()
 };return store;
}
