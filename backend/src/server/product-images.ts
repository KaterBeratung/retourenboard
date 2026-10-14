import {randomUUID} from 'node:crypto';
import {extname} from 'node:path';
import type {DatabaseSync} from 'node:sqlite';
import {InputError} from '../shared/model.js';
import {MAX_INVENTORY_SINGLE_IMAGE_BYTES} from '../shared/inventory-file.js';

export const MAX_PRODUCT_IMAGE_BYTES=MAX_INVENTORY_SINGLE_IMAGE_BYTES;
const formats:Record<string,string>={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'};
// Images live in SQLite, so database snapshots and rollback include their bytes.
export function prepareProductImage(input:unknown){
  if(input===undefined||input===null)return input;
  if(typeof input!=='object'||Array.isArray(input))throw new InputError('Ungültiges Produktbild.');
  const {name,data}=input as Record<string,unknown>;
  if(typeof name!=='string'||!name.trim()||name.length>250||/[\x00-\x1f\x7f/\\]/.test(name)||!formats[extname(name).toLowerCase()])throw new InputError('Produktbilder müssen PNG, JPG, JPEG oder WebP sein.');
  if(typeof data!=='string'||data.length>Math.ceil(MAX_PRODUCT_IMAGE_BYTES/3)*4)throw new InputError('Produktbilder dürfen maximal 1 MB groß sein.',413);
  if(!data.length||data.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/.test(data))throw new InputError('Ungültiges Produktbild.');
  const bytes=Buffer.from(data,'base64');
  if(bytes.length>MAX_PRODUCT_IMAGE_BYTES)throw new InputError('Produktbilder dürfen maximal 1 MB groß sein.',413);
  if(bytes.toString('base64')!==data)throw new InputError('Ungültiges Produktbild.');
  let mediaType='';
  if(bytes.length>=33&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&bytes.toString('ascii',12,16)==='IHDR'&&bytes.readUInt32BE(16)>0&&bytes.readUInt32BE(20)>0)mediaType='image/png';
  else if(bytes.length>=4&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&bytes.at(-2)===255&&bytes.at(-1)===217)mediaType='image/jpeg';
  else if(bytes.length>=20&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'&&['VP8 ','VP8L','VP8X'].includes(bytes.toString('ascii',12,16)))mediaType='image/webp';
  if(!mediaType||mediaType!==formats[extname(name).toLowerCase()])throw new InputError('Dateiinhalt und Bildformat passen nicht zusammen.');
  return {name,mediaType,bytes};
}
export function saveProductImage(db:DatabaseSync,productId:number,image:ReturnType<typeof prepareProductImage>){
  if(image===undefined)return;
  if(image===null){db.prepare('DELETE FROM product_images WHERE productId=?').run(productId);return;}
  db.prepare(`INSERT INTO product_images(productId,originalName,mediaType,data,revision) VALUES(?,?,?,?,?)
    ON CONFLICT(productId) DO UPDATE SET originalName=excluded.originalName,mediaType=excluded.mediaType,data=excluded.data,revision=excluded.revision`)
    .run(productId,image.name,image.mediaType,image.bytes,randomUUID());
}
