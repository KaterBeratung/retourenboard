import {InputError} from '../shared/model.js';
import {serialKey} from '../shared/serial-number.js';

const sorts={createdAt:'r.createdAt',receiptDate:'r.receiptDate',returnNumber:'r.returnNumber',serialNumber:'r.serialNumber',productName:'p.name',statusId:'r.statusId'};
const fields=['page','pageSize','search','statusId','reasonId','assignedUserId','sort','direction'];
export function returnPageQuery(query:URLSearchParams){
 if(!fields.some(field=>query.has(field)))return null;
 for(const field of fields)if(query.getAll(field).length>1)throw new InputError('Ungültiger Retourenfilter.');
 const integer=(field:string,fallback:number,max:number)=>{const value=query.get(field);if(value===null)return fallback;if(!/^[1-9]\d*$/.test(value)||!Number.isSafeInteger(Number(value))||Number(value)>max)throw new InputError('Ungültige Retourenseite.');return Number(value);};
 const page=integer('page',1,1000000),pageSize=integer('pageSize',50,500),sort=query.get('sort')??'createdAt',direction=query.get('direction')??'desc';
 if(!Object.hasOwn(sorts,sort)||!['asc','desc'].includes(direction))throw new InputError('Ungültige Retourensortierung.');
 const where:string[]=[],values:any[]=[];let joins='';
 const bind=(value:any)=>{values.push(value);return '$'+values.length;};
 for(const field of ['statusId','reasonId','assignedUserId'])if(query.has(field)){
  const value=query.get(field);if(field==='assignedUserId'&&value==='unassigned'){where.push('r.assignedUserId IS NULL');continue;}
  where.push('r.'+field+'='+bind(integer(field,0,Number.MAX_SAFE_INTEGER)));
 }
 const search=query.get('search')??'';if(search.length>250||/[\u0000-\u001f\u007f]/.test(search))throw new InputError('Ungültiger Suchtext.');
 if(search.trim()){
  joins=' LEFT JOIN masterdata search_supplier ON search_supplier.id=r.supplierId LEFT JOIN masterdata search_reason ON search_reason.id=r.reasonId';
  const escape=(value:string)=>'%'+value.replace(/[!%_]/g,c=>'!'+c)+'%',text=bind(escape(search.trim())),serial=bind(escape(serialKey(search)));
  where.push(`(${['r.returnNumber','p.name','p.sku','p.ean','r.customerReference','r.trackingNumber','r.orderNumber','r.notes','r.nextStep',"COALESCE(search_supplier.name,'')","COALESCE(search_reason.name,'')",'COALESCE(u.displayName,r.assignedDisplayName)'].map(field=>`${field} ILIKE ${text} ESCAPE '!'`).join(' OR ')} OR EXISTS(SELECT 1 FROM return_serial_search k WHERE k.returnId=r.id AND (k.serialKey LIKE ${serial} ESCAPE '!' OR k.replacementKey LIKE ${serial} ESCAPE '!')))`);
 }
 return {page,pageSize,joins,where:where.length?' WHERE '+where.join(' AND '):'',values,order:`${sorts[sort as keyof typeof sorts]} ${direction.toUpperCase()},r.id ${direction.toUpperCase()}`};
}
