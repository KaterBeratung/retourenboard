import {restoreBackup} from '../dist/server/backup-restore.js';
export {restoreBackup};
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {mkdirSync,rmSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {offlineDatabase,safetySnapshot,requireStopped} from './offline-database.mjs';
import {prepareBackup} from '../dist/server/backup-restore.js';
import {createActivation} from '../dist/server/migration/activation.js';
import {stageRestore} from '../dist/server/migration/restore-stage.js';
import {createStore} from '../dist/server/store.js';
import {readDatabaseConfig} from '../dist/server/database/config.js';
export async function applyBackup(options){
 return offlineDatabase(options,async context=>{
  const activation=createActivation({database:context.database,dataDir:context.dataDir,activeSchema:context.schema});
  await activation.recover();await activation.cleanup();
  const work=join(context.dataDir,'.operations','offline-'+randomUUID()),prepared=join(work,'prepared');mkdirSync(work,{recursive:true,mode:0o700});let staged,started=false;
  try{
   const summary=await prepareBackup({archive:options.archive,target:prepared,mfaKey:options.mfaKey,databaseConfig:context.config});
   if(!summary.administratorAccess)throw Error('Sicherung enthält keinen zugänglichen Administrator. Passenden MFA-Schlüssel bereitstellen oder zuerst eine separate Kontowiederherstellung planen.');
   await safetySnapshot(context,options.backup,options.binDir);
   const store=await createStore({database:context.database});const network=(await context.database.query('SELECT value FROM server_settings WHERE id=1')).rows[0];
   staged=await stageRestore({config:context.config,preparedDir:prepared,old:{store},activeNetwork:network?JSON.parse(network.value):{port:Number(process.env.PORT??3000)}});
   started=true;await activation.activate({schema:staged.schema,files:staged.files,kind:'restore'});await context.database.query('SELECT COUNT(*) FROM users');await activation.commit();await activation.cleanup();return summary;
  }catch(error){if(started){await activation.recover();await activation.cleanup();}if(staged&&activation.read()?.phase!=='committed')await context.database.query('DROP SCHEMA IF EXISTS "'+staged.schema+'" CASCADE');throw error;}
  finally{rmSync(work,{recursive:true,force:true});}
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),value=key=>args[args.indexOf(key)+1];
  try{
   const allowed=new Set(['--archive','--target','--mfa-key','--data-dir','--backup']);for(let i=0;i<args.length;i++){if(['--apply','--service-stopped','--confirm'].includes(args[i]))continue;if(!allowed.has(args[i])||!args[i+1]||args[i+1].startsWith('--'))throw Error('Ungültige Wiederherstellungsoption.');i++;}
   if(!args.includes('--archive'))throw Error('--archive ist erforderlich.');
   const options={archive:value('--archive'),databaseConfig:readDatabaseConfig(),mfaKey:args.includes('--mfa-key')?value('--mfa-key'):undefined};
   if(args.includes('--apply')){requireStopped(args);if(!args.includes('--data-dir')||!args.includes('--backup'))throw Error('--apply benötigt --data-dir und einen neuen --backup Ordner außerhalb davon.');await applyBackup({...options,dataDir:value('--data-dir'),backup:value('--backup')});console.log('PostgreSQL und Dateien wiederhergestellt. SMTP erneut konfigurieren; Dienst jetzt starten.');}
   else{if(!args.includes('--target'))throw Error('Für eine reine Prüfung --target LEERER_ORDNER angeben.');await restoreBackup({...options,target:value('--target')});console.log('Sicherung geprüft und vorbereitet. Zum Aktivieren --apply mit gestopptem Dienst verwenden.');}
  }catch(error){console.error(error.message);process.exitCode=1;}
}

