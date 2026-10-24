import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {InputError} from './model.js';
export const BACKUP_LIMITS={maxFileBytes:1024**3,maxTotalBytes:2*1024**3,maxArchiveBytes:1024**3,maxFiles:100000};
export type BackupLimits=typeof BACKUP_LIMITS;
export function checkBackupSizes(sizes:number[],limits:BackupLimits=BACKUP_LIMITS){
  if(sizes.length>limits.maxFiles||sizes.some(size=>size>limits.maxFileBytes)||sizes.reduce((sum,size)=>sum+size,0)>limits.maxTotalBytes)throw new InputError('Sicherung überschreitet die unterstützten Grenzen (1 GiB pro Datei, 2 GiB insgesamt). Datenverzeichnis offline sichern.',503);
}
export async function sha256File(path:string){const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);return hash.digest('hex');}
