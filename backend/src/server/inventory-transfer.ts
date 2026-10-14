import {PRODUCT_COLUMNS,RETURN_COLUMNS,PRODUCT_REFS,RETURN_REFS,InputError} from '../shared/model.js';
import {INVENTORY_FORMAT,parseInventoryFile,type InventoryRow} from '../shared/inventory-file.js';
import {normalizeImportReferences} from './import-dependencies.js';
import {nameKey} from './migrate.js';
import {prepareProductImage,saveProductImage} from './product-images.js';

type Options={duplicates:'skip'|'update'|'error';createMissingMasterdata:boolean};
type Row={kind:'products'|'returns';line:number;data:InventoryRow;action:'create'|'update'|'skip';id?:number};
const pick=(item:InventoryRow,keys:string[])=>Object.fromEntries(keys.filter(key=>Object.hasOwn(item,key)).map(key=>[key,item[key]]));
const productKeys=Object.keys(PRODUCT_COLUMNS).filter(key=>key!=='price').concat('priceCents');
const returnKeys=Object.keys(RETURN_COLUMNS).filter(key=>key!=='productName');
const metadata=(item:InventoryRow)=>pick(item,['createdAt','updatedAt']);
const historical={allowArchivedReferences:true,allowArchivedProduct:true,allowArchivedAssignee:true};
function mergeFields(old:InventoryRow|null,input:InventoryRow,refs:Record<string,string>){
  const values={...old,...input};
  for(const field of Object.keys(refs))if(Object.hasOwn(input,field))delete values[field+'Id'];
  return values;
}
export function exportInventory(store:any){
  const products=store.listProducts(),returns=store.listReturns(),referenced=new Set<number>();
  for(const [items,refs]of [[products,PRODUCT_REFS],[returns,RETURN_REFS]]as const)for(const item of items)for(const field of Object.keys(refs))if(item[field+'Id'])referenced.add(item[field+'Id']);
  const masterdata=[...referenced].map(id=>store.masters.get(id)).map(item=>pick(item,['kind','name','active','isClosed','tone']));
  const imageQuery=store.db.prepare('SELECT originalName,data FROM product_images WHERE productId=?');
  const result={format:INVENTORY_FORMAT,formatVersion:1,currency:'EUR',exportedAt:new Date().toISOString(),products:products.map((item:any)=>{
    const stored=imageQuery.get(item.id),image=stored?{name:stored.originalName,data:Buffer.from(stored.data).toString('base64')}:null;
    prepareProductImage(image);
    return {...pick(item,productKeys),...metadata(item),image};
  }),returns:returns.map((item:any)=>({...pick(item,returnKeys),...metadata(item)})),masterdata};
  // Every exported file must fit the same validated, portable import contract.
  parseInventoryFile(JSON.stringify(result));
  return result;
}
function writePreview(store:any,table:'products'|'returns',data:InventoryRow,id?:number){
  const values={...data,updatedAt:new Date().toISOString(),...(!id?{createdAt:new Date().toISOString()}:{}),...(table==='products'?{active:Number(data.active)}:{})};
  const keys=Object.keys(values);
  if(id){store.db.prepare(`UPDATE ${table} SET ${keys.map(key=>key+'=?').join(',')} WHERE id=?`).run(...Object.values(values),id);return id;}
  return Number(store.db.prepare(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`).run(...Object.values(values)).lastInsertRowid);
}
function run(store:any,text:string,options:Options,commit:boolean){
  const file=parseInventoryFile(text);
  if(!['skip','update','error'].includes(options.duplicates)||typeof options.createMissingMasterdata!=='boolean')throw new InputError('Ungültige Importoptionen.');
  const rows:Row[]=[],errors:{line:number;message:string}[]=[],newMasterdata:InventoryRow[]=[],masters=store.listMasterData();
  const needed=new Map<string,{kind:string;name:string}>();
  for(const [items,refs,kind]of [[file.products,PRODUCT_REFS,'products'],[file.returns,RETURN_REFS,'returns']]as const)for(const source of items){
    if(options.duplicates==='skip'&&(kind==='products'&&store.findProduct(source.sku.trim())||kind==='returns'&&store.findReturn(source.returnNumber.trim())))continue;
    const input=normalizeImportReferences(store,kind,{...source},masters);
    for(const [field,list]of Object.entries(refs)){const name=input[field];if(typeof name==='string'&&name.trim()&&!masters[list].some((item:any)=>nameKey(item.name)===nameKey(name)))needed.set(list+':'+nameKey(name),{kind:list,name:name.trim()});}
  }
  if(options.createMissingMasterdata)for(const item of needed.values()){
    const source=file.masterdata.find(master=>master.kind===item.kind&&nameKey(master.name)===nameKey(item.name));
    const values={name:item.name,...(source?pick(source,['active','isClosed','tone']):{})};
    if(commit)store.createMasterData(item.kind,values);else store.masters.create(item.kind,values);
    newMasterdata.push(item);
  }
  const currentMasters=store.listMasterData();
  let line=0;
  for(const source of file.products){
    line++;
    try{
      const input=normalizeImportReferences(store,'products',pick(source,productKeys.concat('image')),currentMasters),old=store.findProduct(source.sku.trim()),image=prepareProductImage(input.image);
      if(old&&options.duplicates==='skip'){rows.push({kind:'products',line,data:old,action:'skip',id:old.id});continue;}
      if(old&&options.duplicates==='error')throw new InputError('Artikelnummer existiert bereits. Aktualisierung ausdrücklich aktivieren.');
      const values=mergeFields(old,input,PRODUCT_REFS),prepared=store.prepareProduct(values,old?.id,historical);
      let saved;
      if(commit)saved=old?store.updateProduct(old.id,values,historical):store.createProduct(values,{...historical,...metadata(source)});
      else{const id=writePreview(store,'products',prepared,old?.id);saveProductImage(store.db,id,image);saved=store.getProduct(id);}
      rows.push({kind:'products',line,data:saved,action:old?'update':'create',id:old?.id});
    }catch(error){if(!(error instanceof InputError))throw error;errors.push({line,message:error.message});}
  }
  for(const source of file.returns){
    line++;
    try{
      const input=normalizeImportReferences(store,'returns',pick(source,returnKeys),currentMasters),old=store.findReturn(source.returnNumber.trim());
      if(old&&options.duplicates==='skip'){rows.push({kind:'returns',line,data:old,action:'skip',id:old.id});continue;}
      if(old&&options.duplicates==='error')throw new InputError('Retourennummer existiert bereits. Aktualisierung ausdrücklich aktivieren.');
      const product=store.findProduct(source.sku.trim());if(!product)throw new InputError('Artikelnummer ist unbekannt.');
      const values=mergeFields(old,{...input,productId:product.id},RETURN_REFS),prepared=store.prepareReturn(values,old?.id,historical);
      const saved=commit?(old?store.updateReturn(old.id,values,historical):store.createReturn(values,{...historical,...metadata(source)})):store.getReturn(writePreview(store,'returns',prepared,old?.id));
      rows.push({kind:'returns',line,data:saved,action:old?'update':'create',id:old?.id});
    }catch(error){if(!(error instanceof InputError))throw error;errors.push({line,message:error.message});}
  }
  const counts=(items:Row[])=>({created:items.filter(row=>row.action==='create').length,updated:items.filter(row=>row.action==='update').length,skipped:items.filter(row=>row.action==='skip').length});
  return {kind:'all',total:file.products.length+file.returns.length,rows,errors,...counts(rows),products:counts(rows.filter(row=>row.kind==='products')),returns:counts(rows.filter(row=>row.kind==='returns')),newMasterdata,masterdataCreated:newMasterdata.length};
}
export function previewInventoryImport(store:any,text:string,options:Options){
  store.db.exec('SAVEPOINT inventory_transfer_preview');
  try{return run(store,text,options,false);}finally{store.db.exec('ROLLBACK TO inventory_transfer_preview; RELEASE inventory_transfer_preview');}
}
export function commitInventoryImport(store:any,text:string,options:Options,authorize:(preview:ReturnType<typeof run>)=>void){
  // Validate and authorize the complete plan before audited writes are performed.
  return store.transaction(()=>{
    const preview=previewInventoryImport(store,text,options);
    if(preview.errors.length)throw new InputError(`Import abgebrochen: ${preview.errors.length} fehlerhafte Einträge. ${preview.errors[0].message}`);
    authorize(preview);
    const result=run(store,text,options,true);
    if(result.errors.length)throw new InputError('Der Bestand hat sich geändert. Bitte Vorschau erneut prüfen.',409);
    return {created:result.created,updated:result.updated,skipped:result.skipped,products:result.products,returns:result.returns,masterdataCreated:result.masterdataCreated};
  });
}
