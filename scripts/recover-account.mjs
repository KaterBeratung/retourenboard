import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createStore} from '../dist/server/store.js';
import {createUsers} from '../dist/server/users.js';
import {createMfa} from '../dist/server/mfa.js';
import {createSecrets} from '../dist/server/secrets.js';
import {createAudit} from '../dist/server/audit.js';
import {offlineDatabase,safetySnapshot,requireStopped} from './offline-database.mjs';

export async function recoverAccount(options){
 return offlineDatabase(options,async context=>{
  const store=await createStore({database:context.database}),users=createUsers(store);
  const account=await users.credentialsByName(options.username);if(!account||account.deletedAt)throw Error('Konto nicht gefunden. Keine Änderung.');
  await safetySnapshot(context,options.backup,options.binDir);
  const audit=createAudit(store),mfa=createMfa({db:store.db,users,clock:{now:Date.now},secrets:createSecrets(context.dataDir),record:audit.record});
  await audit.wrap({id:null,name:'Offline-Kontowiederherstellung',source:'system'},()=>mfa.reset(account.id));
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2),options={};requireStopped(args);
  for(let i=0;i<args.length;i++){const flag=args[i];if(['--service-stopped','--confirm'].includes(flag))continue;if(!['--data-dir','--username','--backup'].includes(flag)||!args[i+1]||args[i+1].startsWith('--')||options[flag])throw Error('Verwendung: recover-account.mjs --data-dir ORDNER --username NAME --backup NEUER_ORDNER --service-stopped --confirm. PostgreSQL-Zugang über DATABASE_URL/_FILE.');options[flag]=args[++i];}
  if(!options['--username']||!options['--backup']||!options['--data-dir'])throw Error('Datenordner, Benutzername und neuer Sicherungsordner sind erforderlich.');
  await recoverAccount({dataDir:options['--data-dir'],username:options['--username'],backup:options['--backup']});
  console.log('PostgreSQL und Dateien gesichert. Nach Passwortanmeldung muss das Konto 2FA neu einrichten.');
 }catch(error){console.error(error.message);process.exitCode=1;}
}
