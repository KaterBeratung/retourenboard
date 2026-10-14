import {InputError,MASTER_KINDS} from './model.js';

export const INVENTORY_FORMAT='retourenboard.inventory';
export const MAX_INVENTORY_BYTES=32*1024*1024;
export const MAX_INVENTORY_IMAGES=1000;
export const MAX_INVENTORY_IMAGE_BYTES=20*1024*1024;
export const MAX_INVENTORY_SINGLE_IMAGE_BYTES=1024*1024;
export type InventoryRow=Record<string,any>;
export type InventoryFile={format:string;formatVersion:number;currency:string;products:InventoryRow[];returns:InventoryRow[];masterdata:InventoryRow[]};
const record=(value:unknown):value is InventoryRow=>!!value&&typeof value==='object'&&!Array.isArray(value);
export function isInventoryText(text:unknown):text is string{return typeof text==='string'&&text.replace(/^\uFEFF/,'').trimStart().startsWith('{');}
export function parseInventoryFile(text:string):InventoryFile{
  if(typeof text!=='string'||text.length>MAX_INVENTORY_BYTES||new TextEncoder().encode(text).byteLength>MAX_INVENTORY_BYTES)throw new InputError('Die Bestandsdatei darf maximal 32 MB groß sein.',413);
  let value:any;
  try{value=JSON.parse(text.replace(/^\uFEFF/,''));}catch{throw new InputError('Die Bestandsdatei enthält ungültiges JSON.');}
  if(!record(value)||value.format!==INVENTORY_FORMAT||value.formatVersion!==1)throw new InputError('Unbekanntes Format der Bestandsdatei.');
  if(value.currency!=='EUR')throw new InputError('Die Bestandsdatei muss Originalpreise in EUR enthalten.');
  if(!Array.isArray(value.products)||!Array.isArray(value.returns)||!value.products.every(record)||!value.returns.every(record))throw new InputError('Produkte und Retouren müssen gültige Listen sein.');
  if(value.products.length+value.returns.length>10000)throw new InputError('Maximal 10.000 Einträge pro Import.');
  const seen=new Set<string>(),numbers=new Set<string>();let imageCount=0,imageBytes=0;
  for(const product of value.products){
    if(typeof product.sku!=='string'||!product.sku.trim()||seen.has(product.sku.trim()))throw new InputError('Artikelnummern müssen vorhanden und eindeutig sein.');
    seen.add(product.sku.trim());
    if(product.image!==undefined&&product.image!==null){
      const image=product.image;
      if(!record(image)||Object.keys(image).some(key=>!['name','data'].includes(key))||typeof image.name!=='string'||!image.name.trim()||image.name.length>250||typeof image.data!=='string'||!image.data.length||image.data.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/.test(image.data))throw new InputError('Ungültiges Produktbild.');
      const bytes=image.data.length/4*3-(image.data.endsWith('==')?2:image.data.endsWith('=')?1:0);
      if(bytes>MAX_INVENTORY_SINGLE_IMAGE_BYTES)throw new InputError('Produktbilder dürfen maximal 1 MB groß sein.',413);
      imageCount++;imageBytes+=bytes;
      if(imageCount>MAX_INVENTORY_IMAGES||imageBytes>MAX_INVENTORY_IMAGE_BYTES)throw new InputError('Die Bestandsdatei darf maximal 1.000 Produktbilder mit insgesamt 20 MB enthalten.',413);
    }
  }
  for(const returned of value.returns){
    if(typeof returned.sku!=='string'||!seen.has(returned.sku.trim()))throw new InputError('Eine Retoure verweist auf ein Produkt, das in der Bestandsdatei fehlt.');
    if(typeof returned.returnNumber!=='string'||!returned.returnNumber.trim()||numbers.has(returned.returnNumber.trim()))throw new InputError('Retourennummern müssen vorhanden und eindeutig sein.');
    numbers.add(returned.returnNumber.trim());
  }
  for(const item of [...value.products,...value.returns])for(const field of ['createdAt','updatedAt'])if(item[field]!==undefined){
    if(typeof item[field]!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(item[field])||!Number.isFinite(Date.parse(item[field]))||new Date(item[field]).toISOString()!==item[field])throw new InputError('Ungültiger Zeitstempel in der Bestandsdatei.');
  }
  const masterdata=value.masterdata??[];
  if(!Array.isArray(masterdata)||masterdata.length>10000||!masterdata.every((item:any)=>record(item)&&Object.hasOwn(MASTER_KINDS,item.kind)&&typeof item.name==='string'&&item.name.trim()&&item.name.length<=250&&typeof item.active==='boolean'&&typeof item.isClosed==='boolean'&&['received','checking','working','done','neutral'].includes(item.tone)))throw new InputError('Ungültige Stammdaten in der Bestandsdatei.');
  return {format:value.format,formatVersion:1,currency:'EUR',products:value.products,returns:value.returns,masterdata};
}
