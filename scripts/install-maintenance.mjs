import {lstatSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

function read(file){try{const s=lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.size>32768)throw Error('Ungültiger Wartungsstatus.');return readFileSync(file,'utf8');}catch(error){if(error.code==='ENOENT')return null;throw error;}}
// A manual installer may reconcile only its own transaction. A later in-app
// update must remain owned by the updater and cannot be bypassed here.
export function installerOwnsMaintenance(dataDir,stateDir){
 try{
  const text=read(join(stateDir,'install-transaction.json'));if(!text)return false;const j=JSON.parse(text);
  if(j.format!==1||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(j.id)||!['staging','prepared','activating','database-committed','forward-required','committed','rolledBack'].includes(j.phase))return false;
  let marker=read(join(dataDir,'.update-maintenance'));if(marker?.startsWith('"'))marker=JSON.parse(marker);
  const transaction=read(join(stateDir,'transaction.json')),tx=transaction?JSON.parse(transaction):null;
  if(marker!==null&&marker!==j.id||tx&&tx.id!==j.id)return false;
  if(['committed','rolledBack'].includes(j.phase))return (marker!==null||!!tx)&&(!tx||tx.phase==='committed'&&j.phase==='committed');
  return true;
 }catch{return false;}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))process.exitCode=installerOwnsMaintenance(process.argv[2],process.argv[3])?0:1;
